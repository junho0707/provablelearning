/**
 * What a signed-in page shows while its server render is in flight.
 *
 * These pages are per-buyer, so nothing about them can be served from a cache — the render waits on
 * the account's own rows every time. Without a `loading.tsx` boundary the browser simply held the
 * previous page, unchanged, for that whole second: a tab click looked like a click that missed.
 * This is the acknowledgement — the page frame, in the hairlines and off-white the real page uses,
 * so the swap when the data lands is a fill rather than a repaint.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <main aria-hidden className="mx-auto max-w-[1200px] animate-pulse px-6 py-16 sm:px-10">
      <div className="h-10 w-52 bg-navy-950/10" />
      <div className="mt-10 border-t border-navy-950/10">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="border-b border-navy-950/10 py-7">
            <div className="h-5 w-40 bg-navy-950/10" />
            <div className="mt-3 h-4 w-64 bg-navy-950/[0.07]" />
          </div>
        ))}
      </div>
    </main>
  );
}
