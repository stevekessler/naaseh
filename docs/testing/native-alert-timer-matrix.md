# Native Alert and Timer Device Matrix

Run this release gate on supported iOS 27, iPadOS 27, and macOS 27 hardware. Record the build,
device, OS build, APNs environment, tester, time, and pass/fail evidence for every row.

| Surface                    | Required cases                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iPhone notification        | denied/provisional/authorized settings; sandbox and production token rotation; generic locked preview; opted-in private preview; stale action; invalid-token cleanup; duplicate occurrence |
| iPhone Live Activity       | start, pause, resume, reset, work/rest switch, force quit, reboot, clock/time-zone change, repeated action, offline action, server conflict                                                |
| iPad notification/activity | split view, external display, locked device, action from banner, action from activity, cross-device convergence                                                                            |
| Mac notification           | denied/authorized settings, generic preview, click routing, stale action, token rotation, duplicate occurrence                                                                             |
| Mac timer/status item      | window and status-item controls, keyboard alternatives, sleep/wake, relaunch, offline action, conflict, cross-device convergence                                                           |

Protected task text must not appear in logs, default payloads, lock-screen previews, activity state,
status items, URLs, or screenshots. Every action is re-authorized against current task access.
