# Lists and the global directory

When adding an item to a list, enter its name and optionally enter an amount. An unsigned amount is
a cost and is stored as a negative value. Select **Credit** to store an unsigned amount as positive;
an explicit `+` or `-` sign is also honored. The list total updates from the locally saved value as
soon as the item is added.

List item creation is offline-first. The name and amount are committed with one pending sync change.
If the browser cannot make that pending change durable, the form keeps the entered values and shows
an error so the operation can be retried without creating a partial item.

Reusable global items are administered from **Global Items** at `/directory`, not from an individual
list. Every active signed-in user retains the established permission to view, add, edit, and archive
global items. A global item can be added to a selected list from that page. Within a list, linked items
continue to support local overrides and resetting those overrides to the current global value.
