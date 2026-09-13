/* global process, console */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function deploymentPlan({ repository, candidate, previous, ticket }) {
  if (repository !== 'stevekessler/naaseh') throw new Error('Expected stevekessler/naaseh.');
  if (!/^[0-9a-f]{40}$/.test(candidate ?? ''))
    throw new Error('A full main commit SHA is required.');
  if (previous?.conclusion !== 'success' || !/^[0-9a-f]{40}$/.test(previous.headSha ?? ''))
    throw new Error(
      'The most recent production run must be successful. Verify deployment/rollback state before retrying.',
    );
  if (typeof ticket !== 'string' || !ticket.trim() || ticket.length > 200)
    throw new Error('Supply --ticket with a release or change identifier.');
  return {
    repository,
    candidate,
    rollback: previous.headSha,
    ticket: ticket.trim(),
    args: [
      'workflow',
      'run',
      'deploy-production.yml',
      '--repo',
      repository,
      '--ref',
      'main',
      '-f',
      `change_ticket=${ticket.trim()}`,
      '-f',
      `rollback_ref=${previous.headSha}`,
    ],
  };
}

export function main(
  args,
  run = (command, argv) => execFileSync(command, argv, { encoding: 'utf8' }).trim(),
) {
  const allowed = new Set(['--ticket', '--execute']);
  let ticket;
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
    if (args[i] === '--ticket') ticket = args[++i];
  }
  const repository = JSON.parse(
    run('gh', ['repo', 'view', '--json', 'nameWithOwner']),
  ).nameWithOwner;
  const candidate = JSON.parse(run('gh', ['api', `repos/${repository}/commits/main`])).sha;
  const runs = JSON.parse(
    run('gh', [
      'run',
      'list',
      '--repo',
      repository,
      '--workflow',
      'deploy-production.yml',
      '--branch',
      'main',
      '--limit',
      '1',
      '--json',
      'headSha,conclusion,status',
    ]),
  );
  const plan = deploymentPlan({ repository, candidate, previous: runs[0], ticket });
  if (args.includes('--execute')) {
    const latest = JSON.parse(run('gh', ['api', `repos/${repository}/commits/main`])).sha;
    if (latest !== candidate)
      throw new Error('Main changed during preflight. Run the command again.');
    run('gh', plan.args);
  }
  return { ...plan, dispatched: args.includes('--execute') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = main(process.argv.slice(2));
    console.log(JSON.stringify(plan, null, 2));
    console.log(
      plan.dispatched
        ? 'Production workflow dispatched. It runs validation, deployment, smoke checks, and automatic rollback on smoke failure.'
        : 'Preview only. Add --execute after the change is merged and ready to release.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
