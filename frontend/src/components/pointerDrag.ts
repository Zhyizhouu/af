/**
 * Locks the document's cursor and text selection for the duration of a
 * pointer-driven drag.
 *
 * Without this, a resize or reorder handle only shows its `col-resize` /
 * `grabbing` cursor while the pointer is directly over the few pixels of the
 * handle itself — which is never true mid-drag, since dragging is exactly
 * the pointer moving away. That flicker back to the default arrow is what
 * makes a drag read as broken even when the logic behind it is fine.
 */
export function lockCursor(cursor: string): () => void {
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = 'none';
  return () => {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
  };
}
