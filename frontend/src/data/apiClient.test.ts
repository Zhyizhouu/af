import { describe, expect, it } from 'vitest';
import { ApiClient, type ApiClientOptions } from './apiClient';

class TestError extends Error {
  constructor(
    message: string,
    readonly flagged = false,
  ) {
    super(message);
  }
}

class TestClient extends ApiClient<TestError> {
  constructor(options: ApiClientOptions) {
    super(options, {
      subject: 'widget',
      signIn: 'Sign in first.',
      error: TestError,
      flaggedStatus: 429,
      statusMessages: { 503: 'Not set up here.' },
    });
  }

  get(path: string) {
    return this.request(async () =>
      this.fetcher(`${this.base}${path}`, { headers: await this.headers() }),
    );
  }
}

const reply = (status: number, body: string) => async () =>
  new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

const client = (fetcher: typeof fetch, token: ApiClientOptions['token'] = async () => 'tok') =>
  new TestClient({ base: 'https://api.test/', token, fetcher });

describe('ApiClient', () => {
  it('trims trailing slashes from the base', () => {
    expect(client(reply(200, '{}')).base).toBe('https://api.test');
  });

  it('signs the call with the bearer token and parses the body', async () => {
    let seen: Headers | undefined;
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;

    expect(await client(fetcher).get('/x')).toEqual({ ok: true });
    expect(seen?.get('Authorization')).toBe('Bearer tok');
  });

  it('refuses to call without a token, whether it is null or throws', async () => {
    const fetcher = reply(200, '{}') as typeof fetch;
    await expect(client(fetcher, async () => null).get('/x')).rejects.toThrow('Sign in first.');
    await expect(
      client(fetcher, async () => {
        throw new Error('no user');
      }).get('/x'),
    ).rejects.toThrow('Sign in first.');
  });

  it('says so when no base is configured', async () => {
    const bare = new TestClient({ base: '', token: async () => 'tok' });
    await expect(bare.get('/x')).rejects.toThrow(/No widget is configured/);
  });

  it('reports an unreachable service by address', async () => {
    const fetcher = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    await expect(client(fetcher).get('/x')).rejects.toThrow(
      'The widget at https://api.test is not reachable.',
    );
  });

  it('prefers the server error text, then the program status text, then a generic line', async () => {
    await expect(client(reply(500, '{"error":"boom"}') as typeof fetch).get('/x')).rejects.toThrow('boom');
    await expect(client(reply(503, '<html>') as typeof fetch).get('/x')).rejects.toThrow('Not set up here.');
    await expect(client(reply(502, '<html>') as typeof fetch).get('/x')).rejects.toThrow(
      'The widget returned 502.',
    );
  });

  it('sets the error flag only for the flagged status', async () => {
    const throttled = await client(reply(429, '{}') as typeof fetch).get('/x').catch((e: TestError) => e);
    const other = await client(reply(500, '{}') as typeof fetch).get('/x').catch((e: TestError) => e);
    expect((throttled as TestError).flagged).toBe(true);
    expect((other as TestError).flagged).toBe(false);
  });
});
