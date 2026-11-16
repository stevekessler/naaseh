#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { fileURLToPath } from 'node:url';
import { deploymentConfig, deploymentTarget } from '../lib/config.js';
import { NaasehEdgeStack } from '../lib/edge-stack.js';
import { NaasehStack } from '../lib/naaseh-stack.js';

const app = new App();
const config = deploymentConfig(process.env);
const { account, edgeId, applicationId, ...target } = deploymentTarget(
  config.stage,
  process.env,
  (key) => app.node.tryGetContext(key),
);
const { domainName, hostedZoneId, hostedZoneName, breakGlassRoleArn, alertEmail } = target;

const edge = new NaasehEdgeStack(app, edgeId, {
  env: { ...(account ? { account } : {}), region: 'us-east-1' },
  crossRegionReferences: true,
  domainName,
  hostedZoneId,
  hostedZoneName,
});

const application = new NaasehStack(app, applicationId, {
  env: { ...(account ? { account } : {}), region: config.region },
  crossRegionReferences: true,
  breakGlassRoleArn,
  ...(alertEmail ? { alertEmail } : {}),
  certificateArn: edge.certificateArn,
  domainName,
  hostedZoneId,
  hostedZoneName,
  webAclArn: edge.webAclArn,
  webAssetPath: fileURLToPath(new URL('../../apps/web/dist', import.meta.url)),
});
application.addStackDependency(edge);
