# Feature Specification: Contacts and Inventory

**Feature Directory** `specs/017-contacts-inventory`

**Created** 2026-11-17

**Status** Draft

**Input** Add Contacts under Lists, a top-level Inventory section with Medicine as its first inventory type, administrative settings for reference values, and opt-in combined Search, packaged as an independently deployable Na’aseh web feature.

## Clarifications

### Session 2026-11-17

- Q: Should Steve and Heather be able to see and edit the same medication record from their own accounts? → A: Yes. Both accounts edit the same Medicine record. The sharing rule below applies to all records.
- Q: Should Contacts be one shared directory, or should Steve and Heather choose which contacts to share? → A: One shared directory. Steve and Heather automatically see and can edit every contact either creates.
- Q: How is access established and ended? → A: Contacts and all Inventory records, including Medicine, are automatically shared between Steve and Heather. Access to a record ends for both when it is deleted.

## User Scenarios & Testing

### User Story 1 - Manage and filter contacts (Priority: P1)

Steve and Heather open the same Contacts directory from the Lists menu. Either can record a contact’s phone numbers and address, edit it, or find it by name or type. An administrator can maintain contact types, and Prescriber is available from the start.

**Why this priority** — The directory is useful on its own and supplies the contacts that Medicine records can reference.

**Independent Test** — Start with the built-in Prescriber type, create and reopen a Prescriber contact, then find it using the Contacts filter page.

**Acceptance Scenarios**

1. **Given** a fresh account with access to Contacts, **when** the user opens Lists → Contacts and starts a new contact, **then** State starts at CO and Prescriber is available in Contact Type.
2. **Given** a contact with several numbers, **when** the user selects Cell as the Default Number and saves, **then** reopening the contact shows the saved values and the selected default. Changing the cell number updates the effective default, and clearing it also clears the default selection.
3. **Given** multiple contacts, **when** the user enters part of a name or phone number and filters by Contact Type, **then** the page shows contacts matching both active filters. Clearing the filters restores the accessible directory. A query with zero matches shows an empty state with a way to clear the filters.
4. **Given** an administrator and a standard user, **when** each attempts to add or rename a Contact Type, **then** only the administrator can save the change. Contacts already using a renamed type display the new name.
5. **Given** Steve creates a contact in the shared directory, **when** Heather signs in and updates the contact, **then** both see the edited record under its original UUID. An account outside the directory cannot see or edit it.

### User Story 2 - Track inventory and its location (Priority: P1)

A user opens Inventory from the main menu and records an item, where it is kept, and an optional photo. An administrator maintains the list of locations and can document details about each one.

**Why this priority** — A searchable record of what the user owns and where it is kept is the core of Inventory.

**Independent Test** — Create a location with a multiline memo, create a base item at that location, attach a photo, and find the item from the Inventory filter page.

**Acceptance Scenarios**

1. **Given** an administrator, **when** they create or edit a location with a name and multiline details, **then** the details are preserved and the location is available to select on an inventory item. A standard user can select a location and is denied administrative edits.
2. **Given** a location, **when** the user saves a base inventory item with an Item Name and Item Location, **then** reopening the item shows its name and location under the same UUID, including after edits.
3. **Given** an item with a photo, **when** the user attempts to replace it with an invalid file or a failed upload, **then** the original photo remains available. A successful replacement leaves one photo, and removal leaves no photo.
4. **Given** items at different locations, **when** the user applies an item name and location filter, **then** results match both filters. Clearing the filters restores the accessible inventory.
5. **Given** Heather opens a base item Steve created, **when** she deletes it, **then** the service denies subsequent reads, edits and image requests from either account, and each browser removes its local copy upon synchronization.

### User Story 3 - Record and filter medicine (Priority: P1)

A user selects the Medicine inventory type to record whose medicine it is, strength, dose, schedule, expiration, and prescriber. The user can mark the record for inclusion in a medication list.

**Why this priority** — Medicine is the first inventory type with its own fields and the main reason to connect Contacts with Inventory.

**Independent Test** — With a location and a Prescriber contact prepared, record a medicine, verify its saved data, and find it using Medicine filters and the medication-list view.

**Acceptance Scenarios**

