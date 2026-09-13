import { expect, it, vi } from 'vitest';
// @ts-expect-error Release orchestration is a native Node.js module.
import { deploymentPlan, main } from '../../tools/deploy-production.mjs';
const input = {
  repository: 'stevekessler/naaseh',
  candidate: 'a'.repeat(40),
  previous: { conclusion: 'success', headSha: 'b'.repeat(40) },
  ticket: 'release-25',
};
it('uses the verified prior production SHA and keeps approval-controlled deployment in GitHub', () => {
  expect(deploymentPlan(input).args).toEqual([
    'workflow',
    'run',
    'deploy-production.yml',
    '--repo',
    'stevekessler/naaseh',
    '--ref',
    'main',
    '-f',
    'change_ticket=release-25',
    '-f',
    `rollback_ref=${'b'.repeat(40)}`,
  ]);
});
it.each([
  { repository: 'other/repo' },
  { candidate: 'main' },
  { previous: { conclusion: 'failure', headSha: 'b'.repeat(40) } },
  { ticket: '' },
])('rejects unsafe deployment inputs %j', (patch) =>
  expect(() => deploymentPlan({ ...input, ...patch })).toThrow(),
);
it('previews by default without dispatching or changing AWS', () => {
  const run = vi
    .fn()
    .mockReturnValueOnce(JSON.stringify({ nameWithOwner: input.repository }))
    .mockReturnValueOnce(JSON.stringify({ sha: input.candidate }))
    .mockReturnValueOnce(JSON.stringify([input.previous]));
  expect(main(['--ticket', 'release-25'], run).dispatched).toBe(false);
  expect(run).toHaveBeenCalledTimes(3);
  expect(run.mock.calls.every(([command]) => command === 'gh')).toBe(true);
});
it('dispatches only after an explicit execute flag and unchanged main', () => {
  const run = vi
    .fn()
    .mockReturnValueOnce(JSON.stringify({ nameWithOwner: input.repository }))
    .mockReturnValueOnce(JSON.stringify({ sha: input.candidate }))
    .mockReturnValueOnce(JSON.stringify([input.previous]))
    .mockReturnValueOnce(JSON.stringify({ sha: input.candidate }))
    .mockReturnValueOnce('');
  expect(main(['--ticket', 'release-25', '--execute'], run).dispatched).toBe(true);
  expect(run).toHaveBeenLastCalledWith('gh', deploymentPlan(input).args);
});
