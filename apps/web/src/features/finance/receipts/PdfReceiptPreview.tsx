import { useEffect, useRef, useState } from 'react';
import { AnnotationMode, GlobalWorkerOptions, getDocument, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfReceiptPreview({ blob, filename }: { blob: Blob; filename: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const display = canvas.current;
    if (!display) return;
    let loading: ReturnType<typeof getDocument> | undefined;
    let drawing: RenderTask | undefined;
    let closed = false;
    setReady(false);
    setFailed(false);
    void (async () => {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (closed) return;
      loading = getDocument({
        data,
        enableXfa: false,
        useWasm: false,
        useWorkerFetch: false,
        stopAtErrors: true,
        maxImageSize: 12_500_000,
        canvasMaxAreaInBytes: 50_000_000,
      });
      const pdf = await loading.promise;
      const page = await pdf.getPage(pageNumber);
      if (closed) return;
      const size = page.getViewport({ scale: 1 });
      if (
        !Number.isFinite(size.width) ||
        !Number.isFinite(size.height) ||
        size.width <= 0 ||
        size.height <= 0
      )
        throw new Error('Invalid PDF page size.');
      const viewport = page.getViewport({
        scale: Math.min(2, 1600 / Math.max(size.width, size.height)),
      });
      display.width = Math.max(1, Math.floor(viewport.width));
      display.height = Math.max(1, Math.floor(viewport.height));
      drawing = page.render({ canvas: display, viewport, annotationMode: AnnotationMode.DISABLE });
      await drawing.promise;
      if (!closed) {
        setPageCount(pdf.numPages);
        setReady(true);
      }
    })().catch(() => {
      if (!closed) setFailed(true);
    });
    return () => {
      closed = true;
      drawing?.cancel();
      display.width = 0;
      display.height = 0;
      void loading?.destroy().catch(() => {});
    };
  }, [blob, pageNumber]);

  return (
    <>
      {!ready && !failed ? <p role="status">Rendering PDF preview…</p> : null}
      {failed ? <p>Preview unavailable. You can save the verified original.</p> : null}
      <canvas
        ref={canvas}
        role="img"
        aria-label={filename + ' page ' + pageNumber}
        hidden={!ready}
        className="finance-receipt-preview"
      />
      {pageCount > 1 ? (
        <div>
          <button
            type="button"
            disabled={pageNumber <= 1 || !ready}
            onClick={() => setPageNumber(pageNumber - 1)}
          >
            Previous PDF page
          </button>
          <button
            type="button"
            disabled={pageNumber >= pageCount || !ready}
            onClick={() => setPageNumber(pageNumber + 1)}
          >
            Next PDF page
          </button>
        </div>
      ) : null}
    </>
  );
}