1. **Given** the user is adding an inventory item, **when** they select Medicine, **then** the form shows the base fields and Medicine fields with the choices in FR-008 and FR-009. Saving and reopening preserves the chosen and entered values.
2. **Given** an administrator adds a strength unit or edits its display label, **when** the user opens the Medicine form, **then** the dropdown reflects the update and existing medicine records retain their selected unit.
3. **Given** an accessible Prescriber contact and another contact type, **when** the user chooses a prescriber, **then** only the Prescriber is offered. Multiple medicines can reference the same Prescriber.
4. **Given** the Inventory filter page, **when** the user selects Medicine, **then** the Medicine filters appear and refine the results. Changing the type to Base or All hides the Medicine filters and clears their effect.
5. **Given** a medicine, **when** the user turns Include on med list on or off, **then** it enters or leaves the user’s medication-list view. Changing Status independently preserves the toggle setting.
6. **Given** Steve creates a Medicine record, **when** Heather edits it from her account, **then** Steve sees the updated values on the same record.

### User Story 4 - Opt in to Contacts and Inventory in Search (Priority: P2)

A user can expand a combined Search to find contacts, base inventory items, and medicines when needed.

**Why this priority** — Users can find records across sections while keeping the default Search focused on the content they already see there.

**Independent Test** — Prepare a contact, base inventory item, and medicine that match the same search term. Run that query with the default settings and then with each content type enabled individually.

**Acceptance Scenarios**

1. **Given** default Search settings or saved preferences from before this feature, **when** the user searches for a term matching all three new content types, **then** Contacts, Inventory Items, and Medicine are excluded by default.
2. **Given** the same matching records, **when** the user enables each content type independently, **then** only the enabled new types appear and each result opens its record. Enabling Inventory Items alone excludes Medicine. Disabling a type removes its results from the current query.
3. **Given** a contact in a directory the user cannot access or an inventory record they cannot access, **when** a user who lacks access enables all three types and searches for it, **then** it is absent from results, snippets, and counts.

---

### Release Scenario - Deploy Contacts and Inventory independently

**Given** a supported Na’aseh web environment with the pending Finance changes and Mac/iOS releases absent, **when** an operator deploys the Contacts and Inventory release unit, **then** Lists → Contacts, Inventory, their Admin pages, and Search opt-ins are available and the core journeys pass.

**Given** an environment where Finance is already deployed and Contacts and Inventory contain saved records, **when** an operator rolls back only the Contacts and Inventory release, **then** Finance stays on its deployed version and its workflows remain available. Existing Mac/iOS clients continue to use their existing interfaces. Contacts and Inventory data are retained and are available again after redeployment.

### Edge Cases

- If one member deletes a record while the other has a pending edit, deletion takes precedence. The pending edit receives a visible conflict and cannot restore the record.

- Contacts may have identical names and items may have identical names at different locations. Results remain distinct and selecting one opens the correct record.
- A contact or item may have optional fields left blank. Blank fields display clearly and match a filter only when the filter explicitly selects missing values.
- Renaming an administrative value or a Prescriber preserves existing references. An operation that would orphan a reference or remove Prescriber eligibility from a contact referenced by Medicine is blocked with a useful explanation.
- Offline reference data may be stale. If a pending edit references a value that became invalid, the user can choose a valid replacement and retry with their other edits intact.
- An image that is still uploading or being checked has a visible status. If two replacements conflict, the user sees the conflict and the item continues to have at most one active image.

## Requirements

### Functional Requirements

- **FR-001** — Na’aseh MUST add Contacts under Lists and provide a dedicated Contacts page where users can create, view, edit, and filter their contacts.
- **FR-002** — Contacts MUST have a system-assigned stable UUID and the following fields. Contact Type MUST reference a managed Contact Type record.

  | Fields | Behavior |
  | --- | --- |
  | Prefix, First Name, Last Name | At least one of First Name and Last Name is required. |
  | Phone, Fax, Cell, Emergency Number | Each is optional. |
  | Default Number | Optional selection from the populated Phone, Cell, or Emergency Number fields. Its value follows the selected field. Clearing that field clears the selection. |
  | Address Line 1, Address Line 2, City, State, Zip | The State starts at CO on new contacts and can be changed. Zip preserves leading zeroes. |
  | Contact Type | Select one managed type or leave it blank. |

