import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const ffmpegCoreDir = path.resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm');

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Serves @ffmpeg/core locally at /ffmpeg/* during dev and copies into dist/ffmpeg/ on build
      // so FFmpeg.wasm works reliably without external CDN dependencies.
      {
        name: 'serve-local-ffmpeg-core',
        configureServer(server) {
          server.middlewares.use('/ffmpeg', (req, res, next) => {
            const urlPath = (req.url || '').split('?')[0].replace(/^\/+/, '');
            if (urlPath !== 'ffmpeg-core.js' && urlPath !== 'ffmpeg-core.wasm') {
              next();
              return;
            }
            const filePath = path.join(ffmpegCoreDir, urlPath);
            if (!fs.existsSync(filePath)) {
              next();
              return;
            }
            res.setHeader(
              'Content-Type',
              urlPath.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8'
            );
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            fs.createReadStream(filePath).pipe(res);
          });
        },
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const distFfmpeg = path.resolve(distDir, 'ffmpeg');
          if (fs.existsSync(distDir) && fs.existsSync(ffmpegCoreDir)) {
            fs.mkdirSync(distFfmpeg, { recursive: true });
            for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
              const src = path.join(ffmpegCoreDir, file);
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(distFfmpeg, file));
              }
            }
          }
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
