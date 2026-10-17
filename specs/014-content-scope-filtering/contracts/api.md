# API Contract Changes

## Tasks

- Task create requires `assigneeId`; clients default it to the signed-in user before validation.
- Task patch may change `assigneeId` only to an active selectable user and may not clear it.
- Task list/read authorization treats every unlocked task as account-public even when `groupId` is present. Private tasks remain owner-only for ordinary users.
- Task responses always contain `assigneeId` after migration.

## Filter State

Task/search URL state adds `scope=default|all`, `assigneeIds`, `groupIds`, and `match=all|any`. Legacy `assigneeId` is accepted and normalized to one `assigneeIds` value. Invalid values fall back safely without broadening authorization.

## Groups

`GET /groups/{groupId}` retains its authorized `{ group, members }` response. Clients call it automatically for each joined or otherwise inspectable group and render per-group loading and retry states.

## List Sharing

The existing versioned List patch remains the save boundary. A sharing patch contains `locked` and nullable `groupId` together so the server validates one target audience. Outcomes distinguish accepted/saved, accepted/pending transition, version conflict, authorization failure, and validation failure. A pending response includes an opaque operation identifier.
