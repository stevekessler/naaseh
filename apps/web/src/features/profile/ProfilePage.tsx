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
    <main className="profile-page" aria-labelledby="profile-title">
      <h1 id="profile-title">Your profile</h1>
      <div className="profile-sections">
        <details className="profile-section" open>
          <summary>Profile photo</summary>
          <div className="profile-section-content">
            <ProfilePictureSettings
              userId={userId}
              csrfToken={csrfToken}
              refresh={refreshUsers}
              showHeading={false}
            />
          </div>
        </details>
        <details className="profile-section">
          <summary>Reminders and sounds</summary>
          <div className="profile-section-content profile-preferences">
            <ReminderSettings csrfToken={csrfToken} />
            <CompletionSoundSetting />
          </div>
        </details>
        <details className="profile-section">
          <summary>Google Tasks synchronization</summary>
          <div className="profile-section-content">
            <GoogleSyncPage csrfToken={csrfToken} showHeading={false} />
          </div>
        </details>
        <details className="profile-section">
          <summary>Account security</summary>
          <div className="profile-section-content">
            <SecuritySettings csrfToken={csrfToken} role={role} showHeading={false} />
          </div>
        </details>
      </div>
    </main>
  );
}
