# Run browser tests on demand

After `browser-tests.yml` lands on the repository default branch, run **Browser tests on demand** from the GitHub Actions tab. Pick the branch, tag, or commit to check under `test_ref` and supply a filename from `tests/e2e` under `test_file`.

For the shared Contacts test, use `codex/contacts-inventory` and `contacts-inventory-contacts.spec.ts`. Both the workflow and the selected test revision must be available on GitHub. The normal workflow run ref can stay on `main`.

The GitHub-hosted Ubuntu runner installs the lockfile's Playwright version and runs the Chromium, WebKit, iPhone, and iPad projects against the local preview. The job log shows the checkout and the result, and the `playwright-results` artifact holds the JSON report and retained failure traces.

The same run can be triggered and monitored from an authenticated GitHub CLI.

```sh
gh workflow run browser-tests.yml --ref main \
  -f test_ref=codex/contacts-inventory \
  -f test_file=contacts-inventory-contacts.spec.ts
gh run watch --exit-status
```
