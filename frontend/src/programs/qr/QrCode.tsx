import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
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
  const [copied, setCopied] = useState(false);

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

  if (error) return <p className="qr__error text-[13px] text-rose-400">{error}</p>;
  if (!svg) return <div className="qr__pending" style={{ width: size, height: size }} />;

  const href = svgToDataUrl(svg);
  const filename = `${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'qr'}.svg`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="qr flex flex-col items-center gap-4">
      {/* An <img> rather than inlined markup: the SVG comes from an encoder and
          carries a caller-supplied logo URL, and an <img> cannot execute
          anything the way inlined SVG can. */}
      <div className="qr__frame rounded-2xl bg-white p-4">
        <img
          className="qr__image block"
          src={href}
          alt={`QR code for ${label}`}
          width={size}
          height={size}
        />
      </div>
      <div className="qr__actions flex flex-wrap justify-center gap-2">
        <Button variant="raised" asChild>
          <a href={href} download={filename}>
            <Download size={16} aria-hidden />
            Download
          </a>
        </Button>
        <Button variant="raised" onClick={() => void copy()}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
