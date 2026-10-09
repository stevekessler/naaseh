# Native Apple Parity Traceability Matrix

This is the release index for every end-user story in specifications 001 through 011. “Native” means
the journey must be available on supported iPhone, iPad, and Mac clients. “Web-only” identifies the
explicit administration/operator exclusions. Source specifications remain authoritative for their
full functional, security, offline, and failure requirements; completing only the summary in this
matrix is not sufficient.

## Coverage rules

- Each Native row must have implementation tasks, automated validation where meaningful, and a
  recorded release result before SC-001 can pass.
- Category and Project records may be browsed, filtered, reported on, and assigned to work natively;
  their creation, edit, archive, restore, and deletion remain web-admin-only.
- User provisioning, administrative user/category/project management, and recovery-operator actions
  remain web/operator-only. Native clients must still handle the resulting server state safely.
- Browser-only notification wording is translated to the equivalent per-installation native alert
  behavior while the existing browser feature remains unchanged.

## 001 — Na'aseh v1 Baseline

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Sign In Securely | Native | T036–T044 | T029–T035 |
| US2 Manage Tasks and Subtasks | Native | T051–T060 | T046–T050 |
| US3 Work Offline and Synchronize | Native | T039–T044 | T031–T035, T157 |
| US4 Back Up and Recover All Data | Native client recovery/rebootstrap; operator restore remains web/operator-only | T039–T045 | T031–T033, T159 |
| US5 Find and Focus Tasks | Native | T053, T055–T059 | T049–T050 |
| US6 Switch Between List and Post-it Views | Native | T056–T059 | T050 |
| US7 Share Work and Protect Private Tasks | Native end-user sharing/privacy; administration excluded | T052, T054–T059, T111 | T046–T048, T104, T135 |
| US8 Protect Sensitive Memos with a PIN | Native | T054 | T048, T158 |
| US9 Administer Users and Categories | Web-only; native must expose no route/module | T141 | T133, T135 |

## 002 — Enhanced List Management

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Create and Complete Multi-item Lists | Native | T110, T115–T118 | T103, T108–T109 |
| US2 Reuse Directory Items and Track List Value | Native | T110, T115–T118 | T103, T108 |
| US3 Control Visibility and Copy Lists | Native | T110, T115–T118 | T103–T104, T108 |
| US4 Attach Files Securely | Native, online upload boundary preserved | T112, T116–T119 | T105, T108–T109 |
| US5 Find Lists and To-do Items Together | Native | T110, T115–T118 | T103, T108 |
| US6 Receive Clear Completion Feedback | Native | T060, T110, T115–T118 | T103, T108 |
| US7 Lock To-do Items | Native | T110, T115–T118 | T103–T104, T108 |
| US8 Export All To-do Data | Native | T113, T115–T119 | T106, T108–T109 |

## 003 — Archive, Projects, and Completion Reporting

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Finish Work Without Losing It | Native | T052, T110–T111 | T047, T103–T104 |
| US2 Permanently Delete Work Deliberately | Native for user-owned work; Category/Project deletion web-only | T111, T115–T118 | T104, T108 |
| US3 Organize Work by Category and Project | Native use/assignment of existing records; tree administration web-only | T111, T115–T118 | T104, T108, T133 |
| US4 See Workload Counts and Project End Dates | Native read/report experience | T111, T115–T118 | T104, T108 |
| US5 Review Personal Completion Statistics | Native | T113, T115–T118 | T106, T108–T109 |
| US6 Archive or Permanently Delete Categories and Projects | Web-only administration | T141 | T133, T135 |

## 004 — Bidirectional Google Tasks Sync (retired)

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Connect Google and Publish Dated Tasks | Removed from all clients and backend | T107, T114 | T109 |
| US2 Import and Reconcile Google Changes | Removed from all clients and backend | T107, T114 | T109 |
| US3 Resolve Concurrent Changes Safely | Removed from all clients and backend | T107, T114 | T109 |
| US4 Control Privacy, Scope, and Disconnection | Local cache cleanup and production decommission procedure only | T107, T114, T119 | T109 |
| US5 Monitor and Recover Synchronization | Retired; no scheduled worker or dashboard | T107, T114 | T109 |

## 005 — Urgency Levels and Stack Ranking

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Set Work Urgency | Native | T051–T052, T056–T059 | T046, T050 |
| US2 Stack Rank Work Independently | Native | T055–T059 | T049–T050 |
| US3 Filter by Urgency | Native | T053, T056–T059 | T049–T050 |
| US4 Report on Urgency | Native | T113, T115–T118 | T106, T108 |

