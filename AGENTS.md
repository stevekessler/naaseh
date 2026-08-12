# Repository agent instructions

## Required validation runtime

- Keep the required pull-request validation target at ten minutes or less, with a workflow timeout
  that leaves reasonable hosted-runner headroom. The timeout is a safety limit, not the target.
- Before adding tests to `.github/workflows/validate.yml`, `test:e2e:quick`, or another required
  validation command, list the resulting test count and measure the relevant command before and
  after the change. For browser changes, use `/usr/bin/time -p npm run test:e2e:quick` locally.
- After changing required validation, confirm the total duration of the hosted PR check. Do not
  merge a validation expansion that pushes the expected runtime above ten minutes without explicit
  user approval and a documented reason.
- Keep representative, high-value journeys in `test:e2e:quick`. Keep exhaustive browser and device
  combinations in `npm run test:e2e` and `npm run validate:pre-aws:browsers` so they remain
  available as local release gates without slowing every pull request.
