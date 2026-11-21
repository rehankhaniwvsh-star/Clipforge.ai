import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeAudioWithGemini,
  analyzeYouTubeVideoWithGemini,
  formatGeminiApiError,
  generateCaptionsAndReactionsWithGemini,
  isGeminiApiKeyConfigured,
} from './server/geminiService';
import { inspectMediaUrl } from './server/mediaIngestService';
import { safeExternalFetch } from './server/urlSecurity';
import { validateAnalyzeAudioRequestBody } from './src/utils/aiAnalysisValidation';
import { validateCaptionReactionRequestBody } from './src/utils/captionReactionLogic';
import { isValidYouTubeVideoId } from './src/utils/urlImport';
import { ClipCategory, ClipDurationOption } from './src/types/clipforge';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Health & AI availability probe (never exposes secret values)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      aiConfigured: isGeminiApiKeyConfigured(),
    });
  });

  // Secure server-side Gemini audio & transcript analysis endpoint
  app.post(
    '/api/ai/analyze-audio',
    express.json({ limit: '35mb' }),
    async (req: Request, res: Response) => {
      const validation = validateAnalyzeAudioRequestBody(req.body);
      if (!validation.valid || !validation.data) {
        res.status(400).json({
          error: validation.error || 'Invalid audio analysis request payload.',
          code: 'INVALID_REQUEST',
        });
        return;
      }

      try {
        const result = await analyzeAudioWithGemini(validation.data);
        res.status(200).json(result);
      } catch (err) {
        const formatted = formatGeminiApiError(err);
        res.status(formatted.statusCode).json({
          error: formatted.message,
          code: formatted.code,
          retryable: formatted.retryable,
        });
      }
    }
  );

  // Secure server-side Gemini automatic captioning & funny reaction editing endpoint
  app.post(
    '/api/ai/generate-captions-and-reactions',
    express.json({ limit: '25mb' }),
    async (req: Request, res: Response) => {
      const validation = validateCaptionReactionRequestBody(req.body);
      if (!validation.valid || !validation.data) {
        res.status(400).json({
          error: validation.error || 'Invalid caption generation request payload.',
          code: 'INVALID_REQUEST',
        });
        return;
      }

      try {
        const result = await generateCaptionsAndReactionsWithGemini(validation.data);
        res.status(200).json(result);
      } catch (err) {
        const formatted = formatGeminiApiError(err);
        res.status(formatted.statusCode).json({
          error: formatted.message,
          code: formatted.code,
          retryable: formatted.retryable,
        });
      }
    }
  );

  // Server-side video URL inspection (YouTube & direct media URLs)
  app.post(
    '/api/media/inspect-url',
    express.json({ limit: '16kb' }),
    async (req: Request, res: Response) => {
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (!rawUrl || rawUrl.length > 2048) {
        res.status(400).json({
          error: 'Please enter a valid YouTube link or direct .mp4/.webm URL.',
          code: 'INVALID_URL',
        });
        return;
      }

      try {
        const inspected = await inspectMediaUrl(rawUrl);
        res.status(200).json(inspected);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not inspect video URL.';
        res.status(400).json({
          error: message,
          code: 'URL_INSPECT_FAILED',
        });
      }
    }
  );

  // Server-side CORS fallback proxy for direct .mp4 / .webm / .mov media URLs (SSRF-hardened)
  app.get('/api/media/proxy', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const maxBytes = Math.min(
      300 * 1024 * 1024,
      Math.max(10, Number(req.query.maxMb) || 300) * 1024 * 1024
    );

    if (!rawUrl || rawUrl.length > 2048) {
      res.status(400).json({ error: 'Missing or invalid direct media URL.', code: 'INVALID_URL' });
      return;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      const upstream = await safeExternalFetch(rawUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!upstream.ok) {
        res.status(502).json({
          error: `Remote media server returned HTTP ${upstream.status}.`,
          code: 'UPSTREAM_ERROR',
        });
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const isAllowedType =
        contentType.startsWith('video/') ||
        contentType.includes('application/octet-stream') ||
        contentType === '';
      if (!isAllowedType) {
        res.status(400).json({
          error: `Remote URL returned unsupported content type (${contentType.split(';')[0]}). Expected a direct video file.`,
          code: 'UNSUPPORTED_CONTENT_TYPE',
        });
        return;
      }

      const contentLengthHeader = upstream.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredBytes = Number(contentLengthHeader);
        if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
          res.status(413).json({
            error: `Remote media file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB transfer limit.`,
            code: 'FILE_TOO_LARGE',
          });
          return;
        }
        res.setHeader('Content-Length', contentLengthHeader);
      }

      res.setHeader('Content-Type', contentType || 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');

      if (!upstream.body) {
        res.status(502).json({ error: 'Remote media stream was empty.', code: 'EMPTY_BODY' });
        return;
      }

      let transferred = 0;
      const nodeStream = Readable.fromWeb(upstream.body as unknown as import('stream/web').ReadableStream);
      nodeStream.on('data', (chunk: Buffer) => {
        transferred += chunk.length;
        if (transferred > maxBytes) {
          controller.abort();
          nodeStream.destroy(new Error('FILE_TOO_LARGE'));
        }
      });
      nodeStream.on('error', () => {
        if (!res.headersSent) {
          res.status(413).json({ error: 'Remote media stream exceeded size limit.' });
        } else {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch remote media URL.';
      res.status(400).json({ error: message, code: 'PROXY_FETCH_FAILED' });
    }
  });

  // Server-side Gemini native YouTube video highlight analysis endpoint
  app.post(
    '/api/ai/analyze-youtube',
    express.json({ limit: '64kb' }),
    async (req: Request, res: Response) => {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
      if (!isValidYouTubeVideoId(videoId)) {
        res.status(400).json({
          error: 'A valid 11-character YouTube video ID is required.',
          code: 'INVALID_REQUEST',
        });
        return;
      }

      const title =
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim().slice(0, 200)
          : `YouTube Video (${videoId})`;
      const durationSeconds = Math.max(10, Math.min(86400, Number(body.durationSeconds) || 600));
      const allowedModes = new Set<ClipCategory>([
        'Funny Moments',
        'Interesting Moments',
        'Educational',
        'Podcast',
        'Gaming',
        'Reactions',
        'Automatic Selection',
      ]);
      const rawMode = typeof body.contentMode === 'string' ? (body.contentMode as ClipCategory) : 'Funny Moments';
      const contentMode: ClipCategory = allowedModes.has(rawMode) ? rawMode : 'Funny Moments';
      const allowedDurations: ClipDurationOption[] = [15, 30, 45, 60];
      const rawDuration = Number(body.targetDurationSeconds);
      const targetDurationSeconds: ClipDurationOption = allowedDurations.includes(
        rawDuration as ClipDurationOption
      )
        ? (rawDuration as ClipDurationOption)
        : 30;
      const clipCount = Math.max(1, Math.min(10, Math.round(Number(body.clipCount) || 3)));
      const windowStartSec = Number.isFinite(Number(body.windowStartSec))
        ? Math.max(0, Number(body.windowStartSec))
        : undefined;
      const windowEndSec = Number.isFinite(Number(body.windowEndSec))
        ? Math.max(0, Number(body.windowEndSec))
        : undefined;

      try {
        const result = await analyzeYouTubeVideoWithGemini({
          videoId,
          title,
          durationSeconds,
          contentMode,
          targetDurationSeconds,
          clipCount,
          windowStartSec,
          windowEndSec,
        });
        res.status(200).json(result);
      } catch (err) {
        const formatted = formatGeminiApiError(err);
        res.status(formatted.statusCode).json({
          error: formatted.message,
          code: formatted.code,
          retryable: formatted.retryable,
        });
      }
    }
  );

  // Clean JSON error handler for malformed JSON / oversized payloads on /api/*
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const record = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
    const status = Number(record.status ?? record.statusCode) || 500;
    if (status === 413) {
      res.status(413).json({
        error: 'Extracted audio payload is too large for a single analysis pass. Please trim or analyze a shorter section.',
        code: 'PAYLOAD_TOO_LARGE',
      });
      return;
    }
    if (status === 400) {
      res.status(400).json({
        error: 'Malformed JSON request sent to analysis API.',
        code: 'BAD_JSON',
      });
      return;
    }
    res.status(status).json({
      error: 'Unexpected server error while processing your request.',
      code: 'SERVER_ERROR',
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const ffmpegDistDir = path.resolve(distDir, 'ffmpeg');
    const ffmpegNodeDir = path.resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm');

    app.get('/ffmpeg/:file', (req: Request, res: Response, next: NextFunction) => {
      const file = req.params.file;
      if (file !== 'ffmpeg-core.js' && file !== 'ffmpeg-core.wasm') {
        next();
        return;
      }
      const primary = path.resolve(ffmpegDistDir, file);
      const fallback = path.resolve(ffmpegNodeDir, file);
      const target = fs.existsSync(primary) ? primary : fs.existsSync(fallback) ? fallback : null;
      if (!target) {
        next();
        return;
      }
      res.setHeader(
        'Content-Type',
        file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8'
      );
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      fs.createReadStream(target).pipe(res);
    });

    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`ClipForge AI server running on http://${HOST}:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ClipForge AI server:', err);
  process.exit(1);
});
