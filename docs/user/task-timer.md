# Task timer

Open a task's details and choose **Start 10 minute timer**. There is one active timer for your account, so starting a different task asks before switching. A switch starts a new run; it does not complete either task.

You can pause, resume, stop, restart, change the duration from 1 to 1,440 whole minutes, and turn **Repeat** on or off. Turning repeat on after a timer has already finished does not restart it. When an interval finishes, each active browser gives completion feedback at most once for that run and interval. Timer completion never creates a task completion event and never marks the task complete.

The remaining time is calculated from timestamps, so navigation, reload, browser suspension, and long repeat gaps do not lose elapsed time. Offline commands are encrypted and queued. If two devices change the timer from the same version, the app shows a timer conflict that can be reapplied after refreshing or discarded. A task-access change removes its identifying timer data and pending commands from the browser when the change is learned.
