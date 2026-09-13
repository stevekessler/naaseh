import { useState } from 'react';
import { UserAvatar } from './user-directory.js';
export function ProfilePictureSettings({
  userId,
  csrfToken,
  refresh,
}: {
  userId: string;
  csrfToken: string;
  refresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size < 1 ||
      file.size > 5_000_000
    ) {
      setStatus('Choose a JPEG, PNG, or WebP image up to 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/v1/profile/picture/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
      });
      if (!response.ok) throw new Error('upload');
      const result = (await response.json()) as {
        uploadUrl: string;
        headers: Record<string, string>;
      };
      // The browser supplies Content-Length; it is a forbidden script-controlled header.
      const headers = Object.fromEntries(
        Object.entries(result.headers).filter(([key]) => key.toLowerCase() !== 'content-length'),
      );
      const saved = await fetch(result.uploadUrl, { method: 'PUT', headers, body: file });
      if (!saved.ok) throw new Error('upload');
      setStatus('Photo uploaded and processing. Select Refresh photo in a few seconds.');
    } catch {
      setStatus('Photo could not be uploaded. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Profile photo</h2>
      <UserAvatar userId={userId} showName />
      <p>Your photo is visible to signed-in users in groups and shared content.</p>
      <label>
        Upload profile photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void refresh()
            .then(() => setStatus('Profile refreshed.'))
            .catch(() => setStatus('Could not refresh the photo.'));
        }}
      >
        Refresh photo
      </button>
      <p role="status">{status}</p>
    </section>
  );
}
