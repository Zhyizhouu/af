import { apiBase } from '../ai/api';

/**
 * The converter's API.
 *
 * A port of `lib/programs/audio/audio_api.dart`. The wire format is unchanged —
 * the Go service does not know which framework is talking to it.
 */

export class AudioError extends Error {
  /** True when the job is gone rather than broken: an expired result, or one
   *  this account does not own. The UI clears it instead of offering a retry
   *  that cannot work. */
  readonly gone: boolean;

  constructor(message: string, gone = false) {
    super(message);
    this.name = 'AudioError';
    this.gone = gone;
  }
}

export interface AudioFormat {
  id: string;
  label: string;
  extension: string;
  /** Lossless formats hide the bitrate control rather than show it doing nothing. */
  lossy: boolean;
  /** Per-format, because libopus refuses anything above 256k and fails the whole
   *  conversion rather than clamping. Empty means the server's common set. */
  bitrates: number[];
  note: string;
}

export interface AudioLimits {
  maxUploadBytes: number;
  formats: AudioFormat[];
  defaultFormat: string;
  bitrates: number[];
  defaultBitrate: number;
  resultTtlSeconds: number;
}

export type JobPhase =
  | 'queued'
  | 'downloading'
  | 'converting'
  | 'uploading'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface JobStatus {
  id: string;
  phase: JobPhase;
  error?: string;
}

export interface AudioClientOptions {
  base?: string;
  token?: () => Promise<string | null>;
  fetcher?: typeof fetch;
}

export class AudioApi {
  readonly base: string;
  private readonly token: () => Promise<string | null>;
  private readonly fetcher: typeof fetch;

  constructor(options: AudioClientOptions = {}) {
    this.base = (options.base ?? apiBase).replace(/\/+$/, '');
    this.token = options.token ?? (async () => null);
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await this.token().catch(() => null);
    if (!token) throw new AudioError('Sign in to convert files.');
    return { Authorization: `Bearer ${token}` };
  }

  /** Signed like every other call — the server gates this behind an account. */
  async limits(): Promise<AudioLimits> {
    const body = await this.read(async () =>
      this.fetcher(`${this.base}/v1/limits`, { headers: await this.headers() }),
    );
    return {
      maxUploadBytes: Number(body.maxUploadBytes ?? 0),
      formats: Array.isArray(body.formats) ? (body.formats as AudioFormat[]) : [],
      defaultFormat: String(body.defaultFormat ?? 'mp3'),
      bitrates: Array.isArray(body.bitrates) ? (body.bitrates as number[]) : [],
      defaultBitrate: Number(body.defaultBitrate ?? 192),
      resultTtlSeconds: Number(body.resultTtlSeconds ?? 7200),
    };
  }

  /**
   * Uploads the file and starts a job.
   *
   * XMLHttpRequest rather than fetch, for one reason: fetch has no upload
   * progress event. `fetch` will happily send a 200 MB body and tell you
   * nothing until it lands, and a progress bar that sits at zero for a minute
   * is worse than no progress bar.
   */
  async createJob(input: {
    file: File;
    format: string;
    bitrate: number;
    onProgress?: (sent: number, total: number) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const headers = await this.headers();
    const url =
      `${this.base}/v1/jobs?format=${encodeURIComponent(input.format)}` +
      `&bitrate=${input.bitrate}&filename=${encodeURIComponent(input.file.name)}`;

    return new Promise<string>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', url);
      for (const [key, value] of Object.entries(headers)) {
        request.setRequestHeader(key, value);
      }
      request.setRequestHeader('Content-Type', 'application/octet-stream');

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) input.onProgress?.(event.loaded, event.total);
      };

      request.onload = () => {
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(request.responseText) as Record<string, unknown>;
        } catch {
          // A proxy in front of the API answers HTML, not the JSON shape.
        }
        if (request.status >= 200 && request.status < 300 && typeof body.id === 'string') {
          resolve(body.id);
        } else {
          reject(
            new AudioError(
              typeof body.error === 'string'
                ? body.error
                : `The converter returned ${request.status}.`,
              request.status === 404,
            ),
          );
        }
      };

      request.onerror = () =>
        reject(new AudioError(`The converter at ${this.base} is not reachable.`));
      request.onabort = () => reject(new AudioError('Upload cancelled.'));

      input.signal?.addEventListener('abort', () => request.abort());
      request.send(input.file);
    });
  }

  async status(id: string): Promise<JobStatus> {
    const body = await this.read(async () =>
      this.fetcher(`${this.base}/v1/jobs/${id}`, { headers: await this.headers() }),
    );
    return {
      id,
      phase: String(body.phase ?? 'queued') as JobPhase,
      error: typeof body.error === 'string' ? body.error : undefined,
    };
  }

  async cancel(id: string): Promise<void> {
    await this.read(async () =>
      this.fetcher(`${this.base}/v1/jobs/${id}`, {
        method: 'DELETE',
        headers: await this.headers(),
      }),
    );
  }

  /** Where the finished file lives. Signed, so it cannot be a plain link. */
  async download(id: string): Promise<Blob> {
    const response = await this.fetcher(`${this.base}/v1/jobs/${id}/result`, {
      headers: await this.headers(),
    });
    if (!response.ok) {
      throw new AudioError('That result is no longer available.', response.status === 404);
    }
    return response.blob();
  }

  private async read(call: () => Promise<Response>): Promise<Record<string, unknown>> {
    if (!this.base) {
      throw new AudioError(
        'No converter is configured for this build. Set AF_CONVERT_API and rebuild.',
      );
    }

    let response: Response;
    try {
      response = await call();
    } catch (error) {
      if (error instanceof AudioError) throw error;
      throw new AudioError(`The converter at ${this.base} is not reachable.`);
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // Some responses carry no body at all; that is fine.
    }

    if (response.ok) return body;
    throw new AudioError(
      typeof body.error === 'string' ? body.error : `The converter returned ${response.status}.`,
      response.status === 404,
    );
  }
}

export const phaseLabels: Record<JobPhase, string> = {
  queued: 'Waiting for a worker',
  downloading: 'Fetching your file',
  converting: 'Converting',
  uploading: 'Storing the result',
  done: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const phaseOrder: JobPhase[] = ['queued', 'downloading', 'converting', 'uploading', 'done'];
