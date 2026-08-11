# Feature Specification: Per-Browser Push Notifications

**Feature Branch**: `current working branch`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Make an on/off checkbox for browser push notifications. The preference must be kept per browser and should not use a cookie if at all possible."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enable Notifications in This Browser (Priority: P1)

An authenticated user can select a clearly labeled checkbox to enable browser push notifications on the browser they are currently using. The application requests permission only in response to that choice and confirms when this browser is registered.

**Why this priority**: Explicit opt-in is the essential user value and prevents unexpected notification prompts.

**Independent Test**: Sign in on a supported browser with notifications initially off, select the checkbox, grant permission, and verify that the checkbox remains selected after closing and reopening the application in that browser.

**Acceptance Scenarios**:

1. **Given** notifications are available and off in this browser, **When** the user selects "Browser push notifications" and grants permission, **Then** this browser is registered and the checkbox shows on.
2. **Given** notifications are on in this browser, **When** the user reloads or reopens the application, **Then** the checkbox still shows on without another permission prompt.
3. **Given** notifications are off in one browser, **When** the user enables them there, **Then** the preference in every other browser remains unchanged.

---

### User Story 2 - Disable Notifications in This Browser (Priority: P1)

An authenticated user can clear the checkbox to stop browser push notifications on the current browser without disabling notifications on any other browser.

**Why this priority**: A trustworthy opt-in must have an equally clear, immediate opt-out.

**Independent Test**: With notifications enabled on two browsers, clear the checkbox on one browser and verify that only that browser stops receiving reminders.

**Acceptance Scenarios**:

1. **Given** notifications are on in this browser, **When** the user clears the checkbox, **Then** this browser is unregistered and the checkbox shows off.
2. **Given** notifications are on in two browsers, **When** the user disables them in one, **Then** the other browser remains registered.
3. **Given** the user disables notifications while temporarily offline, **When** connectivity returns, **Then** the server-side registration is removed without requiring the user to repeat the action.

---

### User Story 3 - Understand Unavailable or Denied Notifications (Priority: P2)

The user receives a concise explanation when notifications cannot be enabled because deployment configuration is missing, the browser does not support them, the application must first be installed on the device, or permission was denied.

**Why this priority**: Clear state prevents a disabled capability from appearing broken and tells the user what action is possible.

**Independent Test**: Exercise each unavailable state and verify that the checkbox cannot falsely show on and that the explanation identifies the next useful action.

**Acceptance Scenarios**:

1. **Given** notification delivery is not configured for the deployment, **When** the settings are displayed, **Then** the checkbox is disabled and an administrator-facing configuration explanation is available.
2. **Given** the browser does not support push notifications, **When** the settings are displayed, **Then** the checkbox is disabled with a browser-specific explanation.
3. **Given** the user denies notification permission, **When** the permission request completes, **Then** the checkbox remains off and the application explains how browser permission can be changed.
4. **Given** the operating system requires the application to be installed before notifications are available, **When** the user views the checkbox, **Then** the application explains that prerequisite.

---

### User Story 4 - Preserve Account Privacy on Shared Browsers (Priority: P2)

Notification registration is associated with both the current browser and the authenticated account so signing out or switching accounts cannot expose one user’s reminders to another user.

**Why this priority**: A browser may be shared, and task reminder metadata must not cross account boundaries.

**Independent Test**: Enable notifications, sign out, sign in as a different user, and verify that the second user does not inherit the first user’s enabled state or reminders.

**Acceptance Scenarios**:

1. **Given** notifications are enabled for the signed-in account, **When** that account signs out, **Then** notifications for that account stop on this browser.
2. **Given** a different account signs in on the same browser, **When** notification settings are shown, **Then** that account has an independent off state unless it previously opted in on this browser.
3. **Given** the original account signs in again and its browser-local opt-in remains valid, **When** registration is safely restored, **Then** the checkbox accurately reflects the restored state.

### Edge Cases

