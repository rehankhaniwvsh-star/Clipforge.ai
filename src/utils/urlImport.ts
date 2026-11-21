export type ClassifiedUrlStatus =
  | 'empty'
  | 'invalid'
  | 'youtube'
  | 'direct-media'
  | 'unsupported-platform';

export interface ClassifiedVideoUrl {
  status: ClassifiedUrlStatus;
  platformName?: string;
  youtubeVideoId?: string;
  canonicalUrl?: string;
  startSeconds?: number;
  message: string;
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const UNSUPPORTED_PLATFORMS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /(^|\.)twitch\.tv$/i, name: 'Twitch' },
  { pattern: /(^|\.)(x\.com|twitter\.com)$/i, name: 'X (Twitter)' },
  { pattern: /(^|\.)vimeo\.com$/i, name: 'Vimeo' },
  { pattern: /(^|\.)tiktok\.com$/i, name: 'TikTok' },
  { pattern: /(^|\.)instagram\.com$/i, name: 'Instagram' },
];

export function isValidYouTubeVideoId(value: string | undefined | null): value is string {
  return typeof value === 'string' && YOUTUBE_ID_REGEX.test(value);
}

/**
 * Parses YouTube timestamp query values such as "90", "90s", "2m15s", or "1h02m30s".
 */
export function parseYouTubeTimestampParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const sec = Number(trimmed);
    return Number.isFinite(sec) && sec >= 0 ? sec : undefined;
  }

  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!match) return undefined;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

/**
 * Extracts a strictly validated 11-character YouTube video ID from standard watch,
 * live, shorts, embed, and youtu.be URLs.
 */
export function extractYouTubeVideoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
    return isValidYouTubeVideoId(firstSegment) ? firstSegment : null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments[0] === 'watch') {
    const vParam = parsed.searchParams.get('v');
    return isValidYouTubeVideoId(vParam) ? vParam : null;
  }

  if (
    (segments[0] === 'live' ||
      segments[0] === 'shorts' ||
      segments[0] === 'embed' ||
      segments[0] === 'v') &&
    segments[1]
  ) {
    return isValidYouTubeVideoId(segments[1]) ? segments[1] : null;
  }

  const fallbackV = parsed.searchParams.get('v');
  return isValidYouTubeVideoId(fallbackV) ? fallbackV : null;
}

/**
 * Parses ISO 8601 duration strings returned by YouTube metadata (e.g. "PT240M10S", "PT1H02M05S").
 */
export function parseIso8601Duration(raw: string | null | undefined): number {
  if (!raw || typeof raw !== 'string') return 0;
  const match = raw.trim().match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return 0;
  const days = match[1] ? Number(match[1]) : 0;
  const hours = match[2] ? Number(match[2]) : 0;
  const minutes = match[3] ? Number(match[3]) : 0;
  const seconds = match[4] ? Number(match[4]) : 0;
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
}

/**
 * Classifies a user-entered video URL for import compatibility.
 */
export function classifyVideoUrl(rawUrl: string): ClassifiedVideoUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      status: 'empty',
      message: 'Enter a YouTube link or direct .mp4 / .webm URL to import.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      status: 'invalid',
      message: 'Please enter a valid https:// video URL.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      status: 'invalid',
      message: 'Only http:// and https:// URLs are supported.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const videoId = extractYouTubeVideoId(parsed);
    if (!videoId) {
      return {
        status: 'invalid',
        message:
          'Could not find a YouTube video ID in that URL. Paste a watch, live, shorts, or youtu.be video link.',
      };
    }

    const startSeconds =
      parseYouTubeTimestampParam(parsed.searchParams.get('t')) ??
      parseYouTubeTimestampParam(parsed.searchParams.get('start'));

    return {
      status: 'youtube',
      platformName: 'YouTube',
      youtubeVideoId: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      startSeconds,
      message: 'YouTube video detected. Ready to inspect metadata and analyze with Gemini AI.',
    };
  }

  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(parsed.pathname + parsed.search)) {
    return {
      status: 'direct-media',
      canonicalUrl: parsed.toString(),
      message: 'Direct media file URL detected. Ready to download into ClipForge.',
    };
  }

  const unsupported = UNSUPPORTED_PLATFORMS.find((entry) => entry.pattern.test(host));
  if (unsupported) {
    return {
      status: 'unsupported-platform',
      platformName: unsupported.name,
      message: `${unsupported.name} links cannot be imported directly. Paste a YouTube link, a direct .mp4/.webm file URL, upload a local video, or capture it via Live Clipper.`,
    };
  }

  return {
    status: 'unsupported-platform',
    platformName: host,
    message: `Unsupported link from ${host}. Paste a YouTube URL, a direct .mp4/.webm/.mov URL, or upload a local video file.`,
  };
}

export const MAX_YOUTUBE_ANALYSIS_WINDOW_SEC = 1200; // 20 minutes per Gemini pass
export const DEFAULT_YOUTUBE_ANALYSIS_WINDOW_SEC = 600; // 10 minutes default for long videos

/**
 * Computes a safe bounded [startSec, endSec] analysis window for a YouTube video.
 */
export function clampYouTubeAnalysisWindow(
  durationSeconds: number,
  requestedStartSec?: number,
  requestedEndSec?: number
): { startSec: number; endSec: number; isWindowed: boolean } {
  const safeDuration = Math.max(10, Math.floor(Number.isFinite(durationSeconds) ? durationSeconds : 600));
  const rawStart = Number.isFinite(requestedStartSec) ? Number(requestedStartSec) : 0;
  const startSec = Math.max(0, Math.min(Math.floor(rawStart), Math.max(0, safeDuration - 10)));

  const defaultEnd = Math.min(safeDuration, startSec + DEFAULT_YOUTUBE_ANALYSIS_WINDOW_SEC);
  const rawEnd = Number.isFinite(requestedEndSec) && Number(requestedEndSec) > startSec
    ? Number(requestedEndSec)
    : defaultEnd;

  const maxEnd = Math.min(safeDuration, startSec + MAX_YOUTUBE_ANALYSIS_WINDOW_SEC);
  const endSec = Math.max(Math.min(safeDuration, startSec + 10), Math.min(Math.floor(rawEnd), maxEnd));

  return {
    startSec,
    endSec,
    isWindowed: startSec > 0 || endSec < safeDuration,
  };
}
