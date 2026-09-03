import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AFIconButton } from '../../components/AF';
import type { TaskPageRow } from '../../data/db';
import { savePageField } from './store';

type BlockTag = 'p' | 'h1' | 'h2' | 'h3';

const slashOptions: readonly { label: string; tag: BlockTag }[] = [
  { label: 'Text', tag: 'p' },
  { label: 'Heading 1', tag: 'h1' },
  { label: 'Heading 2', tag: 'h2' },
  { label: 'Heading 3', tag: 'h3' },
];

/**
 * A page's rich-text body: one `contentEditable` surface, a `/` menu for
 * block types, and Ctrl/Cmd+B/I for marks.
 *
 * Deliberately not a block-array model — this stores one sanitized HTML
 * string (`TaskPageRow.body`) and lets `execCommand` do the formatting, which
 * covers exactly the requested surface (paragraphs, h1–h3, bold, italic)
 * without building a custom document model for it.
 */
export function PageBody({ page, onChange }: { page: TaskPageRow; onChange: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [slash, setSlash] = useState<{ query: string; top: number; left: number } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  // A different page opened into the same still-mounted detail view — resync
  // the editable surface, mirroring `PageDetail`'s own title resync.
  useEffect(() => {
    if (editor.current) editor.current.innerHTML = page.body;
    setSlash(null);
  }, [page.id]);

  const commit = () => {
    if (editor.current) void savePageField(page.id, { body: editor.current.innerHTML }).then(onChange);
  };

  const applyBlock = (tag: BlockTag) => {
    document.execCommand('formatBlock', false, `<${tag}>`);
  };

  /** Removes the typed `/query` just before the caret, one character at a
   *  time — `execCommand('delete')` operates on the live selection, which is
   *  still the caret's position because the menu's click handler keeps focus
   *  on the editor (see `onMouseDown` below). */
  const removeSlashQuery = (query: string) => {
    for (let i = 0; i < query.length + 1; i++) document.execCommand('delete');
  };

  const pickSlash = (tag: BlockTag) => {
    if (slash) removeSlashQuery(slash.query);
    applyBlock(tag);
    setSlash(null);
  };

  const filtered = slash
    ? slashOptions.filter((option) => option.label.toLowerCase().includes(slash.query.toLowerCase()))
    : [];

  const onInput = () => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    if (!selection?.isCollapsed || !anchor || !container.current) {
      setSlash(null);
      return;
    }
    const before = (anchor.textContent ?? '').slice(0, selection.anchorOffset);
    const match = /(?:^|\s)\/(\w*)$/.exec(before);
    if (!match) {
      setSlash(null);
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    const caretRect = range.getBoundingClientRect();
    const box = container.current.getBoundingClientRect();
    setSlash({ query: match[1] ?? '', top: caretRect.bottom - box.top + 4, left: caretRect.left - box.left });
    setSlashIndex(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      document.execCommand('bold');
      return;
    }
    if (meta && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      document.execCommand('italic');
      return;
    }
    if (!slash) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSlashIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSlashIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      const option = filtered[slashIndex];
      if (option) {
        event.preventDefault();
        pickSlash(option.tag);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSlash(null);
    }
  };

  return (
    <div className="tsk__body" ref={container}>
      <div className="tsk__body-bar">
        <span className="af-panel-label">Notes</span>
        <AFIconButton
          glyph="⌘"
          tooltip="Shortcuts"
          bordered={false}
          onClick={() => setShowShortcuts((open) => !open)}
        />
      </div>

      {showShortcuts && (
        <div className="tsk__body-shortcuts" role="note">
          <span className="af-meta">
            <span className="af-mono">/</span> for a block — Text, H1, H2, H3
          </span>
          <span className="af-meta">
            <span className="af-mono">Ctrl+B</span> bold
          </span>
          <span className="af-meta">
            <span className="af-mono">Ctrl+I</span> italic
          </span>
          <span className="af-meta">
            <span className="af-mono">Esc</span> close the slash menu
          </span>
        </div>
      )}

      <div
        ref={editor}
        className="tsk__body-editor af-body"
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />

      {slash && filtered.length > 0 && (
        <div className="tsk__slash-menu" role="menu" style={{ top: slash.top, left: slash.left }}>
          {filtered.map((option, index) => (
            <button
              key={option.tag}
              type="button"
              role="menuitem"
              className={index === slashIndex ? 'is-active' : ''}
              // Keeps the editor focused (and its selection alive) instead of
              // blurring to the button, which is what `pickSlash` needs.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickSlash(option.tag)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
