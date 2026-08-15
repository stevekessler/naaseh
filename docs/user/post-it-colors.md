# Post-it colors

Open a task's **Edit** dialog to choose one of six fixed post-it colors: Yellow, Pink, Blue, Green,
Purple, or Orange. Each choice is a labeled radio control, so selecting and reviewing the value does
not depend on color perception. The palette uses dark foreground text with audited high-contrast
backgrounds.

Color resolution follows this order:

1. The task's explicit post-it color.
2. Its category color when **Use category color** is selected.
3. Yellow when neither is set.

The color is saved in the same atomic edit as the task's other fields. Canceling the dialog changes
nothing. Offline edits remain pending locally and synchronize later; a concurrent same-task conflict
is shown through the normal task conflict workflow and is never silently merged.
