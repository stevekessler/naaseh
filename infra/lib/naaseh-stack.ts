import { ArnFormat, CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { createRegionalDataResources } from './global-data-stack.js';
import { attachSameOriginApi, createWebResources } from './web-stack.js';
import { createApplicationApi } from './api-stack.js';
import { createLogGroups, createOperationalVisibility } from './observability-stack.js';
import { createBackupResources } from './backup-stack.js';
import { createProfileMediaResources } from './media-stack.js';
import { createRecoveryKeys } from './recovery-key-stack.js';
import { createRestoreSchedule } from './restore-schedule-stack.js';
import { createRestoreWorkflow } from './restore-workflow-stack.js';
import { createRuntimeSecrets } from './secrets-stack.js';
import { createExportOperatorPolicy, createExportResources } from './export-stack.js';
import { createArchiveProjectMigration } from './migration-stack.js';
import { createReportingReconciliation } from './reporting-stack.js';

export interface NaasehStackProps extends StackProps {
  alertEmail?: string;
  breakGlassRoleArn: string;
  certificateArn: string;
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  webAclArn: string;
  webAssetPath: string;
}

export class NaasehStack extends Stack {
  constructor(scope: Construct, id: string, props: NaasehStackProps) {
    if (props.env?.region && props.env.region !== 'us-west-2')
      throw new Error('Naaseh v1 Region-scoped resources must be deployed in us-west-2.');
    super(scope, id, props);
    const criticalAlerts = new sns.Topic(this, 'CriticalAlerts', {
      displayName: 'Naaseh critical operational alerts',
    });
    if (props.alertEmail)
      criticalAlerts.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    const { key: dataKey, table } = createRegionalDataResources(this);
    const recoveryKeys = createRecoveryKeys(this, {
      breakGlassRoleArn: props.breakGlassRoleArn,
      alerts: criticalAlerts,
    });
    const { pepper, webPushSecret, googleOAuthSecret, cursorSigningSecret } = createRuntimeSecrets(
      this,
      criticalAlerts,
    );
    const { distribution, responseHeadersPolicy } = createWebResources(this, {
      certificateArn: props.certificateArn,
      domainName: props.domainName,
      webAclArn: props.webAclArn,
      webAssetPath: props.webAssetPath,
    });
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });
    for (const [id, recordType] of [
      ['SiteAliasIpv4', 'A'],
      ['SiteAliasIpv6', 'AAAA'],
    ] as const) {
      const common = {
        zone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      };
      if (recordType === 'A') new route53.ARecord(this, id, common);
      else new route53.AaaaRecord(this, id, common);
    }
    const { media } = createProfileMediaResources(this, {
      primaryKey: dataKey,
      allowedOrigin: `https://${props.domainName}`,
    });
    const exportResources = createExportResources(this, { table });
    const commonEnvironment = {
      NODE_ENV: 'production',
      NAASEH_TABLE: table.tableName,
      NAASEH_AWS_REGION: 'us-west-2',
      PASSWORD_PEPPER_SECRET_ID: pepper.secretArn,
      WEB_PUSH_SECRET_ID: webPushSecret.secretArn,
      RECOVERY_KMS_KEY_ARN: recoveryKeys.recoveryWrappingKey.keyArn,
      BACKUP_MANIFEST_SIGNING_KEY_ARN: recoveryKeys.manifestSigningKey.keyArn,
      RECOVERY_PUBLIC_KEY_REGISTRY: recoveryKeys.publicRegistryValue,
      VERBOSE_LOGGING: 'false',
      CURSOR_SIGNING_SECRET: cursorSigningSecret.secretValue.unsafeUnwrap(),
    };
    const logGroups = createLogGroups(this);
    createArchiveProjectMigration(this, {
      environment: commonEnvironment,
      table,
      logGroup: logGroups.sync,
    });
    createReportingReconciliation(this, {
      environment: commonEnvironment,
      table,
      logGroup: logGroups.task,
    });
    const { api: httpApi, functions } = createApplicationApi(this, {
      environment: commonEnvironment,
      allowedOrigin: `https://${props.domainName}`,
      table,
      pepper,
      dataKey,
      media,
      exportBucket: exportResources.bucket,
      exportKey: exportResources.key,
      exportStateMachine: exportResources.stateMachine,
      logGroups,
      recoveryKeyArn: recoveryKeys.recoveryWrappingKey.keyArn,
      recoveryWrappingKey: recoveryKeys.recoveryWrappingKey,
      manifestSigningKey: recoveryKeys.manifestSigningKey,
      webPushSecret,
      googleOAuthSecret,
      alerts: criticalAlerts,
    });
    attachSameOriginApi(distribution, httpApi, responseHeadersPolicy);
    createOperationalVisibility(
      this,
      {
        task: functions.task,
        auth: functions.auth,
        sync: functions.sync,
        reporting: functions.reporting,
        googleSync: functions.googleSync,
      },
      table,
      criticalAlerts,
    );
    const backup = createBackupResources(this, { dataKey, table, media, alerts: criticalAlerts });
    const restoreLogGroupArnPattern = this.formatArn({
      service: 'logs',
      resource: 'log-group',
      resourceName: `${this.stackName}-RestoreWorkflowLogs*`,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    dataKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudWatchLogsForRestoreWorkflow',
        principals: [new iam.ServicePrincipal(`logs.${this.region}.${this.urlSuffix}`)],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:Describe*',
        ],
        resources: ['*'],
        conditions: {
          ArnLike: { 'kms:EncryptionContext:aws:logs:arn': restoreLogGroupArnPattern },
        },
      }),
    );
    const restoreLogs = new logs.LogGroup(this, 'RestoreWorkflowLogs', {
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.RETAIN,
      encryptionKey: dataKey,
    });
    const restoreWorkflow = createRestoreWorkflow(this, {
      restoreTestingPlanArn: backup.restoreTestingPlan.attrRestoreTestingPlanArn,
      manifestSigningKey: recoveryKeys.manifestSigningKey,
      recoveryWrappingKey: recoveryKeys.recoveryWrappingKey,
      logGroup: restoreLogs,
      deletionLedgerTable: table,
    });
    createRestoreSchedule(
      this,
      restoreWorkflow.stateMachine,
      backup.restoreTestingPlan.attrRestoreTestingPlanArn,
      criticalAlerts,
    );
    new CfnOutput(this, 'DeploymentRegion', { value: this.region });
    new CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` });
    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'CriticalAlertsTopicArn', { value: criticalAlerts.topicArn });
    new CfnOutput(this, 'Argon2CalibrationFunctionName', {
      value: functions.authCalibration.functionName,
    });
    new CfnOutput(this, 'ProvisionUserFunctionName', {
      value: functions.provisionUser.functionName,
    });
    new CfnOutput(this, 'ProvisionUserOperatorPolicyArn', {
      value: functions.provisionUserOperatorPolicy.managedPolicyArn,
    });
    new CfnOutput(this, 'ExportTodosFunctionName', {
      value: functions.exportCoordinator.functionName,
    });
    const exportOperatorPolicy = createExportOperatorPolicy(this, functions.exportCoordinator);
    new CfnOutput(this, 'ExportOperatorPolicyArn', {
      value: exportOperatorPolicy.managedPolicyArn,
    });
  }
}
