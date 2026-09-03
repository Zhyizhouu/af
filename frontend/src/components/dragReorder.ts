import { useRef, useState, type DragEvent } from 'react';

/**
 * Native HTML5 drag-and-drop for a flat, reorderable list — no dependency.
 *
 * Returns one function that produces the drag props for a given row index;
 * spread it onto whatever element should be the drag handle for that row.
 * `onReorder` is called once, on drop, with the row's original and target
 * index — callers own turning that into whatever storage move they need
 * (`moveOption`, a settings array splice, etc.).
 */
export function useDragReorder(onReorder: (fromIndex: number, toIndex: number) => void) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (index: number) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      dragIndex.current = index;
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      if (dragIndex.current !== null && dragIndex.current !== index) setOverIndex(index);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const from = dragIndex.current;
      dragIndex.current = null;
      setOverIndex(null);
      if (from !== null && from !== index) onReorder(from, index);
    },
    onDragEnd: () => {
      dragIndex.current = null;
      setOverIndex(null);
    },
    className: overIndex === index ? 'is-drag-over' : '',
  });
}
