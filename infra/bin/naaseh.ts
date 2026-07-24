#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { fileURLToPath } from 'node:url';
import { deploymentConfig } from '../lib/config.js';
import { NaasehEdgeStack } from '../lib/edge-stack.js';
import { NaasehStack } from '../lib/naaseh-stack.js';

const app = new App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const config = deploymentConfig(process.env);
const domainName =
  app.node.tryGetContext('domainName') ?? process.env.NAASEH_DOMAIN_NAME ?? 'gsd.thepandas.link';
const hostedZoneId =
  app.node.tryGetContext('hostedZoneId') ??
  process.env.NAASEH_HOSTED_ZONE_ID ??
  'Z03233042WRAYW9S16I7T';
const hostedZoneName =
  app.node.tryGetContext('hostedZoneName') ??
  process.env.NAASEH_HOSTED_ZONE_NAME ??
  'thepandas.link';
const breakGlassRoleArn =
  app.node.tryGetContext('breakGlassRoleArn') ??
  `arn:aws:iam::${account ?? '111111111111'}:role/naaseh-recovery-break-glass`;

const edge = new NaasehEdgeStack(app, 'NaasehEdge', {
  env: { ...(account ? { account } : {}), region: 'us-east-1' },
  crossRegionReferences: true,
  domainName,
  hostedZoneId,
  hostedZoneName,
});

const application = new NaasehStack(app, 'NaasehProd', {
  env: { ...(account ? { account } : {}), region: config.region },
  crossRegionReferences: true,
  breakGlassRoleArn,
  certificateArn: edge.certificateArn,
  domainName,
  hostedZoneId,
  hostedZoneName,
  webAclArn: edge.webAclArn,
  webAssetPath: fileURLToPath(new URL('../../apps/web/dist', import.meta.url)),
});
application.addStackDependency(edge);
