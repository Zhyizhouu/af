import { describe, expect, it } from 'vitest';
import { dateValueFromKey, dateValueKey } from './dateValue';
import { safeUrl, sanitizeBody } from './sanitize';

describe('sanitizeBody', () => {
  it('drops script, style, iframe, object and embed with their contents', () => {
    const html =
      '<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="x">t</iframe><object>o</object><embed>';
    expect(sanitizeBody(html)).toBe('<p>a</p>');
  });

  it('strips onclick and style attributes', () => {
    expect(sanitizeBody('<p onclick="x()" style="color:red" class="c">hi</p>')).toBe('<p>hi</p>');
  });

  it('keeps allowed formatting', () => {
    const html = '<h1>T</h1><div><b>b</b><i>i</i><u>u</u><s>s</s><br></div><ul><li>x</li></ul>';
    expect(sanitizeBody(html)).toBe(html);
  });

  it('unwraps unknown elements and keeps their text', () => {
    expect(sanitizeBody('<p><span>a</span><a href="javascript:x">b</a><img src=x onerror=y></p>')).toBe(
      '<p>ab</p>',
    );
  });

  it('drops comments', () => {
    expect(sanitizeBody('<p>a<!-- c --></p>')).toBe('<p>a</p>');
  });
});

describe('safeUrl', () => {
  it('rejects javascript: and other schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('  JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('example.com')).toBeNull();
  });

  it('accepts http, https and mailto, trimmed', () => {
    expect(safeUrl(' http://a.com ')).toBe('http://a.com');
    expect(safeUrl('https://a.com/x?y=1')).toBe('https://a.com/x?y=1');
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });
});

describe('date values', () => {
  it('maps a UTC-midnight value and a Jakarta-midnight value to the same day', () => {
    const oldWay = new Date('2026-09-10').getTime();
    const newWay = dateValueFromKey('2026-09-10');
    expect(newWay).not.toBe(oldWay);
    expect(dateValueKey(oldWay)).toBe('2026-09-10');
    expect(dateValueKey(newWay)).toBe('2026-09-10');
  });
});
