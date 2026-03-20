import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TemporalClient, TemporalError, createClientFromEnv } from '../src/client.js';

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
  });
}

// ─── TemporalClient ───────────────────────────────────────────────────────────

describe('TemporalClient', () => {
  const client = new TemporalClient({
    address: 'http://temporal.test:7233',
    defaultNamespace: 'default',
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the configured base URL', async () => {
    await client.get('/api/v1/cluster-info');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://temporal.test:7233/api/v1/cluster-info',
      expect.any(Object)
    );
  });

  it('appends query params and skips undefined values', async () => {
    await client.get('/api/v1/namespaces', { pageSize: 10, query: undefined });
    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain('pageSize=10');
    expect(url).not.toContain('query');
  });

  it('sets Authorization header when apiKey is provided', async () => {
    const secureClient = new TemporalClient({
      address: 'http://temporal.test:7233',
      defaultNamespace: 'default',
      apiKey: 'my-secret-key',
    });
    await secureClient.get('/api/v1/cluster-info');
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-secret-key');
  });

  it('does NOT set Authorization header when apiKey is absent', async () => {
    await client.get('/api/v1/cluster-info');
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('throws TemporalError on non-OK response with JSON body', async () => {
    vi.stubGlobal('fetch', mockFetch({ code: 5, message: 'not found' }, 404));
    await expect(client.get('/api/v1/namespaces/missing')).rejects.toThrow(TemporalError);
    await expect(client.get('/api/v1/namespaces/missing')).rejects.toThrow('not found');
  });

  it('throws TemporalError on non-OK response with plain text body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'upstream timeout',
    }));
    await expect(client.get('/foo')).rejects.toThrow('upstream timeout');
  });

  it('returns empty object for empty response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      text: async () => '',
    }));
    const result = await client.get('/api/v1/foo');
    expect(result).toEqual({});
  });

  it('ns() returns provided namespace', () => {
    expect(client.ns('my-ns')).toBe('my-ns');
  });

  it('ns() falls back to defaultNamespace', () => {
    expect(client.ns()).toBe('default');
    expect(client.ns(undefined)).toBe('default');
  });

  it('sends POST request with JSON body', async () => {
    await client.post('/api/v1/namespaces', { name: 'test' });
    const call = vi.mocked(fetch).mock.calls[0];
    expect((call[1] as RequestInit).method).toBe('POST');
    expect((call[1] as RequestInit).body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('sends DELETE request', async () => {
    await client.delete('/api/v1/namespaces/test/schedules/sched-1');
    const call = vi.mocked(fetch).mock.calls[0];
    expect((call[1] as RequestInit).method).toBe('DELETE');
  });
});

// ─── createClientFromEnv ─────────────────────────────────────────────────────

describe('createClientFromEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    delete process.env['TEMPORAL_ADDRESS'];
    delete process.env['TEMPORAL_NAMESPACE'];
    delete process.env['TEMPORAL_API_KEY'];
  });

  it('throws when TEMPORAL_ADDRESS is missing', () => {
    delete process.env['TEMPORAL_ADDRESS'];
    expect(() => createClientFromEnv()).toThrow('TEMPORAL_ADDRESS');
  });

  it('creates client from env vars', () => {
    process.env['TEMPORAL_ADDRESS'] = 'http://env.test:8080';
    process.env['TEMPORAL_NAMESPACE'] = 'staging';
    const c = createClientFromEnv();
    expect(c.ns()).toBe('staging');
  });

  it('defaults namespace to "default"', () => {
    process.env['TEMPORAL_ADDRESS'] = 'http://env.test:8080';
    delete process.env['TEMPORAL_NAMESPACE'];
    const c = createClientFromEnv();
    expect(c.ns()).toBe('default');
  });
});

// ─── TemporalError ────────────────────────────────────────────────────────────

describe('TemporalError', () => {
  it('stores status code and message', () => {
    const err = new TemporalError(404, 'workflow not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('workflow not found');
    expect(err.name).toBe('TemporalError');
  });

  it('is an instanceof Error', () => {
    const err = new TemporalError(500, 'oops');
    expect(err).toBeInstanceOf(Error);
  });
});
