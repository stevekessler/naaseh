#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { fileURLToPath } from 'node:url';
import { ContactsInventoryReleaseStack } from '../lib/contacts-inventory-release-stack.js';
import { ContactsInventoryDataStack } from '../lib/contacts-inventory-data-stack.js';

const app = new App();
const domain = app.node.tryGetContext('contactsInventoryWebOrigin');
if (typeof domain !== 'string')
  throw new Error('Set contactsInventoryWebOrigin to the prepared web host’s HTTPS origin.');
const account = process.env.CDK_DEFAULT_ACCOUNT;

const data = new ContactsInventoryDataStack(app, 'NaasehContactsInventoryData', {
  env: { ...(account ? { account } : {}), region: 'us-west-2' },
  webOrigin: domain,
});

const releaseId: unknown = app.node.tryGetContext('contactsInventoryReleaseId');
if (releaseId !== undefined) {
  if (typeof releaseId !== 'string') throw new Error('Set contactsInventoryReleaseId to a string.');
  new ContactsInventoryReleaseStack(app, `NaasehContactsInventory-${releaseId}`, {
    env: { ...(account ? { account } : {}), region: 'us-west-2' },
    data,
    releaseId,
    webOrigin: domain,
    artifactPath: fileURLToPath(new URL('../../apps/api/dist/contacts-inventory', import.meta.url)),
  });
}
