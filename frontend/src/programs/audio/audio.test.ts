import { describe, expect, it } from 'vitest';
import { AudioApi } from './api';

/**
 * The wire shape is not the type.
 *
 * `convert.Format` omits `bitrates` entirely for formats that take the server's
 * common set, so a raw response has the key missing rather than empty. The
 * screen reads `chosen.bitrates.length` to decide whether to show per-format
 * bitrates, and an undefined there took the whole page down — a blank screen on
 * clicking Audio Converter, with the error only in the console.
 *
 * It went unnoticed because AF_CONVERT_API was unset in every build until now:
 * `limits()` threw, `limits` stayed null, and the expression short-circuited
 * before it could reach the missing key. Configuring the converter is what made
 * it reachable, so it is worth a test rather than a second discovery.
 */
const limitsBody = {
  configured: true,
  maxUploadBytes: 536870912,
  defaultFormat: 'mp3',
  bitrates: [128, 192, 256, 320],
  defaultBitrate: 192,
  resultTtlSeconds: 7200,
  formats: [
    // As the server actually sends it — no `bitrates` key at all.
    { id: 'mp3', label: 'MP3', extension: 'mp3', mime: 'audio/mpeg', lossy: true, note: 'plays everywhere' },
    { id: 'opus', label: 'Opus', extension: 'opus', mime: 'audio/opus', lossy: true, bitrates: [96, 128, 192, 256], note: 'caps at 256' },
  ],
};

const clientFor = (body: unknown) =>
  new AudioApi({
    base: 'https://api.test',
    token: async () => 'id-token',
    fetcher: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

describe('AudioApi.limits', () => {
  it('fills in bitrates the server omitted', async () => {
    const limits = await clientFor(limitsBody).limits();

    const mp3 = limits.formats.find((f) => f.id === 'mp3');
    expect(mp3).toBeDefined();
    // The point of the test: an array, not undefined, so `.length` is safe.
    expect(mp3!.bitrates).toEqual([]);
    expect(Array.isArray(mp3!.bitrates)).toBe(true);
  });

  it('leaves a format that does carry bitrates alone', async () => {
    const limits = await clientFor(limitsBody).limits();
    expect(limits.formats.find((f) => f.id === 'opus')!.bitrates).toEqual([96, 128, 192, 256]);
  });

  // A server predating the converter split sends no `configured` key, and those
  // all had a converter — assuming false would hide a working page.
  it('treats a missing `configured` as configured', async () => {
    const { configured: _drop, ...older } = limitsBody;
    expect((await clientFor(older).limits()).configured).toBe(true);
  });

  it('reports an unconfigured converter', async () => {
    const limits = await clientFor({ ...limitsBody, configured: false }).limits();
    expect(limits.configured).toBe(false);
  });
});