## 006 — Per-Browser Push Notifications

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Enable Notifications in This Browser | Native equivalent is per-installation alert opt-in; browser remains unchanged | T067–T076 | T061–T066, T109 |
| US2 Disable Notifications in This Browser | Native equivalent is installation unregister/disable | T067, T071–T072 | T061, T064, T066 |
| US3 Understand Unavailable or Denied Notifications | Native | T071–T072 | T064, T066 |
| US4 Preserve Account Privacy on Shared Browsers | Native account/install cleanup plus unchanged browser behavior | T043, T067–T072 | T034–T035, T061–T066 |

## 007 — Task and Account Experience Refinements

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Safely Reset or Change a Password | Native | T037–T038, T136–T140 | T029, T132, T134 |
| US2 Create a User Without Credential Entry Mistakes | Web/operator-only provisioning | T141 | T133, T135 |
| US3 Choose Related Records from Searchable Dropdowns | Native searchable pickers | T056–T059, T115–T118 | T050, T108 |
| US4 Start New Tasks with Myself Assigned | Native | T052 | T046–T047 |
| US5 Manage Completion Feedback in User Settings | Native | T060, T136–T140 | T050, T132, T134 |
| US6 View a Simpler Completion Dashboard | Native | T113, T115–T118 | T106, T108 |

## 008 — Responsive Completed Tasks Experience

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Focus the Completed Tasks Report on Meaningful Activity | Native | T113, T115–T118 | T106, T108 |
| US2 Use Every Existing Workflow on a Phone | Native | T124, T127–T129 | T120, T123, T131 |
| US3 Use Cohesive, Efficient Layouts on Desktop and Tablet | Native iPad and Mac compositions | T125–T129 | T121–T123, T131 |
| US4 Navigate and Operate Responsive Controls Accessibly | Native | T124–T130 | T120–T123, T131 |

## 009 — Task Security and Experience Modernization

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Use Secure Accounts with TFA Recovery | Native self-service; operator recovery remains excluded | T036–T043, T136–T140 | T029–T034, T132–T135 |
| US2 Edit Complete Task Details in Context | Native | T051–T060 | T046–T050 |
| US3 Focus with a Repeating Task Timer | Native plus Live Activity/Mac status surface | T073–T075 | T065–T066 |
| US4 Rank Tasks Efficiently at Any Size | Native | T055–T059, T124–T129 | T049–T050, T120–T131 |
| US5 Separate Personal Settings from Administration | Native personal settings; administration web-only | T136–T141 | T132–T135 |
| US6 Add and Manage List Items without Admin Clutter | Native | T110, T115–T118 | T103, T108 |
| US7 Export Complete Tasks without Time-Zone Controls | Native | T113, T115–T119 | T106, T108 |
| US8 Choose a Post-it Color while Editing | Native | T051–T059 | T046, T050 |

## 010 — Private Journal and Wellness Dashboard

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Record a Private Daily Journal | Native | T094–T101 | T089–T093 |
| US2 Browse and Revisit Entries by Date | Native | T095, T098–T101 | T090–T092 |
| US3 Configure Sensitive Journal Sections | Native | T095, T098–T101 | T090–T092 |
| US4 Relate a Journal Entry to a Task | Native | T095, T098–T101 | T090–T092 |
| US5 Review Wellness Trends | Native | T096, T098–T101 | T091–T092 |

## 011 — Journal Crisis Plan

| Source story | Native treatment | Implementation tasks | Validation tasks |
|---|---|---|---|
| US1 Create a Crisis Plan Before Journaling | Native | T097–T101 | T089–T093 |
| US2 View and Update My Crisis Plan | Native owner experience | T097–T101 | T089–T093 |
| US3 Show the Plan for Crisis-Related Answers | Native, draft-preserving and non-clinical | T097–T101 | T090–T092 |
| US4 Share My Crisis Plan Selectively | Native end-user sharing/revocation | T097–T101 | T090–T093 |
| US5 Use the Crisis Plan Across Supported Browsers and Connectivity States | Native owner offline/recipient online-only plus unchanged browsers | T097–T101 | T090–T093, T162 |

## Release closure

T168 must verify that every Native row has passing implementation and validation evidence and every
Web-only row has an exclusion test. Any uncovered source requirement blocks SC-001 and TestFlight
promotion even if its summary story row appears complete.
