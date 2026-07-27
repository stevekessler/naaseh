import type { googleSyncPreviewSchema } from '@naaseh/contracts';
import type { z } from 'zod';

export function GoogleSyncPreview({
  preview,
}: {
  preview: z.infer<typeof googleSyncPreviewSchema>;
}) {
  return (
    <section aria-labelledby="google-preview-heading">
      <h2 id="google-preview-heading">Initial synchronization preview</h2>
      <dl>
        <div>
          <dt>Publish to Google</dt>
          <dd>{preview.publishCount}</dd>
        </div>
        <div>
          <dt>Import from Google</dt>
          <dd>{preview.importCount}</dd>
        </div>
        <div>
          <dt>Private tasks excluded</dt>
          <dd>{preview.skippedPrivateCount}</dd>
        </div>
        <div>
          <dt>Undated Google tasks skipped</dt>
          <dd>{preview.skippedUndatedCount}</dd>
        </div>
      </dl>
      <p>
        Google Tasks stores a due date but not a due time. Na'aseh keeps your local time and time
        zone.
      </p>
    </section>
  );
}
