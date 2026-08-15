import { useEffect, useState } from 'react';
import { QrTooLong, renderSvg, svgToDataUrl, type QrOptions } from './qr';

/**
 * A rendered code, plus the two things anybody does with one.
 *
 * Shared by the QR Generator page and the assistant's transcript, so a code
 * produced in the chat is the same artefact the tool produces — not a preview
 * of one.
 */
export function QrCode({
  options,
  label,
  size = 220,
}: {
  options: QrOptions;
  label: string;
  size?: number;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);

    renderSvg(options)
      .then((next) => {
        if (live) setSvg(next);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        setSvg(null);
        setError(
          caught instanceof QrTooLong ? caught.message : 'That could not be encoded.',
        );
      });

    return () => {
      live = false;
    };
    // Serialised rather than passed as an object: a fresh object literal every
    // render would re-encode on every render.
  }, [options.text, options.ecc, options.fg, options.bg, options.quietZone, options.logo]);

  if (error) return <p className="qr__error">{error}</p>;
  if (!svg) return <div className="qr__pending" style={{ width: size, height: size }} />;

  const href = svgToDataUrl(svg);
  const filename = `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'qr'}.svg`;

  return (
    <div className="qr">
      {/* An <img> rather than inlined markup: the SVG comes from an encoder and
          carries a caller-supplied logo URL, and an <img> cannot execute
          anything the way inlined SVG can. */}
      <img className="qr__image" src={href} alt={`QR code for ${label}`} width={size} height={size} />
      <div className="qr__actions">
        <a className="af-btn af-btn--ghost" href={href} download={filename}>
          Download SVG
        </a>
      </div>
    </div>
  );
}