- **FR-003** — The Contacts page MUST support a text filter matching names and numbers and a Contact Type filter. Active filters narrow the same result set. Users MUST be able to clear filters and open matching contacts.
- **FR-004** — Admin MUST provide a Contact Types page for administrators to add and rename types. The built-in **Prescriber** type MUST be selectable from initial use and remain identifiable for prescriber selection even if its display name changes.
- **FR-005** — Na’aseh MUST add Inventory as a top-level menu item and section where users can create, view, edit, and filter inventory records. Admin MUST provide a Locations page where administrators can add and edit a Location Name and optional long-form, multiline Location Details.
- **FR-006** — Every inventory item MUST have a system-assigned stable UUID, Item Name, and Item Location selected from managed locations. It MAY have one Image. Users MUST be able to add, view, replace, or remove that image. Images MUST follow the current task attachment rules for JPEG and PNG, the 25 MiB size limit, scanning before availability, and authorized access. The inventory-specific limit is zero or one active image per record. Image failures MUST preserve the existing record and any previously available image.
- **FR-007** — Inventory MUST support a Base item with the common fields and a Medicine type with the common fields plus its own fields. The selected type MUST determine which additional fields are shown and saved. The type is selected when the item is created and stays fixed when editing that record.
- **FR-008** — Medicine MUST provide the following fields and choices.

  | Field | Behavior |
  | --- | --- |
  | Who’s Med | Steve, Heather, Both, Penny, OTC |
  | Status | Current, Discontinued |
  | Include on Med List | True/false toggle, initially off |
  | Strength Number | Numeric entry that accepts decimals |
  | Strength Unit | Dropdown backed by managed strength units |
  | Other | Free text |
  | Dose | Free text so values such as “½ tablet” can be recorded |
  | Time Taken | Morning, Night, Morning and Night, PRN |
  | Expiration Date | Calendar date |
  | Prescriber | Optional reference to one accessible contact of type Prescriber |

- **FR-009** — Admin MUST allow administrators to add strength units and edit their display labels. Initial labels MUST be **mg**, **G**, **mcg**, **oz**, **mL**, **IU**, and **g/mL**. Renaming a unit MUST preserve existing selections. Medicine’s Prescriber picker MUST list only contacts of the built-in Prescriber type that the user can access.
- **FR-010** — Inventory MUST provide a dedicated filter page with Item Name, Item Location, and Inventory Type filters. Selecting Medicine MUST reveal filters for Who’s Med, Status, Include on Med List, Strength Unit, Time Taken, Expiration Date range, and Prescriber. Choosing Base or All MUST hide Medicine-specific filters and stop applying them. Active filters MUST narrow the same result set and be clearable.
- **FR-011** — Inventory MUST provide a medication-list view of the shared Medicine records with Include on Med List turned on. The toggle MUST control inclusion independently of Status, ownership label, and Search preferences.
- **FR-012** — Combined Search MUST provide independent inclusion controls for Contacts, Inventory Items (Base), and Medicine. All three MUST start off for fresh or reset preferences and when upgrading preferences that lack those controls. Contacts MUST match on name or phone number and inventory items, including Medicine, on Item Name. Matching results MUST be labeled with the content type and open the accessible record.
- **FR-013** — Changes to referenced locations, types, units, and Prescriber contacts MUST maintain referential integrity. Renaming a reference value MUST preserve links. An attempted change that would invalidate an existing reference MUST explain why and retain the previously saved state.

- **FR-014** — Steve and Heather MUST automatically share all Contacts and Inventory records, including Medicine. A record created by either member MUST be visible and editable by both as soon as it syncs. Both edit the same record with one UUID. Workspace membership provides record access for both accounts.

- **FR-015** — Either member MUST be able to delete a Contact or Inventory record, including Medicine. Deletion MUST end access for both members through detail, list, Search, and image reads. A Prescriber referenced by Medicine can be deleted after its links are cleared or reassigned. On synchronization, browsers MUST remove deleted records from local views and Search and prevent pending edits or image uploads from recreating them.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries** — Only the two authorized workspace members MUST be able to view, edit, or delete shared records. Corresponding image access MUST follow its inventory record’s permissions and end on deletion. Admin permission controls catalog edits. Who’s Med is a record label and grants no access. The same access boundaries MUST govern detail pages, filters, combined Search, cached data, images, and reference previews. Contact and medicine details and item images MUST receive the existing protections for private account data in transit and at rest.
- **NFR-002 Data Durability & Recovery** — Edits MUST validate linked values, survive retries without duplicate records, and surface conflicting changes before overwriting saved data. Contact, inventory, catalog, reference, and image data MUST be covered by the applicable backup and restoration process. Recovery verification MUST check the restored links and single-image rule.
- **NFR-003 Offline Support** — Supported browsers MUST allow viewing and filtering locally available records and creating or editing records using cached reference values. Pending changes MUST survive reloads and sync when connectivity returns. The user MUST see offline, pending, failed, and conflict states. If an image upload requires a connection, the user MUST be able to save or queue the other fields and see how to complete the image upload later.
- **NFR-004 Browser & Responsive Support** — Core create, filter, search, and image journeys MUST work in current Chrome and Safari/WebKit, including iPhone and iPad layouts. Forms and filters MUST work with touch and keyboard input. Edits awaiting synchronization MUST resume in the foreground if the browser suspends background work.
- **NFR-005 Errors & Observability** — Users MUST receive actionable feedback for validation, permission, image, and synchronization failures. Structured CloudWatch logs MUST record operation, safe correlation context, outcome, and timing without contact or medicine details, image contents, or reusable image access links. Planning MUST define appropriate retention, metrics, and alerts for recurring failures.
- **NFR-006 Performance** — On a representative mobile device with 500 accessible contacts and 500 accessible inventory items, including Medicine, at least 95% of queries and filter changes against loaded data MUST show updated results within two seconds on a throttled mobile connection.
- **NFR-007 AWS Architecture & Cost Impact** — Planning MUST evaluate managed serverless options first and estimate the cost of record storage, image storage and scanning, and search. Any additional always-on capacity MUST have a documented reliability and cost justification.

