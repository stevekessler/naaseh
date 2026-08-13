# Data Model: Responsive Completed Tasks Experience

## Persistence impact

This feature introduces **no persisted entities, fields, indexes, migrations, API payload changes, or
sync records**. Existing Completion Events, zero-filled report aggregates, encrypted cached reports,
filters, exports, and synchronization state remain canonical. The models below are browser
presentation concepts only.

## Completion Period

An existing aggregate period supplied by either local bucketing or the remote/cached report.

| Field | Type | Rules |
|---|---|---|
| `key` | string | Unique chronological day, week-start, or month key within one report |
| `count` | integer | Must be nonnegative in a valid raw report; zero remains valid canonical data |
| `urgencyCounts` | existing urgency-count map, optional in the browser view | Not changed or filtered by this feature |
| `sourceOrdinal` | derived nonnegative integer | Original array position; used only to prove stable order |

Relationships:

- A raw Completion Report contains zero or more Completion Periods.
- The raw period collection remains unchanged in memory/cache/contracts.
- One raw positive Completion Period maps to exactly one Visible Completion Period.
- One raw zero Completion Period maps to no chart row but remains part of canonical report data.

Validation:

- Keys must be unique and appropriate to the selected period vocabulary.
- Counts must be finite nonnegative integers.
- Negative, non-integer, duplicate, or malformed periods make the presentation outcome invalid rather
  than being silently hidden.

## Completion Chart Projection

A transient view model derived after the current source is selected.

| Field | Type | Rules |
|---|---|---|
| `kind` | `ready`, `empty`, or `invalid` | Exactly one state |
| `visiblePeriods` | ordered Completion Period array | Present for `ready`; every count is greater than zero |
| `maximum` | positive integer | Present for `ready`; maximum visible count, used only for bar scale |
| `emptyReason` | `filtered` or `range`, optional | Present for `empty` to select accurate copy |
| `error` | safe presentation error, optional | Present for `invalid`; contains no raw protected content |

State transitions:

```text
raw local/network/cache periods
  ├─ malformed/negative/duplicate ──> invalid
  ├─ valid, no positive periods ────> empty
  └─ valid, positive periods ───────> ready

ready/empty/invalid -- source refresh or filter change --> re-evaluate from new raw periods
```

Invariants:

- `ready.visiblePeriods` preserves source order and contains only positive counts.
- The sum of visible counts equals the unchanged applicable report total for a valid aggregate.
- The projection never changes raw periods, report total, urgency counts, detail rows, CSV rows,
  timestamps, filters, cache, or sync state.
- Offline, stale, pending, conflict, and retry status is orthogonal and may accompany any valid chart
  outcome.

## Completion Report State

Existing presentation context retained independently of the chart projection.

| Field | Values | Behavior |
|---|---|---|
| source | local, network, encrypted cache | Chosen before chart projection |
| connectivity | online or offline | Always visible when relevant |
| freshness | current or stale | Stale warning and refresh remain available |
| synchronization | up-to-date, pending, conflict, or failed | Never hidden by an empty chart |
| calculation | valid or invalid | Invalid presentation uses existing safe recovery path |

## Responsive Layout Unit

A semantic grouping whose DOM and interaction state do not change when its presentation reflows.

| Field | Type | Rules |
|---|---|---|
| `kind` | field, action group, navigation, card, status, dialog, menu, or content region | Determines layout contract |
| `container` | nearest usable layout boundary | All visible controls must remain within it |
| `children` | ordered semantic controls/content | DOM order remains logical focus/reading order |
| `minimumTarget` | width/height | Interactive controls are at least 44 by 44 CSS pixels |
| `wrapPolicy` | stack, wrap, grid, local scroll, or bounded overflow | Must be intentional and documented by the UI contract |
| `state` | entered/selected/open/focused/pending values | Preserved across layout changes |

Relationships:

- A page contains one or more Responsive Layout Units.
- A labeled field unit keeps its label, control, help, and error together.
- An action group orders primary and secondary actions without changing DOM order at breakpoints.
- Local horizontal scrolling is allowed only for an explicitly contracted region such as collapsed
  navigation; it must never create document-level horizontal overflow.

## Viewport Profile

A validation fixture, not stored application data.

| Field | Values / rules |
|---|---|
| width | 320, 375, 390, 768, 1024, 1280, or 1440 CSS pixels |
| height | Representative device/desktop height sufficient for the journey |
| orientation | Portrait or landscape where applicable |
| browserClass | Chromium or WebKit; iPhone/iPad device profile where applicable |
| inputMode | Keyboard/pointer or touch; on-screen keyboard where relevant |
| textZoom | Default or 200% |
| motion | Default or reduced |
| safeArea | No inset or representative iPhone/iPad inset |

Responsive transitions:

```text
wide desktop <-> desktop/tablet grid <-> phone single-column presentation
```

The transition changes layout only. It must not submit, clear, duplicate, or reorder semantic state;
close dialogs; lose focus context; or conceal the only available action.
