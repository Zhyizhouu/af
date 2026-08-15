import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AFHint, AFPanel } from '../../components/AF';
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

  return (
    <div className="page qr-page">
      <AFPanel label="Encode" count={`${text.length} chars`}>
        <textarea
          className="af-input af-input--prose qr-page__text"
          rows={3}
          value={text}
          placeholder="A URL, or any text"
          onChange={(event) => setText(event.target.value)}
        />

        <div className="qr-page__controls">
          <label className="qr-page__control">
            <span className="af-panel-label">Correction</span>
            <select
              className="af-nav__select"
              value={logo ? 'H' : ecc}
              disabled={logo !== null}
              onChange={(event) => {
                const next = event.target.value;
                if (isEcc(next)) setEcc(next);
              }}
            >
              {eccLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="qr-page__control">
            <span className="af-panel-label">Foreground</span>
            <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
          </label>

          <label className="qr-page__control">
            <span className="af-panel-label">Background</span>
            <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
          </label>

          <label className="qr-page__control">
            <span className="af-panel-label">Logo</span>
            <input
              type="file"
              accept="image/*"
              className="qr-page__file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return setLogo(null);
                const reader = new FileReader();
                reader.onload = () => setLogo(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>

        {/* Scanners are more forgiving than eyes, but not infinitely: a code
            that barely separates from its background reads badly in poor light
            and not at all in a photocopy. */}
        <AFHint tip={verdict === 'good'}>
          Contrast {ratio.toFixed(1)}:1 — {verdict}
          {verdict === 'poor' && '. This may not scan reliably.'}
        </AFHint>

        {logo && (
          <AFHint>
            A logo covers part of the code, so correction is locked to H.
          </AFHint>
        )}
      </AFPanel>

      <AFPanel label="Code">
        {text.trim() ? (
          <QrCode
            label={text.slice(0, 40)}
            size={260}
            options={{ text, ecc, fg, bg, logo }}
          />
        ) : (
          <AFHint>Type something above and it appears here.</AFHint>
        )}
      </AFPanel>
    </div>
  );
}
