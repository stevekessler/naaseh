import console from 'node:console';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDirectory = path.join(repositoryRoot, '.github', 'workflows');
const immutableActionReference = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

export function findUnsafeActionReferences(contents) {
  return contents
    .split('\n')
    .map((line, index) => ({
      line: index + 1,
      match: line.match(/^\s*(?:-\s*)?uses:\s*['"]?([^\s'"]+)/),
    }))
    .filter(
      ({ match }) =>
        match && !match[1].startsWith('./') && !immutableActionReference.test(match[1]),
    )
    .map(({ line, match }) => ({ line, reference: match[1] }));
}

export async function validateWorkflowActions(directory = workflowsDirectory) {
  const workflowNames = (await readdir(directory)).filter((name) => /\.ya?ml$/.test(name)).sort();
  const failures = [];

  for (const workflowName of workflowNames) {
    const contents = await readFile(path.join(directory, workflowName), 'utf8');
    for (const unsafe of findUnsafeActionReferences(contents)) {
      failures.push(
        `${workflowName}:${unsafe.line} uses mutable action reference ${unsafe.reference}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`GitHub Actions validation failed:\n${failures.join('\n')}`);
  }

  return workflowNames.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await validateWorkflowActions();
  console.log(`Validated ${count} workflow files; all external actions use immutable commit SHAs.`);
}
