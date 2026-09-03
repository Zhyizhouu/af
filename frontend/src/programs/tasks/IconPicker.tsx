import { useRef, useState } from 'react';
import { AFButton, AFHint, AFPanel } from '../../components/AF';
import type { TaskPageIcon } from '../../data/db';
import { maxIconBytes } from './store';

/** Plain Unicode glyphs, matching the app's existing icon vocabulary — no
 *  colour emoji anywhere else in the app, so none here either. */
const presetIcons = [
  '◆', '✦', '▦', '☑', '◈', '♪', '▣', '⌂',
  '★', '▲', '●', '■', '◐', '✎', '⚑', '⏱',
  '✓', '⚙', '◎', '▢', '✱', '⬡', '▶', '⚐',
];

export function IconPicker({
  onPick,
  onClose,
}: {
  onPick: (icon: TaskPageIcon) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    if (file.size > maxIconBytes) {
      setError(`That icon is too large — keep it under ${Math.round(maxIconBytes / 1024)} KB.`);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onPick({ kind: 'upload', value: reader.result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="cal__overlay" role="dialog" aria-label="Choose an icon">
      <AFPanel label="Icon" className="cal__editor">
        <div className="tsk__icon-grid">
          {presetIcons.map((glyph) => (
            <button
              key={glyph}
              type="button"
              className="tsk__icon-option"
              onClick={() => onPick({ kind: 'preset', value: glyph })}
            >
              {glyph}
            </button>
          ))}
        </div>

        <AFButton label="Upload icon" variant="quiet" onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
            event.target.value = '';
          }}
        />
        {error && <AFHint>{error}</AFHint>}

        <div className="cal__editor-actions">
          <AFButton label="Cancel" variant="quiet" onClick={onClose} />
        </div>
      </AFPanel>
    </div>
  );
}
