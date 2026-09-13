import { ProfilePictureSettings } from './ProfilePictureSettings.js';
import { SecuritySettings } from './SecuritySettings.js';
import { ReminderSettings } from '../reminders/ReminderSettings.js';
import { CompletionSoundSetting } from '../tasks/CompletionSoundSetting.js';
import { GoogleSyncPage } from '../google-sync/GoogleSyncPage.js';

export function ProfilePage({
  csrfToken,
  role,
  userId,
  refreshUsers,
}: {
  csrfToken: string;
  role: 'admin' | 'user';
  userId: string;
  refreshUsers: () => Promise<void>;
}) {
  return (
    <main aria-labelledby="profile-title">
      <h1 id="profile-title">Your profile</h1>
      <ProfilePictureSettings userId={userId} csrfToken={csrfToken} refresh={refreshUsers} />
      <section className="panel" aria-labelledby="preferences-title">
        <h2 id="preferences-title">Reminders and sounds</h2>
        <ReminderSettings csrfToken={csrfToken} />
        <CompletionSoundSetting />
      </section>
      <GoogleSyncPage csrfToken={csrfToken} />
      <SecuritySettings csrfToken={csrfToken} role={role} />
    </main>
  );
}
