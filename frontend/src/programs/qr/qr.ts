import QRCode from 'qrcode';

/**
 * QR generation.
 *
 * SVG rather than canvas, unlike the Flutter build's custom painter. Three
 * reasons: it scales without resampling, it is a string so it can be diffed and
 * tested without a rendering surface, and a logo composites into it as one more
 * element rather than as a pixel operation.
 */

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export const eccLevels: readonly Ecc[] = ['L', 'M', 'Q', 'H'];

export const isEcc = (value: string): value is Ecc =>
  (eccLevels as readonly string[]).includes(value);

export interface QrOptions {
  text: string;
  ecc?: Ecc;
  /** Foreground and background, as CSS colours. */
  fg?: string;
  bg?: string;
  /** Quiet zone in modules. Four is the specification's minimum. */
  quietZone?: number;
  /** A data URL. Knocked into the middle when present. */
  logo?: string | null;
}

export const defaults = {
  ecc: 'M' as Ecc,
  fg: '#14161b',
  bg: '#ffffff',
  quietZone: 4,
};

/** The format's own ceiling: version 40 at level L, and every other less. */
export const maxBytes = 2953;

export class QrTooLong extends Error {
  constructor() {
    super('That is too long to fit in a QR code.');
    this.name = 'QrTooLong';
  }
}

/**
 * How much of the code's width the logo covers.
 *
 * 22% is the conventional ceiling. Level H recovers about 30% of the modules,
 * and the knockout eats into that budget along with whatever damage the printed
 * code picks up afterwards — so this leaves headroom rather than spending it
 * all on decoration.
 */
const logoFraction = 0.22;

export async function renderSvg(options: QrOptions): Promise<string> {
  const text = options.text;
  if (!text) throw new Error('Nothing to encode.');
  if (new TextEncoder().encode(text).length > maxBytes) throw new QrTooLong();

  // A logo covers the middle, which is damage; only the highest correction
  // level reliably survives it. Forced here as well as on the server, because
  // this function is also what the QR Generator page calls directly.
  const ecc = options.logo ? 'H' : (options.ecc ?? defaults.ecc);

  const svg = await QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: ecc,
    margin: options.quietZone ?? defaults.quietZone,
    color: {
      dark: options.fg ?? defaults.fg,
      light: options.bg ?? defaults.bg,
    },
  });

  return options.logo ? withLogo(svg, options.logo, options.bg ?? defaults.bg) : svg;
}

/**
 * Composites a logo into the middle of a rendered code.
 *
 * The knockout is a plain square of the background colour rather than a rounded
 * or circular one: a scanner reads modules, and a shape that clips a module
 * halfway is worse for it than one that removes whole modules cleanly.
 */
function withLogo(svg: string, logo: string, background: string): string {
  const viewBox = /viewBox="([^"]+)"/.exec(svg);
  if (!viewBox?.[1]) return svg;

  const parts = viewBox[1].split(/\s+/).map(Number);
  const size = parts[2];
  if (!size || !Number.isFinite(size)) return svg;

  const box = size * logoFraction;
  const offset = (size - box) / 2;
  // A little bleed so the knockout does not leave a hairline of a module
  // showing around the image.
  const pad = box * 0.08;

  const overlay =
    `<rect x="${offset - pad}" y="${offset - pad}" ` +
    `width="${box + pad * 2}" height="${box + pad * 2}" fill="${background}"/>` +
    `<image x="${offset}" y="${offset}" width="${box}" height="${box}" ` +
    `href="${escapeAttribute(logo)}" preserveAspectRatio="xMidYMid meet"/>`;

  return svg.replace('</svg>', `${overlay}</svg>`);
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The WCAG contrast ratio between the two colours.
 *
 * Scanners are more forgiving than eyes, but not infinitely: a code whose
 * foreground barely separates from its background reads badly in poor light and
 * not at all in a photocopy. The QR page shows this so the problem is visible
 * before the poster is printed.
 */
export function contrastRatio(fg: string, bg: string): number {
  const light = relativeLuminance(bg);
  const dark = relativeLuminance(fg);
  const [hi, lo] = light > dark ? [light, dark] : [dark, light];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastVerdict = 'good' | 'fair' | 'poor';

export function contrastVerdict(ratio: number): ContrastVerdict {
  if (ratio >= 7) return 'good';
  if (ratio >= 4.5) return 'fair';
  return 'poor';
}

function relativeLuminance(colour: string): number {
  const [r, g, b] = parseHex(colour);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Hex only — the pickers on both surfaces produce hex and nothing else. */
export function parseHex(colour: string): [number, number, number] {
  const hex = colour.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** An SVG string as something an `<img>` or a download can take. */
export const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
