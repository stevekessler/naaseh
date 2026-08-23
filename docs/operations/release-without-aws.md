# Changes without an AWS deployment

Use this procedure only when a change does not alter anything delivered to production. Typical
examples are documentation, specifications, tests, local developer tooling, and review evidence.
No AWS login, CDK synthesis, backup inspection, user provisioning, or production workflow is
required.

Changes under `apps/web`, `apps/api`, runtime packages, `infra`, deployable dependencies, runtime
configuration, or GitHub deployment workflows are not in this category. Na'aseh is hosted on AWS,
so even an application-only web or API change uses the
[AWS release procedure](release-with-aws.md).

## Procedure

1. Start from current `main` and create a feature branch:

   ```console
   git switch main
   git pull --ff-only origin main
   git switch -c codex/SHORT-DESCRIPTION
   ```

2. Make the change and run validation proportionate to it. The safe default is:

   ```console
   npm run validate
   ```

   For workflow edits, also run `npm run validate:workflows`. Changes to required validation must
   follow the runtime and test-count rules in `AGENTS.md`.

3. Review the exact diff, commit only the intended files, push the branch, and open a pull request.
   Give the pull request a specific title, summary, and testing section.

   Use this pull-request section, removing commands that do not apply:

   ```markdown
   ## Testing

   - [x] `npm run validate`
   - [x] `npm run validate:workflows` (workflow changes only)
   - [x] Required GitHub `validate` check passed
   ```

4. Wait for required pull-request validation, address review findings, and merge the approved pull
   request.

5. Update the local checkout:

   ```console
   git switch main
   git pull --ff-only origin main
   ```

6. Stop. Do not run `deploy-production.yml` for a repository-only change. If the change must appear
   in the running application, it was misclassified and must use the AWS release procedure.

Operational evidence files, such as a newly recorded Argon2 calibration result, belong in this
category by themselves. Their commit SHA is not a production rollback reference unless that exact
commit was later deployed successfully by `deploy-production.yml`.
