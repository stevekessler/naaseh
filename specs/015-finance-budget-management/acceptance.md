# Two-user Finance acceptance record

Use deterministic or invented financial data only. Do not record a real institution, account name,
balance, transaction, merchant, CSV row, SimpleFIN setup token, or Access URL. The moderator may
explain the purpose of the session before timing begins but must not coach a participant during a
timed workflow.

Both participants must pass every workflow and the clarity review. If either participant fails a
criterion, record the observed problem and follow-up, correct the product or instructions, and rerun
the affected workflow with that participant before marking T103 complete.

## Where to run acceptance

Use a running copy of the release candidate with its backend: a local test instance or a controlled
test deployment. General release and real bank credentials are not prerequisites. `npm run dev`
alone starts the frontend; confirm that the test API and shared data store are running too.
Canned browser-test responses cannot establish persistence or cross-user authorization.

Heather and Steve need separate test accounts, plus a shared test group with the second account
as owner or manager. Use separate browser profiles and invented records. Reset the fixture before
each participant's timed session. Verify that saved work survives reload and that private records
remain hidden from the other account before starting the moderated timing.

For remote sessions, use an isolated test deployment. If the first controlled deployment is used
for acceptance, finish these checks before permitting real Finance use. Record the tested commit,
URL/environment, and browser below; do not mark acceptance complete until both people pass.

- Tested release commit:
- Test environment / URL:
- Backend and separate-account access verified:

## Participant 1

- Date:
- Participant: Heather (confirmed)
- Perspective: individual owner
- Browser/device:

| Workflow | Start/end or elapsed | Pass criterion | Result | Confusion or assistance | Follow-up |
|---|---:|---|---|---|---|
| Account |  | Add or import, assign correctly, and confirm latest balance in under 3:00 without assistance | Pending |  |  |
| Budget |  | Create a date-appropriate multi-account budget, add direct or reusable items, and identify total/category variance in under 5:00 without assistance | Pending |  |  |
| CSV |  | Map, preview, resolve every suspected duplicate, correct an invalid row, and commit valid rows without assistance; invalid rows remain uncommitted with actionable reasons | Pending |  |  |
| Status clarity |  | Explain account freshness, provider/import attention, budget status, match state, and reconciliation history without developer explanation | Pending |  |  |

- Participant 1 overall result: Pending

## Participant 2

- Date:
- Participant: Steve (confirmed)
- Perspective: group owner or manager
- Browser/device:

| Workflow | Start/end or elapsed | Pass criterion | Result | Confusion or assistance | Follow-up |
|---|---:|---|---|---|---|
| Account |  | Add or import, assign correctly, and confirm latest balance in under 3:00 without assistance | Pending |  |  |
| Budget |  | Create a date-appropriate multi-account budget, add direct or reusable items, and identify total/category variance in under 5:00 without assistance | Pending |  |  |
| CSV |  | Map, preview, resolve every suspected duplicate, correct an invalid row, and commit valid rows without assistance; invalid rows remain uncommitted with actionable reasons | Pending |  |  |
| Status clarity |  | Explain account freshness, provider/import attention, budget status, match state, and reconciliation history without developer explanation | Pending |  |  |

- Participant 2 overall result: Pending

## Moderator completion check

- [ ] Both participants used only invented or deterministic fixture data.
- [ ] Both account workflows passed in under three minutes without assistance.
- [ ] Both budget workflows passed in under five minutes without assistance.
- [ ] Both CSV workflows passed without assistance and did not commit invalid rows.
- [ ] Both participants correctly explained every required status without developer explanation.
- [ ] Every observed confusion has a recorded disposition and any required rerun passed.
- [ ] T103 and the implementation validation record were updated with the final evidence.

Final decision: Pending
