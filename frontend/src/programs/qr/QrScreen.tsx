import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../components/ui/button';
import { QrCode } from './QrCode';
import { contrastRatio, contrastVerdict, defaults, eccLevels, isEcc, type Ecc } from './qr';
import './qr.css';

/**
 * reAFresh · QR Generator.
 *
 * Opens on whatever the URL carries, so the assistant can hand a code over to
 * the tool — `/qr?text=…&ecc=H` is a working handoff, not a screenshot of one.
 * The logo cannot travel that way (it is a file, not a query parameter), so a
 * code that had one arrives without it and says so.
 */
export function QrScreen() {
  const [params] = useSearchParams();

  const [text, setText] = useState(() => params.get('text') ?? '');
  const [ecc, setEcc] = useState<Ecc>(() => {
    const wanted = (params.get('ecc') ?? '').toUpperCase();
    return isEcc(wanted) ? wanted : defaults.ecc;
  });
  const [fg, setFg] = useState(() => params.get('fg') ?? defaults.fg);
  const [bg, setBg] = useState(() => params.get('bg') ?? defaults.bg);
  const [logo, setLogo] = useState<string | null>(null);

  const ratio = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const verdict = contrastVerdict(ratio);

  const clear = () => {
    setText('');
    setEcc(defaults.ecc);
    setFg(defaults.fg);
    setBg(defaults.bg);
    setLogo(null);
  };

  return (
    <div className="page qr-page px-4! py-4! md:px-8! md:py-6! font-sans text-foreground">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
        <div className="surface-3d rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold">Encode</span>
            <span className="text-xs text-muted-foreground">{text.length} chars</span>
          </div>

          <textarea
            className="inset-field qr-page__text w-full rounded-[10px] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            rows={3}
            value={text}
            placeholder="A URL, or any text"
            onChange={(event) => setText(event.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.08em] text-subtle-foreground">
              Correction
            </span>
            <div
              role="group"
              aria-label="Correction level"
              className="inline-flex w-fit gap-0.5 rounded-[10px] border border-white/[0.07] bg-[#050506] p-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]"
            >
              {eccLevels.map((level) => {
                const active = (logo ? 'H' : ecc) === level;
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={active}
                    disabled={logo !== null}
                    className={cn(
                      'h-7 min-w-8 rounded-[7px] px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      active ? 'glow-active text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setEcc(level)}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-5">
            <label className="flex flex-col items-start gap-1.5">
              <span className="text-xs uppercase tracking-[0.08em] text-subtle-foreground">
                Foreground
              </span>
              <input
                type="color"
                value={fg}
                aria-label="Foreground colour"
                className="qr-swatch inset-field rounded-full"
                onChange={(event) => setFg(event.target.value)}
              />
            </label>

            <label className="flex flex-col items-start gap-1.5">
              <span className="text-xs uppercase tracking-[0.08em] text-subtle-foreground">
                Background
              </span>
              <input
                type="color"
                value={bg}
                aria-label="Background colour"
                className="qr-swatch inset-field rounded-full"
                onChange={(event) => setBg(event.target.value)}
              />
            </label>

            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                verdict === 'good'
                  ? 'border-emerald-400/35 bg-emerald-400/[0.14] text-emerald-300'
                  : verdict === 'fair'
                    ? 'border-amber-400/35 bg-amber-400/[0.14] text-amber-300'
                    : 'border-rose-400/35 bg-rose-400/[0.14] text-rose-300',
              )}
            >
              {ratio.toFixed(1)}:1 · {verdict === 'good' ? 'Pass' : verdict === 'fair' ? 'Fair' : 'Fail'}
            </span>
          </div>

          {verdict === 'poor' && (
            <p className="text-[13px] text-muted-foreground">This may not scan reliably.</p>
          )}

          {logo && (
            <p className="text-[13px] text-muted-foreground">
              A logo covers part of the code, so correction is locked to H.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="raised" size="sm" asChild>
              <label className="cursor-pointer">
                <Upload size={14} aria-hidden />
                Logo
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return setLogo(null);
                    const reader = new FileReader();
                    reader.onload = () => setLogo(String(reader.result));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>

        <div className="surface-3d rounded-2xl p-5 flex flex-col items-center gap-4">
          <div className="flex w-full items-center justify-between">
            <span className="text-[15px] font-semibold">Code</span>
          </div>
          {text.trim() ? (
            <QrCode label={text.slice(0, 40)} size={260} options={{ text, ecc, fg, bg, logo }} />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              Type something above and it appears here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
