# Profile and administration

Open **Profile** for settings that belong to your own account: reminders, completion sounds, Google
Tasks setup, password reset, and two-factor authentication. The former `/google` address opens the
same profile destination, so bookmarks continue to work without changing Google synchronization
behavior.

Only administrators can open **Admin**. The user table is ordered by username and stable user ID and
loads at most 100 accounts at a time. It reports role, status, a safe TFA state, a bounded group
summary, and version-aware actions. An administrator cannot disable their own active account or the
last active administrator.

Group fields show only active groups already authorized for the signed-in user. Type to filter the
dropdown, choose **No group** or **Everyone** to clear it, and expect cached options to be identified
while offline. The Join Group dialog is unchanged: it accepts a PIN only after a group is selected.
