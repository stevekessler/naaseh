import { error as logError } from 'node:console';
import process from 'node:process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  apiProtocol,
  artifactPrefix,
  hostProtocol,
  parseReleaseManifest,
  releaseIdSchema,
} from '../packages/contacts-inventory-contracts/src/host.ts';

async function listAssets(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const entriesByName = entries.sort((a, b) => a.name.localeCompare(b.name));
  const assets = [];
  for (const entry of entriesByName) {
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      assets.push(...(await listAssets(join(directory, entry.name), relative + '/')));
    else if (entry.isFile()) assets.push(relative);
    else throw new Error('The release build must contain only regular files and directories.');
  }
  return assets;
}

export async function buildReleaseManifest(releaseId, assetDirectory) {
  const version = releaseIdSchema.parse(releaseId);
  const prefix = artifactPrefix(version);
  const assets = await listAssets(assetDirectory);
  const manifest = parseReleaseManifest({
    releaseId: version,
    hostProtocol,
    apiProtocol,
    entry: prefix + 'entry.js',
    assets: assets.map((asset) => prefix + asset),
  });
  if (!manifest)
    throw new Error('The build does not contain a valid immutable feature entry and asset list.');
  return manifest;
}

async function main(args) {
  const [command, releaseId, assetDirectory, output] = args;
  if (command !== 'pack' || !releaseId || !assetDirectory || !output || args.length !== 4)
    throw new Error('Usage: release-contacts-inventory.mjs pack RELEASE_ID ASSETS_DIR OUTPUT_DIR');
  const inputRoot = resolve(assetDirectory);
  const outputRoot = resolve(output);
  if (outputRoot === inputRoot || outputRoot.startsWith(inputRoot + '/'))
    throw new Error('Write release metadata outside the immutable assets directory.');
  const manifest = await buildReleaseManifest(releaseId, inputRoot);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, 'release.json'), JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    logError(error instanceof Error ? error.message : 'Failed to package Contacts and Inventory.');
    process.exitCode = 1;
  });
}
