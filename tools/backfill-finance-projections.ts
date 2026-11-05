/** Explicit operator tool. Build with committed esbuild; help/preflight never contact AWS.
 * Execute writes only in an environment separately approved for synthetic/live acceptance.
 */
class UsageError extends Error {}
const help = `Finance projection migration (Node 24)

Prepare the catalog and every relevant Finance scope before rebuilding accounts.
Each call is bounded and resumes durable checkpoints. This is not an interactive
read fallback, a deployment command or proof of AWS cost/performance acceptance.

  --help
  --apply --scope FINANCE#CATALOG [--steps 1..100] [--restart]
  --apply --scope FINANCE#SCOPE#OWNER#<user-id> [--steps 1..100] [--restart]
  --apply --scope FINANCE#SCOPE#GROUP#<group-id> [--steps 1..100] [--restart]
  --apply --account <ULID> [--steps 1..100] [--restart] [--time-zone UTC]

Writes require explicit NAASEH_TABLE and AWS_REGION. Use only the separately
approved environment and credentials. The default is one step; --restart applies
only to the first step of this invocation. No table/account/profile identifiers,
financial payloads or credentials are printed. Existing financial source records
and pending mutations are retained.
`;
async function main(args: string[]) {
  if (args.length === 0 || args.includes('--help')) {
    console.log(help);
    return;
  }
  let account: string | undefined;
  let scope: string | undefined;
  let steps = 1;
  let calendarBasis = 'UTC';
  let restart = false;
  let apply = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (seen.has(name)) throw new UsageError('Duplicate migration option.');
    seen.add(name);
    if (name === '--apply') {
      apply = true;
      continue;
    }
    if (name === '--restart') {
      restart = true;
      continue;
    }
    if (!['--account', '--scope', '--steps', '--time-zone'].includes(name))
      throw new UsageError('Unknown migration option. Use --help.');
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new UsageError('A migration option value is missing.');
    if (name === '--account') account = value;
    if (name === '--scope') scope = value;
    if (name === '--steps') steps = Number(value);
    if (name === '--time-zone') calendarBasis = value;
  }
  if (Boolean(account) === Boolean(scope))
    throw new UsageError('Choose exactly one account or scope.');
  if (account && !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(account))
    throw new UsageError('Account must be a canonical ULID.');
  if (scope && scope !== 'FINANCE#CATALOG' && !/^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(scope))
    throw new UsageError('Scope must be the Finance catalog or an explicit owner/group partition.');
  if (!Number.isInteger(steps) || steps < 1 || steps > 100)
    throw new UsageError('Step limit must be 1–100.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: calendarBasis }).format(0);
  } catch {
    throw new UsageError('Calendar time zone is invalid.');
  }
  if (!apply)
    throw new UsageError(
      'No writes performed. Explicit --apply is required in an approved environment.',
    );
  if (!process.env.NAASEH_TABLE || !process.env.AWS_REGION)
    throw new UsageError('No writes performed. Set explicit NAASEH_TABLE and AWS_REGION first.');
  // Imports are deliberately after validation: help/preflight cannot initialize an AWS operation.
  const [{ FinanceBackfillDriver }, { FinanceScopePreparation }] = await Promise.all([
    import('../apps/api/src/finance/backfill-driver.js'),
    import('../apps/api/src/finance/scope-preparation.js'),
  ]);
  const driver = account ? new FinanceBackfillDriver() : new FinanceScopePreparation();
  for (let step = 0; step < steps; step++) {
    const result = account
      ? await (driver as InstanceType<typeof FinanceBackfillDriver>).step(account, {
          restart: restart && step === 0,
          calendarBasis,
        })
      : await (driver as InstanceType<typeof FinanceScopePreparation>).step(scope!, {
          restart: restart && step === 0,
        });
    console.log(
      JSON.stringify({
        operation: 'finance-backfill',
        step: step + 1,
        phase: result.phase,
        complete: result.complete,
      }),
    );
    if (result.complete) return;
  }
  console.log(
    JSON.stringify({
      operation: 'finance-backfill',
      complete: false,
      outcome: 'checkpoint-retained',
    }),
  );
}
void main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(
    error instanceof UsageError
      ? error.message
      : 'Finance migration stopped. Saved checkpoints remain available; review the approved environment and operation evidence before resuming.',
  );
  process.exitCode = 1;
});
