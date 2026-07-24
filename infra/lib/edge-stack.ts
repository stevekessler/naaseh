import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { authSecurityRules } from './auth-security.js';

export interface NaasehEdgeStackProps extends StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
}

/** CloudFront certificates and WAF ACLs must be created in us-east-1. */
export class NaasehEdgeStack extends Stack {
  readonly certificateArn: string;
  readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: NaasehEdgeStackProps) {
    if (props.env?.region && props.env.region !== 'us-east-1')
      throw new Error('Naaseh edge resources must be deployed in us-east-1.');
    super(scope, id, props);

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });
    const certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    const webAcl = new wafv2.CfnWebACL(this, 'SiteWebAcl', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'NaasehSiteWaf',
        sampledRequestsEnabled: true,
      },
      rules: authSecurityRules,
    });

    this.certificateArn = certificate.certificateArn;
    this.webAclArn = webAcl.attrArn;
    new CfnOutput(this, 'CertificateArn', { value: this.certificateArn });
    new CfnOutput(this, 'WebAclArn', { value: this.webAclArn });
  }
}
