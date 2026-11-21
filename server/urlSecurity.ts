import dns from 'dns/promises';
import net from 'net';
import { isValidYouTubeVideoId } from '../src/utils/urlImport';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.slice('::ffff:'.length);
    if (net.isIPv4(mapped)) {
      return isPrivateOrReservedIp(mapped);
    }
  }

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 unspecified
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast & reserved
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === '::' || clean === '::1') return true; // unspecified / loopback
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) {
      return true; // fe80::/10 link-local
    }
    if (clean.startsWith('fc') || clean.startsWith('fd')) {
      return true; // fc00::/7 unique local
    }
    if (clean.startsWith('ff')) {
      return true; // multicast
    }
    return false;
  }

  return true;
}

export interface SafeExternalUrlResult {
  valid: boolean;
  url?: URL;
  error?: string;
}

/**
 * Validates that a user-supplied URL uses http/https, contains no embedded credentials,
 * is not a local/internal hostname, and resolves exclusively to public routable IPs.
 */
export async function validateSafeExternalUrl(rawUrl: string): Promise<SafeExternalUrlResult> {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { valid: false, error: 'Invalid or empty URL.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Malformed URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http:// and https:// URLs are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with embedded credentials are not allowed.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return { valid: false, error: 'Private or local network hostnames are not permitted.' };
  }

  const bareHost = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bareHost)) {
    if (isPrivateOrReservedIp(bareHost)) {
      return { valid: false, error: 'Private, loopback, or metadata IP addresses are blocked.' };
    }
    return { valid: true, url: parsed };
  }

  try {
    const records = await dns.lookup(bareHost, { all: true });
    if (!records.length) {
      return { valid: false, error: 'Could not resolve remote host.' };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return { valid: false, error: 'Target host resolved to a restricted network address.' };
      }
    }
  } catch {
    return { valid: false, error: 'Could not resolve remote media host.' };
  }

  return { valid: true, url: parsed };
}

/**
 * Builds canonical trusted YouTube URLs exclusively from a strictly validated 11-char videoId.
 */
export function buildTrustedYouTubeUrls(videoId: string): {
  canonicalUrl: string;
  oembedUrl: string;
  watchUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
} {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error('Invalid YouTube video ID.');
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    canonicalUrl,
    oembedUrl: `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
    watchUrl: canonicalUrl,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

/**
 * Safely fetches an external URL with redirect-hop validation so redirects cannot bypass IP checks.
 */
export async function safeExternalFetch(
  initialUrl: string,
  options: { method?: 'GET' | 'HEAD'; signal?: AbortSignal; maxRedirects?: number } = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const check = await validateSafeExternalUrl(currentUrl);
    if (!check.valid || !check.url) {
      throw new Error(check.error || 'Blocked unsafe external URL.');
    }

    const res = await fetch(check.url.toString(), {
      method: options.method ?? 'GET',
      redirect: 'manual',
      signal: options.signal,
      headers: {
        'User-Agent': 'ClipForgeStudio/1.0',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error('Remote server returned an incomplete redirect.');
      }
      currentUrl = new URL(location, check.url).toString();
      continue;
    }

    return res;
  }

  throw new Error('Too many redirects while fetching remote media URL.');
}
