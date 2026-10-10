# Native Apple interaction and accessibility

Na’aseh supports Dynamic Type, VoiceOver, Voice Control, reduced motion, increased contrast,
keyboard navigation, pointer/trackpad use, and multiple windows throughout every native feature.
Primary actions have descriptive labels and at least 44×44-point touch targets. Status never relies
on color or motion alone: an icon, label, value, and polite announcement communicate every success,
warning, error, conflict, offline state, and progress change.

- Tasks, lists, Journal, reports, and settings preserve focus after saves and return it to the
  initiating control after sheets close. Drag, swipe, context-menu, pointer, and Pencil actions have
  visible button or menu alternatives.
- iPhone layouts respect safe areas and interactive keyboard dismissal at every orientation and
  supported text size. Rich-text controls remain reachable above the keyboard.
- iPad uses adaptive two/three-column navigation, compact fallback, keyboard shortcuts, pointer
  context menus, external-display-safe sizing, and per-window restoration.
- Mac uses resizable windows, sidebar/content/inspector focus commands, conventional menus,
  toolbars, file panels, visible focus rings, and restorable placement.
- Journal, Crisis Plan, hidden memo, attachment, and export content is marked privacy-sensitive and
  redacted when protected data is unavailable. VoiceOver labels describe the control, not private
  content that is hidden or locked.
- Siri, alert, search, OAuth, file, and link routes pass the same authorization and stale-record
  checks before changing a scene. A safe unavailable view replaces inaccessible content.

Platform permission links always identify the destination and explain why it is needed. No workflow
requires a gesture, color distinction, animation, hover state, or audio cue as its only means of use.