- Browser permission is revoked outside the application while the checkbox was previously on; the next settings check must reconcile to off and explain the revoked permission.
- Browser-local site data is cleared; the application must not claim the browser is registered until actual browser and server registration state is reconciled.
- The browser subscription expires or changes; the application must repair registration safely or show the setting as off with an actionable explanation.
- Enabling is attempted without connectivity; the setting must not falsely show on, and the user must be told that connection is required.
- Disabling is attempted without connectivity; local delivery must stop immediately where supported, and remote cleanup must remain pending until reconnection.
- A stale server registration exists after the browser loses local state; delivery failures must lead to safe cleanup without exposing task content.
- Rapid repeated checkbox changes must settle on the user’s final choice without duplicate registrations.
- Current Chrome and Safari/WebKit must show accurate capability states; iPhone and iPad must explain any installation prerequisite.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present one checkbox labeled "Browser push notifications" for the current authenticated account and browser.
- **FR-002**: The checkbox MUST default to off for an account that has not opted in on the current browser.
- **FR-003**: Selecting the checkbox MUST request notification permission only as a direct result of that user action.
- **FR-004**: The checkbox MUST show on only after browser permission and current-browser registration both succeed.
- **FR-005**: Clearing the checkbox MUST stop notifications for the current account on the current browser and request removal of that registration.
- **FR-006**: Enabling or disabling notifications in one browser MUST NOT change the preference or registration in another browser.
- **FR-007**: The preference MUST be retained in persistent browser-local application storage and MUST NOT be stored in a cookie.
- **FR-008**: The browser-local preference MUST be scoped to the authenticated account so accounts sharing a browser do not inherit one another’s setting.
- **FR-009**: Signing out MUST stop delivery for the signed-out account on the current browser; any later restoration MUST verify the same account, permission, and current registration before showing on.
- **FR-010**: When notification delivery is unconfigured, unsupported, blocked, or requires application installation, the checkbox MUST be disabled or remain off and the application MUST show the relevant explanation.
- **FR-011**: Denied or revoked permission MUST never be represented as enabled.
- **FR-012**: The system MUST reconcile displayed preference, browser permission, browser subscription, and server registration whenever notification settings are loaded and after any change.
- **FR-013**: Disabling while offline MUST take effect locally as soon as the browser permits and MUST preserve remote cleanup for reconnection.
- **FR-014**: Enabling without connectivity MUST remain off until registration succeeds and MUST provide actionable feedback.
- **FR-015**: Repeated enable actions MUST NOT create duplicate registrations for the same account and browser.
- **FR-016**: Push notification content MUST remain generic and MUST NOT expose task labels, memos, collaborators, or other protected task content on a lock screen.

### Non-Functional Requirements

- **NFR-001 Security & Data Boundaries**: Only the authenticated account may create or remove its current-browser registration. Registrations must be isolated by account and browser. Private signing credentials, session credentials, and protected task content must never be placed in browser-readable settings, notification content, or logs.
- **NFR-002 Data Durability & Recovery**: Opt-out must not be silently lost. Pending unregister operations must survive an application restart and retry after reconnection. Stale or expired registrations must be safely removable.
- **NFR-003 Offline Support**: The current preference must remain readable offline. Opt-out must take local effect immediately where possible and queue remote cleanup. Opt-in must not claim success until connected registration completes.
- **NFR-004 Browser & Responsive Support**: The primary journeys must work in current stable Chrome and Safari/WebKit. Capability and installation limitations on iPhone and iPad must be detected and explained. The checkbox and explanation must remain operable with keyboard, touch, zoom, and narrow viewports.
- **NFR-005 Errors & Observability**: User-facing errors must identify the corrective action without exposing credentials or task content. Delivery, registration, cleanup, expiry, and failure outcomes must be recorded with safe account/browser correlation, metrics, and alarms sufficient to diagnose systemic failures.
- **NFR-006 Performance**: The current checkbox state must become visible within one second of settings display under normal conditions, and a completed toggle must visibly settle within two seconds excluding time spent in browser-owned permission prompts.
- **NFR-007 AWS Architecture & Cost Impact**: The feature must reuse the existing on-demand notification architecture and must not add always-on compute. Stale-registration cleanup and observability must remain proportional to actual notification usage.

### Key Entities

- **Browser Notification Preference**: The authenticated account’s opt-in choice for one browser, including enabled state, last reconciliation time, and pending cleanup state. It is local to that browser and is not a cookie or a cross-browser preference.
- **Browser Push Registration**: The current browser’s delivery registration for one authenticated account, including a browser identifier, delivery endpoint material, lifecycle status, and safe timestamps.
- **Notification Permission State**: The browser-controlled permission outcome used to determine whether the requested preference can actually be active.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In supported, configured browsers, at least 95% of users can enable notifications on their first attempt in under 30 seconds, excluding time they spend deciding at the permission prompt.
- **SC-002**: In automated two-browser testing, 100% of enable and disable operations affect only the selected browser.
- **SC-003**: In account-switch testing, zero reminders or enabled states cross from one authenticated account to another on the same browser.
- **SC-004**: After a successful change or application restart, the checkbox reflects actual permission and registration state within one second under normal conditions.
- **SC-005**: In offline opt-out tests, local notification delivery stops immediately where the browser allows it and remote cleanup completes automatically within one minute of restored connectivity.
- **SC-006**: Unsupported, unconfigured, denied, revoked, and installation-required scenarios produce no false enabled state and provide a useful explanation in 100% of covered browser cases.
- **SC-007**: Inspection of browser storage and outbound requests confirms that no cookie is created or modified for the notification preference.

## Assumptions

- Browser push notifications are optional and start off until the user explicitly opts in.
- The preference belongs to an authenticated account on one browser, not to the account globally and not to every account using that browser.
- Existing generic reminder scheduling and delivery remain in scope; email, SMS, and Gmail delivery are outside this feature.
- Existing authentication and browser identity mechanisms are reused.
- Notification permission remains controlled by the browser or operating system and cannot be bypassed by the application.
- Clearing all site data may remove the local preference; the application reconciles actual permission and registration state rather than guessing.
- Deployment operators provide a valid matching notification signing-key configuration before the checkbox can be enabled.
