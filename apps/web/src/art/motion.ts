// Reduced motion for the decorative art. Both pages keep the #reduce-motion checkbox in sync with
// the system preference and the user's own toggle, so the checkbox is the single source of truth;
// without it (tests, the dev preview) the media query decides.

const QUERY = '(prefers-reduced-motion: reduce)';

export function reducedMotion(doc: Document = document): boolean {
  const box = doc.getElementById('reduce-motion');
  if (box instanceof HTMLInputElement) return box.checked;
  return doc.defaultView?.matchMedia?.(QUERY).matches ?? false;
}

/**
 * Calls `fn` after the reduce-motion setting may have changed (toggle or system preference).
 * The call is deferred one task so the page's own handlers have updated the checkbox first.
 */
export function onMotionChange(doc: Document, fn: () => void): () => void {
  const later = () => setTimeout(fn, 0);
  const query = doc.defaultView?.matchMedia?.(QUERY);
  doc.addEventListener('change', onChange);
  query?.addEventListener?.('change', later);
  function onChange(e: Event) {
    if ((e.target as Element | null)?.id === 'reduce-motion') later();
  }
  return () => {
    doc.removeEventListener('change', onChange);
    query?.removeEventListener?.('change', later);
  };
}
