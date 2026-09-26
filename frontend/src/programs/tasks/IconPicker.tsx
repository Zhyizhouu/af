import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
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
  current,
  onPick,
  onClose,
}: {
  current?: TaskPageIcon;
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="surface-3d rounded-2xl border-0 bg-transparent p-5 sm:max-w-md" aria-label="Choose an icon">
        <DialogHeader>
          <DialogTitle>Icon</DialogTitle>
        </DialogHeader>

        <div className="tsk__icon-grid">
          {presetIcons.map((glyph) => {
            const active = current?.kind === 'preset' && current.value === glyph;
            return (
              <button
                key={glyph}
                type="button"
                className={`tsk__icon-option${active ? ' glow-active' : ' raised'}`}
                onClick={() => onPick({ kind: 'preset', value: glyph })}
              >
                {glyph}
              </button>
            );
          })}
        </div>

        <Button variant="raised" onClick={() => fileInput.current?.click()}>
          <Upload size={15} aria-hidden />
          Upload icon
        </Button>
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
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="tsk__panel-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
