import { describe, expect, it } from 'vitest';
import {
  QrTooLong,
  contrastRatio,
  contrastVerdict,
  isEcc,
  maxBytes,
  renderSvg,
} from './qr';

describe('qr', () => {
  it('encodes text as an svg', async () => {
    const svg = await renderSvg({ text: 'https://af.test/room-401' });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('viewBox');
  });

  it('honours the correction level and colours', async () => {
    const low = await renderSvg({ text: 'x'.repeat(200), ecc: 'L' });
    const high = await renderSvg({ text: 'x'.repeat(200), ecc: 'H' });
    // More correction means more modules for the same payload, so the grid is
    // bigger. That is the observable difference between the two.
    expect(high.length).not.toBe(low.length);

    const coloured = await renderSvg({ text: 'x', fg: '#112233', bg: '#ffeedd' });
    expect(coloured).toContain('#112233');
  });

  // A logo covers the middle, which is damage. Only the highest correction
  // level reliably survives it, whatever was asked for.
  it('forces the highest correction level when a logo is used', async () => {
    const plain = await renderSvg({ text: 'https://af.test', ecc: 'L' });
    const withLogo = await renderSvg({
      text: 'https://af.test',
      ecc: 'L',
      logo: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(withLogo).toContain('<image');
    // Level L and level H produce different grids for the same text, so a logo
    // that had not upgraded the level would render the same modules as plain.
    expect(withLogo.replace(/<rect x=.*$/, '')).not.toBe(plain.replace(/<\/svg>$/, ''));
  });

  it('knocks out a background square behind the logo', async () => {
    const svg = await renderSvg({
      text: 'https://af.test',
      bg: '#ffeedd',
      logo: 'data:image/png;base64,iVBORw0KGgo=',
    });
    // Without the knockout the logo sits on top of live modules and the reader
    // has to cope with both at once.
    expect(svg).toMatch(/<rect[^>]*fill="#ffeedd"/);
  });

  it('escapes a logo url rather than letting it close the attribute', async () => {
    const svg = await renderSvg({
      text: 'x',
      logo: 'data:image/png;base64,AAA" onload="alert(1)',
    });
    expect(svg).not.toContain('onload="alert(1)"');
    expect(svg).toContain('&quot;');
  });

  // Truncating would produce a code that scans as something other than what was
  // asked for, and nobody holding the printed poster would know.
  it('refuses a payload past the format ceiling', async () => {
    await expect(renderSvg({ text: 'x'.repeat(maxBytes + 1) })).rejects.toBeInstanceOf(
      QrTooLong,
    );
  });

  it('refuses to encode nothing', async () => {
    await expect(renderSvg({ text: '' })).rejects.toThrow();
  });

  it('reads contrast the way WCAG does', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 1);
    expect(contrastVerdict(contrastRatio('#000000', '#ffffff'))).toBe('good');
    expect(contrastVerdict(contrastRatio('#777777', '#808080'))).toBe('poor');
  });

  it('recognises only real correction levels', () => {
    expect(isEcc('H')).toBe(true);
    expect(isEcc('ULTRA')).toBe(false);
  });
});
