import type { TemporalConfig, TemporalApiError } from './types.js';

/** Wraps Temporal API errors with HTTP status and upstream message. */
export class TemporalError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'TemporalError';
  }
}

/**
 * Lightweight HTTP client for the Temporal REST API.
 * All methods map 1:1 to Temporal's `/api/v1/...` endpoints.
 */
export class TemporalClient {
  private readonly baseUrl: string;
  private readonly defaultNamespace: string;
  private readonly headers: Record<string, string>;

  constructor(config: TemporalConfig) {
    this.baseUrl = config.address.replace(/\/$/, '');
    this.defaultNamespace = config.defaultNamespace;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    };
  }

  /** Resolves namespace: uses provided value or falls back to the configured default. */
  ns(namespace?: string): string {
    return namespace ?? this.defaultNamespace;
  }

  // ─── Core HTTP helpers ────────────────────────────────────────────────────

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    const res = await fetch(url, { headers: this.headers });
    return this.parseResponse<T>(res);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.parseResponse<T>(res);
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.parseResponse<T>(res);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text();

    if (!res.ok) {
      let message = `HTTP ${res.status}: ${res.statusText}`;
      let details: unknown;
      try {
        const err = JSON.parse(text) as TemporalApiError;
        message = err.message ?? message;
        details = err.details;
      } catch {
        // response body is not JSON — use raw text
        if (text) message = text;
      }
      throw new TemporalError(res.status, message, details);
    }

    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new TemporalError(200, `Failed to parse response body: ${text}`);
    }
  }
}

/** Builds a TemporalClient from environment variables. Throws if TEMPORAL_ADDRESS is missing. */
export function createClientFromEnv(): TemporalClient {
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) {
    throw new Error(
      'TEMPORAL_ADDRESS environment variable is required (e.g. http://localhost:8080)'
    );
  }
  return new TemporalClient({
    address,
    defaultNamespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    apiKey: process.env.TEMPORAL_API_KEY,
  });
}
