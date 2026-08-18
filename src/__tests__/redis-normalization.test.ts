import { describe, it, expect } from 'vitest';
import { normalizeRedisUrl, resolveRedisOptions } from '../pipeline/queue/redis-client';

describe('REDIS_URL Normalization & Validation', () => {
  it('should accept a standard redis:// URL', () => {
    const input = 'redis://default:secretpass@myhost.com:6379';
    const normalized = normalizeRedisUrl(input);
    expect(normalized).toBe('redis://default:secretpass@myhost.com:6379');

    const opts = resolveRedisOptions(input);
    expect(opts.finalUrl).toBe('redis://default:secretpass@myhost.com:6379');
    expect(opts.tlsOption).toEqual({});
  });

  it('should accept a standard rediss:// URL and configure TLS', () => {
    const input = 'rediss://default:secretpass@myhost.com:6379';
    const normalized = normalizeRedisUrl(input);
    expect(normalized).toBe('rediss://default:secretpass@myhost.com:6379');

    const opts = resolveRedisOptions(input);
    expect(opts.finalUrl).toBe('rediss://default:secretpass@myhost.com:6379');
    expect(opts.tlsOption).toEqual({ tls: {} });
  });

  it('should strip CLI arguments "--tls -u" from connection strings', () => {
    const input = '--tls -u redis://default:secretpass@myhost.com:6379';
    const normalized = normalizeRedisUrl(input);
    expect(normalized).toBe('redis://default:secretpass@myhost.com:6379');
  });

  it('should handle whitespace and quoted CLI arguments correctly', () => {
    const input = '   --tls -u redis://default:secretpass@myhost.com:6379   ';
    const normalized = normalizeRedisUrl(input);
    expect(normalized).toBe('redis://default:secretpass@myhost.com:6379');
  });

  it('should auto-upgrade upstash.io domains to rediss:// for TLS', () => {
    const input = '--tls -u redis://default:secretpass@central-mammoth-112204.upstash.io:6379';
    const normalized = normalizeRedisUrl(input);
    expect(normalized).toBe('rediss://default:secretpass@central-mammoth-112204.upstash.io:6379');

    const opts = resolveRedisOptions(input);
    expect(opts.finalUrl).toBe('rediss://default:secretpass@central-mammoth-112204.upstash.io:6379');
    expect(opts.tlsOption).toEqual({ tls: {} });
  });

  it('should throw a clear validation error if REDIS_URL is empty', () => {
    expect(() => normalizeRedisUrl('')).toThrow('REDIS_URL environment variable is missing or empty');
  });

  it('should throw a clear validation error if REDIS_URL does not contain redis:// or rediss://', () => {
    expect(() => normalizeRedisUrl('invalid_string_without_scheme')).toThrow(
      'Invalid REDIS_URL format: "invalid_string_without_scheme". Expected a URL starting with redis:// or rediss://'
    );
  });
});
