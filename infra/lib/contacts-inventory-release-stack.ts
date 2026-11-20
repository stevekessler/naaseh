import {
  ArnFormat,
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as api from 'aws-cdk-lib/aws-apigatewayv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { retainFeatureAudit } from './contacts-inventory-observability.js';
import type { ContactsInventoryDataStack } from './contacts-inventory-data-stack.js';

export class ContactsInventoryReleaseStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      data: ContactsInventoryDataStack;
      releaseId: string;
      artifactPath: string;
      webOrigin: string;
    },
  ) {
    super(scope, id, props);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(props.releaseId))
      throw new Error('Invalid Contacts and Inventory release ID.');

    const apiId = new CfnParameter(this, 'HostApiId', { allowedPattern: '[a-z0-9]+' });
    const authorizerId = new CfnParameter(this, 'HostAuthorizerId', {
      allowedPattern: '[a-z0-9]+',
    });
    const artifacts = new CfnParameter(this, 'ArtifactBucket', {
      allowedPattern: '[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]',
    });
    const workspace = new CfnParameter(this, 'WorkspaceId', { minLength: 1, noEcho: true });
    const memberOne = new CfnParameter(this, 'MemberOne', { minLength: 1, noEcho: true });
    const memberTwo = new CfnParameter(this, 'MemberTwo', { minLength: 1, noEcho: true });

    const logGroup = new logs.LogGroup(this, 'ApplicationLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    retainFeatureAudit(this, logGroup);
    const role = new iam.Role(this, 'Runtime', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    props.data.grantRuntimeAccess(role);
    logGroup.grantWrite(role);
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [
          `arn:${this.partition}:s3:::${artifacts.valueAsString}/features/contacts-inventory/release.json`,
        ],
      }),
    );

    const functionInstance = new lambda.Function(this, 'FeatureApi', {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(props.artifactPath),
      handler: 'handler.handler',
      description: `Contacts and Inventory release ${props.releaseId}`,
      role,
      logGroup,
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: {
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: props.webOrigin,
        CONTACTS_INVENTORY_RELEASE: props.releaseId,
        CONTACTS_INVENTORY_ARTIFACT_BUCKET: artifacts.valueAsString,
        CONTACTS_INVENTORY_WORKSPACE: workspace.valueAsString,
        CONTACTS_INVENTORY_MEMBER_ONE: memberOne.valueAsString,
        CONTACTS_INVENTORY_MEMBER_TWO: memberTwo.valueAsString,
        CONTACTS_INVENTORY_RECORDS_TABLE: props.data.records.tableName,
        CONTACTS_INVENTORY_LEDGER_TABLE: props.data.deletionLedger.tableName,
        CONTACTS_INVENTORY_MEDIA_BUCKET: props.data.media.bucketName,
      },
    });
    const version = functionInstance.currentVersion;
    const prefix = `api/v1/contacts-inventory/releases/${props.releaseId}`;
    const integration = new api.CfnIntegration(this, 'ReleaseIntegration', {
      apiId: apiId.valueAsString,
      integrationType: 'AWS_PROXY',
      integrationUri: version.functionArn,
      payloadFormatVersion: '2.0',
    });
    version.addPermission('InvokeFromReleaseRoutes', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: this.formatArn({
        service: 'execute-api',
        resource: apiId.valueAsString,
        resourceName: `*/*/${prefix}/*`,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      }),
    });
    new api.CfnRoute(this, 'ReleaseRoute', {
      apiId: apiId.valueAsString,
      routeKey: `ANY /${prefix}/{proxy+}`,
      authorizationType: 'CUSTOM',
      authorizerId: authorizerId.valueAsString,
      target: `integrations/${integration.ref}`,
    });
    new CfnOutput(this, 'ReleaseId', { value: props.releaseId });
  }
}
