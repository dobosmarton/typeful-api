import { describe, expect, it } from 'vitest';
import { extractBearerToken, extractApiKey, extractBasicCredentials } from '../../src/helpers/auth';

describe('extractBearerToken', () => {
  it('extracts token from valid Bearer header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('extracts JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig';
    expect(extractBearerToken(`Bearer ${jwt}`)).toBe(jwt);
  });

  it('returns null for missing header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractBearerToken('')).toBeNull();
  });

  it('returns null for non-Bearer prefix', () => {
    expect(extractBearerToken('Basic abc123')).toBeNull();
  });

  it('returns null for Bearer with no token', () => {
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

describe('extractApiKey', () => {
  it('extracts API key from header value', () => {
    expect(extractApiKey('my-api-key-123')).toBe('my-api-key-123');
  });

  it('returns null for missing header', () => {
    expect(extractApiKey(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractApiKey('')).toBeNull();
  });
});

describe('extractBasicCredentials', () => {
  it('extracts username and password', () => {
    const encoded = btoa('user:pass');
    expect(extractBasicCredentials(`Basic ${encoded}`)).toEqual({
      username: 'user',
      password: 'pass',
    });
  });

  it('handles password with colons', () => {
    const encoded = btoa('user:pass:with:colons');
    expect(extractBasicCredentials(`Basic ${encoded}`)).toEqual({
      username: 'user',
      password: 'pass:with:colons',
    });
  });

  it('handles empty password', () => {
    const encoded = btoa('user:');
    expect(extractBasicCredentials(`Basic ${encoded}`)).toEqual({
      username: 'user',
      password: '',
    });
  });

  it('returns null for missing header', () => {
    expect(extractBasicCredentials(undefined)).toBeNull();
  });

  it('returns null for non-Basic prefix', () => {
    expect(extractBasicCredentials('Bearer token')).toBeNull();
  });

  it('returns null for invalid base64', () => {
    expect(extractBasicCredentials('Basic !!!invalid!!!')).toBeNull();
  });

  it('returns null for base64 without colon', () => {
    const encoded = btoa('nocolon');
    expect(extractBasicCredentials(`Basic ${encoded}`)).toBeNull();
  });

  it('returns null for empty base64 value', () => {
    expect(extractBasicCredentials('Basic ')).toBeNull();
  });
});