- **NFR-008 Release Independence** — Contacts, Inventory, and Medicine, including their Admin and Search integrations and any feature-owned data changes, MUST ship together as one independently versioned and deployable release unit. Operators MUST be able to deploy, upgrade, and roll back that unit without deploying, upgrading, or rolling back Finance or requiring a Mac/iOS build, release, or client upgrade. The release MUST run against the supported Na’aseh web baseline without the pending Finance or Mac/iOS changes. Enabling or disabling the feature within a coupled release is insufficient to satisfy this requirement. Deployment and rollback MUST preserve supported Finance and native-client behavior and retain saved Contacts and Inventory data.

### Key Entities

- **Contact** — A directory record with a UUID, name, numbers, address, and optional Contact Type. The shared directory grants Steve and Heather equal viewing and editing access.
- **Contact Type** — An administrator-managed classification. Prescriber is built in and determines eligibility for the Medicine picker.
- **Inventory Item** — A user-owned record with a UUID, name, location, type, and optional image.
- **Inventory Type** — Determines which fields apply to an item. Base and Medicine are the initial choices.
- **Medicine** — An Inventory Item with a Who’s Med label, status, list inclusion, strength, dose, schedule, expiration, and an optional Prescriber contact.
- **Location** — An administrator-managed record with a name and optional long-form details.
- **Strength Unit** — An administrator-managed label referenced by Medicine.
- **Item Image** — An optional photo that follows the task image policy and belongs to one inventory item.

## Success Criteria

### Measurable Outcomes

- **SC-001** — The automated browser acceptance journey creates a Prescriber contact and uses it to save a Medicine item at a configured location. The workspace has two users, so first-time participant recruitment and timing are waived.
- **SC-002** — In acceptance checks, each combination of Contacts, Inventory Items, and Medicine Search controls returns exactly the matching enabled types. The default returns zero results from those three types.
- **SC-003** — In each tested failed or concurrent image replacement scenario, an item has at most one available image and its original image remains available until a replacement succeeds.
- **SC-004** — Each tested medicine enters or leaves the medication-list view when its toggle changes, and the selected Medicine filters return the expected records. Switching back to All restores results without the previous Medicine-only filters.
- **SC-005** — At least 95% of measured queries and filter changes meet the two-second target in NFR-006.
- **SC-006** — Release verification demonstrates an independent install on the supported web baseline and an upgrade, rollback, and redeployment with Finance present. Contacts and Inventory journeys pass when the unit is deployed, existing Finance and native-client smoke checks pass across each transition, and saved Contacts and Inventory data are recoverable after redeployment.

## Assumptions

- “Default number” means a preferred callable number selected from Phone, Cell, or Emergency Number. Fax is stored separately.
- “True or file” means a true/false toggle. The medication list is an Inventory view, with inclusion set explicitly for each Medicine record.
- Medicine is the only specialized inventory type in this feature. The type stays fixed after creation to preserve type-specific data. Administrators maintain contact types, locations, and strength units. New type definitions with custom fields are outside this scope.
- Who’s Med, Status, and Time Taken require a selection for Medicine. Strength, Other, Dose, Expiration Date, and Prescriber may be left blank.
- Global Inventory Items and Medicine are separate Search choices. Medicine-specific filters are on the Inventory filter page. The Contacts and Inventory pages show their own records regardless of combined Search choices.
- The shared workspace uses the two authorized account identities. Who’s Med remains a descriptive field. Admin catalogs follow existing Na’aseh admin permissions. A disconnected device may show previously loaded data until it reconnects and synchronizes the deletion.
- The Contacts and Inventory release can reuse capabilities available in the supported Na’aseh baseline, including authentication, navigation, task attachment rules, and online and offline behavior. The target experience is the web app, including supported mobile browsers. Native Contacts and Inventory screens, native project changes, and changes to Finance behavior are outside this release’s scope.
