# Task security modernization browser report

Date: 2026-08-14

## Exhaustive matrix

Command: `npm run test:e2e`

Result: **PASS** — 372 cases across Chromium desktop, WebKit desktop, iPhone, and iPad profiles; 364 passed, 8 intentionally skipped, 0 failed, Playwright duration 5.9 minutes.

The matrix covers primary task, profile, administration, directory/list, report/export, timer, rank, group/privacy, archive, search, and post-it journeys. Feature-specific cases include modal focus/Escape/cancel/conflict, rich memo formatting/paste, parent/group comboboxes, no-date and browser-zone behavior, five-minute time choices, timer persistence/repeat/switch, pointer/touch/keyboard ranking, compact priority marks, user table, initial item amount, post-it color, and verified completion export.

## Accessibility and responsive coverage

- axe scans, semantic table/dialog/combobox/list structures, accessible names, focus restoration, live status announcements, and non-color priority/color state are automated;
- 320/375/390-pixel layouts, iPhone/iPad touch targets, zoom/reflow, horizontal overflow, dynamic viewport dialogs, and compact header behavior are exercised;
- reduced-motion completion and drag presentation is exercised;
- pointer drag runs in Chromium, while WebKit and touch profiles verify the canonical accessible move controls because synthetic desktop WebKit drag is not a reliable representation of Safari pointer input;
- cached/offline route tests warm dev-server lazy chunks before disconnecting; production shell caching is covered separately by PWA tests.

## Browser limitations

Browser background timers are deliberately not correctness inputs. Timer state derives from persisted timestamps when a page becomes visible again. Audio and notification permission denial affects feedback only. The eight skips are existing profile-specific capability exclusions declared by tests; no feature failure was skipped dynamically.

Independent Safari Technology Preview native-WebDriver testing is an optional release-machine gate when that application is installed; Playwright WebKit is the automated repository gate.
