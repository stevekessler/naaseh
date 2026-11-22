import { useEffect, useRef, useState } from 'react';
import {
  imageByteLimit,
  imageReadChunk,
  imageTypeSchema,
  workspaceGenerationHeader,
  type FeatureHost,
  type ImagePointer,
} from '@naaseh/contacts-inventory-contracts';

async function readImage(
  host: FeatureHost,
  path: string,
  image: ImagePointer,
  imageGeneration: number,
  signal: AbortSignal,
) {
  const parts: ArrayBuffer[] = [];
  const validator = `"${imageGeneration}-${image.id}"`;
  for (let offset = 0; offset < image.bytes; offset += imageReadChunk) {
    const end = Math.min(offset + imageReadChunk, image.bytes) - 1;
    const response = await host.request(path, {
      signal,
      headers: { range: `bytes=${offset}-${end}`, 'if-match': validator },
    });
    const etag = response.headers.get('etag');
    if (
      response.status !== 206 ||
      etag !== validator ||
      response.headers.get('content-range') !== `bytes ${offset}-${end}/${image.bytes}`
    )
      throw new Error('The image changed or is no longer available.');
    const chunk = await response.arrayBuffer();
    if (chunk.byteLength !== end - offset + 1)
      throw new Error('The image response was incomplete.');
    parts.push(chunk);
  }
  signal.throwIfAborted();
  return URL.createObjectURL(new Blob(parts, { type: image.mediaType }));
}

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, 3000);
    function stop() {
      window.clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', stop, { once: true });
  });
}

export function ItemImage({
  host,
  id,
  generation,
  imageGeneration,
  image,
  refresh,
}: {
  host: FeatureHost;
  id: string;
  generation: number;
  imageGeneration: number;
  image?: ImagePointer;
  refresh(): Promise<void>;
}) {
  const path = `/items/${id}/image`;
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState<string>();
  const [status, setStatus] = useState('');
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    setSource(undefined);
    setReadError(false);
    if (image)
      void readImage(host, path, image, imageGeneration, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) URL.revokeObjectURL(result);
          else {
            url = result;
            setSource(result);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setReadError(true);
        });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [host, path, image?.id, image?.bytes, image?.mediaType, imageGeneration]);
  useEffect(() => () => operation.current?.abort(), [host, id, generation]);

  async function change(upload: File | undefined) {
    if (busy) return;
    if (!navigator.onLine) {
      setStatus('Image changes require a connection. You can still save the item details.');
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    const headers = {
      'content-type': 'application/json',
      [workspaceGenerationHeader]: String(generation),
    };
    try {
      if (!upload) {
        const response = await host.request(path, {
          method: 'DELETE',
          headers,
          signal: controller.signal,
          body: JSON.stringify({ imageGeneration }),
        });
        if (!response.ok) throw new Error('The image could not be removed.');
        setStatus('Image removed.');
      } else {
        const parsed = imageTypeSchema.safeParse(upload.type);
        if (!parsed.success || upload.size < 1 || upload.size > imageByteLimit) {
          setStatus('Choose a JPEG or PNG up to 25 MiB.');
          return;
        }
        setStatus('Uploading image…');
        const candidate = await host.request(`${path}/candidates`, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            id: crypto.randomUUID(),
            filename: upload.name,
            mediaType: parsed.data,
            bytes: upload.size,
            imageGeneration,
          }),
        });
        if (!candidate.ok) throw new Error('Could not start the upload.');
        const { id: candidateId, uploadUrl } = await candidate.json();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: upload,
          headers: { 'content-type': parsed.data, 'if-none-match': '*' },
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
        });
        const version = uploadResponse.headers.get('x-amz-version-id');
        if (!uploadResponse.ok || !version) throw new Error('The image did not upload.');
        const candidatePath = `${path}/candidates/${candidateId}`;
        let current = await host.request(`${candidatePath}/confirm`, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({ version }),
        });
        setStatus('Waiting for the image safety scan…');
        while (current.status === 202) {
          await delay(controller.signal);
          controller.signal.throwIfAborted();
          current = await host.request(candidatePath, { signal: controller.signal });
        }
        if (!current.ok || (await current.json()).state !== 'active')
          throw new Error('The image was not approved or the item changed.');
        setFile(undefined);
        if (input.current) input.current.value = '';
        setStatus('Image saved.');
      }
      await refresh();
    } catch {
      if (!controller.signal.aborted)
        setStatus(
          upload
            ? 'The new image was not saved. Any previous image is still linked.'
            : 'The image could not be removed. Refresh the item and retry.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section aria-label="Item image">
      <h2>Image</h2>
      {source && (
        <img src={source} alt="Inventory item" style={{ maxWidth: '100%', maxHeight: 320 }} />
      )}
      {readError && (
        <p role="status">The current image is unavailable. Refresh the item to try again.</p>
      )}
      <label>
        Choose an image
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          disabled={busy}
          onChange={(event) => setFile(event.currentTarget.files?.[0])}
        />
      </label>
      <button
        type="button"
        disabled={!file || busy}
        onClick={() => {
          if (file) void change(file);
        }}
      >
        {image ? 'Replace image' : 'Upload image'}
      </button>
      {image && (
        <button type="button" disabled={busy} onClick={() => void change(undefined)}>
          Remove image
        </button>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
