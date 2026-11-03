import { describe, expect, it, vi } from 'vitest';
import type { AuthConfig } from '../../src/auth';
import { HttpError } from '../../src/errors/http-error';
import { createAuthenticator, type HeaderReader } from '../../src/server/authenticate';

const headers =
  (values: Record<string, string>): HeaderReader =>
  (name) =>
    values[name];

const basic = (username: string, password: string) => `Basic ${btoa(`${username}:${password}`)}`;

describe('createAuthenticator', () => {
  const user = { id: 'u1' };
  const config: AuthConfig = {
    bearer: async ({ token }) => {
      if (token !== 'good') throw new Error('bad token');
      return user;
    },
    apiKey: ({ key }) => {
      if (key === 'forbidden') throw new HttpError(403, 'Key revoked');
      return user;
    },
    basic: ({ username, password }) => {
      if (password !== 'secret') throw new Error('bad password');
      return { id: username };
    },
  };

  it('returns null when nothing needs enforcing', () => {
    expect(createAuthenticator(undefined, config)).toBeNull();
    expect(createAuthenticator('none', config)).toBeNull();
    expect(createAuthenticator('bearer', undefined)).toBeNull();
    expect(createAuthenticator('bearer', { apiKey: () => user })).toBeNull();
  });

  it('verifies bearer tokens', async () => {
    const authenticate = createAuthenticator('bearer', config)!;

    await expect(authenticate(headers({ authorization: 'Bearer good' }))).resolves.toEqual({
      ok: true,
      user,
    });
  });

  it('verifies API keys and basic credentials', async () => {
    await expect(
      createAuthenticator('apiKey', config)!(headers({ 'x-api-key': 'k1' })),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createAuthenticator('basic', config)!(headers({ authorization: basic('ada', 'secret') })),
    ).resolves.toEqual({ ok: true, user: { id: 'ada' } });
  });

  it('returns a 401 with a challenge when credentials are missing', async () => {
    const result = await createAuthenticator('bearer', config)!(headers({}));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(401);
    expect(result.error.problem.detail).toBe('Missing credentials');
    expect(result.error.headers).toEqual({ 'WWW-Authenticate': 'Bearer' });
  });

  it('uses a Basic challenge for basic auth and none for API keys', async () => {
    const basicResult = await createAuthenticator('basic', config)!(headers({}));
    const apiKeyResult = await createAuthenticator('apiKey', config)!(headers({}));

    expect(!basicResult.ok && basicResult.error.headers).toEqual({
      'WWW-Authenticate': 'Basic realm="api"',
    });
    expect(!apiKeyResult.ok && apiKeyResult.error.headers).toEqual({});
  });

  it('returns 401 and calls onError when the verifier throws', async () => {
    const onError = vi.fn();
    const authenticate = createAuthenticator('bearer', { ...config, onError })!;

    const result = await authenticate(headers({ authorization: 'Bearer bad' }));

    expect(!result.ok && result.error.problem).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      detail: 'Authentication failed',
    });
    expect(onError).toHaveBeenCalledWith(new Error('bad token'), 'bearer');
  });

  it('passes an HttpError thrown by the verifier through', async () => {
    const onError = vi.fn();
    const result = await createAuthenticator('apiKey', { ...config, onError })!(
      headers({ 'x-api-key': 'forbidden' }),
    );

    expect(!result.ok && result.error.status).toBe(403);
    expect(!result.ok && result.error.problem.detail).toBe('Key revoked');
    expect(onError).toHaveBeenCalledOnce();
  });
});
