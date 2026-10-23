import { convertApiBase } from './runtimeConfig';

/**
 * What the gateway clients share: where it lives, how a call is signed, and
 * what a failure is turned into.
 *
 * The assistant and the converter talk to the same Go service and fail in the
 * same ways, so the plumbing is written once and each program keeps only its
 * routes and the handful of status messages that are really its own.
 */

export interface ApiClientOptions {
  base?: string;
  token?: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

export interface ApiClientSpec<E extends Error> {
  /** What the person calls the service in an error: "assistant", "converter". */
  subject: string;
  /** Said when there is no signed-in account to sign the call with. */
  signIn: string;
  /** The program's own error type: a message, and one flag it derives from status. */
  error: new (message: string, flagged: boolean) => E;
  /** The status that sets that flag: 429 for throttled, 404 for gone. */
  flaggedStatus: number;
  /** Program-specific wording by status; anything absent falls back to a generic line. */
  statusMessages?: Record<number, string>;
}

export abstract class ApiClient<E extends Error> {
  private readonly explicitBase?: string;
  private readonly token: () => Promise<string | null>;
  protected readonly fetcher: typeof fetch;

  protected constructor(
    options: ApiClientOptions,
    private readonly spec: ApiClientSpec<E>,
  ) {
    this.explicitBase = options.base;
    this.token = options.token ?? (async () => null);
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Resolved per call rather than captured in the constructor.
   *
   * A client built before the runtime config arrives would otherwise hold the
   * build-time address for the life of the page, which on a deployed site is
   * precisely the one that has stopped working.
   */
  get base(): string {
    return (this.explicitBase ?? convertApiBase()).replace(/\/+$/, '');
  }

  protected fail(message: string, status = 0): E {
    return new this.spec.error(message, status === this.spec.flaggedStatus);
  }

  protected unreachable(): E {
    return this.fail(`The ${this.spec.subject} at ${this.base} is not reachable.`);
  }

  protected async headers(json = false): Promise<Record<string, string>> {
    let token: string | null = null;
    try {
      token = await this.token();
    } catch {
      token = null;
    }
    if (!token) throw this.fail(this.spec.signIn);
    return {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  /**
   * Makes one call and reads its JSON body, turning every way it can go wrong
   * into the program's own error type.
   */
  protected async request(call: () => Promise<Response>): Promise<Record<string, unknown>> {
    if (!this.base) {
      throw this.fail(
        `No ${this.spec.subject} is configured. Set AF_CONVERT_API for the build, or point `
        + 'config/runtime at a running gateway.',
      );
    }

    let response: Response;
    try {
      response = await call();
    } catch (error) {
      if (error instanceof this.spec.error) throw error;
      throw this.unreachable();
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // A proxy in front of the API answers HTML, and some responses carry no
      // body at all; neither is an error in itself.
    }

    if (response.ok) return body;
    throw this.fail(this.messageOf(response.status, body), response.status);
  }

  private messageOf(status: number, body: Record<string, unknown>): string {
    if (typeof body.error === 'string') return body.error;
    return this.spec.statusMessages?.[status] ?? `The ${this.spec.subject} returned ${status}.`;
  }
}
