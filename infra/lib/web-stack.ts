import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { contentSecurityPolicy, permissionsPolicy } from './web-security.js';

export function createWebResources(
  scope: Construct,
  options: {
    certificateArn: string;
    domainName: string;
    webAclArn: string;
    webAssetPath: string;
  },
) {
  const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(scope, 'SecurityHeaders', {
    securityHeadersBehavior: {
      contentSecurityPolicy: { contentSecurityPolicy, override: true },
      contentTypeOptions: { override: true },
      frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
      referrerPolicy: {
        referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
        override: true,
      },
      strictTransportSecurity: {
        accessControlMaxAge: Duration.seconds(63_072_000),
        includeSubdomains: true,
        preload: true,
        override: true,
      },
    },
    customHeadersBehavior: {
      customHeaders: [{ header: 'Permissions-Policy', value: permissionsPolicy, override: true }],
    },
  });
  const web = new s3.Bucket(scope, 'Web', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    encryption: s3.BucketEncryption.S3_MANAGED,
    versioned: true,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const spaRouteRewrite = new cloudfront.Function(scope, 'SpaRouteRewrite', {
    code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
  var isApiPath = uri.indexOf('/api/') === 0;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  var isSpaRoute = uri.charAt(uri.length - 1) === '/' || lastSegment.indexOf('.') === -1;
  if (isSafeMethod && !isApiPath && isSpaRoute) request.uri = '/index.html';
  return request;
}
`),
  });
  const distribution = new cloudfront.Distribution(scope, 'Distribution', {
    certificate: acm.Certificate.fromCertificateArn(
      scope,
      'ImportedSiteCertificate',
      options.certificateArn,
    ),
    domainNames: [options.domainName],
    minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    sslSupportMethod: cloudfront.SSLMethod.SNI,
    webAclId: options.webAclArn,
    defaultBehavior: {
      origin: origins.S3BucketOrigin.withOriginAccessControl(web),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy,
      functionAssociations: [
        {
          function: spaRouteRewrite,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    },
    defaultRootObject: 'index.html',
  });
  new s3deploy.BucketDeployment(scope, 'WebDeployment', {
    sources: [s3deploy.Source.asset(options.webAssetPath)],
    destinationBucket: web,
    distribution,
    distributionPaths: ['/*'],
    prune: true,
    cacheControl: [s3deploy.CacheControl.noCache()],
  });
  return { web, distribution, responseHeadersPolicy };
}

export function attachSameOriginApi(
  distribution: cloudfront.Distribution,
  httpApi: apigwv2.HttpApi,
  responseHeadersPolicy: cloudfront.IResponseHeadersPolicy,
) {
  const apiDomain = Fn.select(2, Fn.split('/', httpApi.apiEndpoint));
  distribution.addBehavior(
    '/api/v1/*',
    new origins.HttpOrigin(apiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    }),
    {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      responseHeadersPolicy,
    },
  );
}
