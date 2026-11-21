import {
  classifyVideoUrl,
  isValidYouTubeVideoId,
  parseIso8601Duration,
} from '../src/utils/urlImport';
import { buildTrustedYouTubeUrls, safeExternalFetch } from './urlSecurity';

export interface InspectedYouTubeMedia {
  sourceType: 'youtube';
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  width: number;
  height: number;
  thumbnailUrl: string;
  canonicalUrl: string;
  embedUrl: string;
  isLiveContent: boolean;
  startSeconds?: number;
}

export interface InspectedDirectMedia {
  sourceType: 'direct-url';
  url: string;
  fileName: string;
  contentType: string;
  contentLength: number | null;
}

export type InspectedUrlMedia = InspectedYouTubeMedia | InspectedDirectMedia;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function sanitizeThumbnailUrl(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'i.ytimg.com' || parsed.hostname === 'img.youtube.com')
    ) {
      return parsed.toString();
    }
  } catch {
    // fall back
  }
  return fallback;
}

export async function inspectYouTubeVideoById(
  videoId: string,
  startSeconds?: number
): Promise<InspectedYouTubeMedia> {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error('Invalid YouTube video ID.');
  }

  const urls = buildTrustedYouTubeUrls(videoId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const [oembedResult, metaResult] = await Promise.allSettled([
      fetch(urls.oembedUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }),
      fetch(urls.watchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }),
    ]);

    let title = '';
    let author = 'YouTube Creator';
    let thumbnailUrl = urls.thumbnailUrl;
    let width = 1280;
    let height = 720;
    let oembedOk = false;

    if (oembedResult.status === 'fulfilled' && oembedResult.value.ok) {
      oembedOk = true;
      const oembed = (await oembedResult.value.json()) as Record<string, unknown>;
      if (typeof oembed.title === 'string' && oembed.title.trim()) {
        title = oembed.title.trim();
      }
      if (typeof oembed.author_name === 'string' && oembed.author_name.trim()) {
        author = oembed.author_name.trim();
      }
      thumbnailUrl = sanitizeThumbnailUrl(oembed.thumbnail_url, urls.thumbnailUrl);
      const ow = Number(oembed.width);
      const oh = Number(oembed.height);
      if (Number.isFinite(ow) && Number.isFinite(oh) && ow > 0 && oh > 0) {
        if (oh > ow) {
          width = 720;
          height = 1280;
        }
      }
    }

    let durationSeconds = 0;
    let isLiveContent = false;

    if (metaResult.status === 'fulfilled' && metaResult.value.ok) {
      const html = await metaResult.value.text();
      const durMatch = html.match(/itemprop="duration"\s+content="([^"]+)"/i);
      if (durMatch?.[1]) {
        durationSeconds = parseIso8601Duration(durMatch[1]);
      }
      if (!title) {
        const titleMatch = html.match(/<meta\s+name="title"\s+content="([^"]+)"/i);
        if (titleMatch?.[1]) {
          title = decodeHtmlEntities(titleMatch[1]);
        }
      }
      const liveMatch = html.match(/itemprop="isLiveBroadcast"\s+content="([^"]+)"/i);
      if (liveMatch?.[1]?.toLowerCase() === 'true') {
        isLiveContent = true;
      }
    }

    if (!oembedOk && !title && durationSeconds === 0) {
      throw new Error(
        'Could not load this YouTube video. Make sure the video is public or unlisted (not private or deleted).'
      );
    }

    return {
      sourceType: 'youtube',
      videoId,
      title: title || `YouTube Video (${videoId})`,
      author,
      durationSeconds: durationSeconds > 0 ? durationSeconds : 600,
      width,
      height,
      thumbnailUrl,
      canonicalUrl: urls.canonicalUrl,
      embedUrl: urls.embedUrl,
      isLiveContent,
      startSeconds,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectMediaUrl(rawUrl: string): Promise<InspectedUrlMedia> {
  const classified = classifyVideoUrl(rawUrl);

  if (classified.status === 'youtube' && classified.youtubeVideoId) {
    return inspectYouTubeVideoById(classified.youtubeVideoId, classified.startSeconds);
  }

  if (classified.status === 'direct-media' && classified.canonicalUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const headRes = await safeExternalFetch(classified.canonicalUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      const contentType = headRes.headers.get('content-type') || 'video/mp4';
      const contentLengthHeader = headRes.headers.get('content-length');
      const parsedLen = contentLengthHeader ? Number(contentLengthHeader) : null;
      const parsedUrl = new URL(classified.canonicalUrl);
      const rawName = parsedUrl.pathname.split('/').pop() || 'remote-video.mp4';
      const fileName = decodeURIComponent(rawName).slice(0, 120) || 'remote-video.mp4';

      return {
        sourceType: 'direct-url',
        url: classified.canonicalUrl,
        fileName,
        contentType,
        contentLength: parsedLen !== null && Number.isFinite(parsedLen) ? parsedLen : null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(classified.message);
}
