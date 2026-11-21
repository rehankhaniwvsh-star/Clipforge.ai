export interface FaceDetectionResult {
  anchorX: number; // 0..1 normalized X coordinate of face/subject center
  anchorY: number; // 0..1 normalized Y coordinate of face/subject center
  source: 'browser-face-detector' | 'canvas-saliency';
  detectedCount: number;
}

interface NativeFaceDetector {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
}

/**
 * Detects speaker face center for Face-Centered Crop using the browser's native
 * Shape Detection `FaceDetector` API when available, falling back to a Canvas 2D
 * skin-tone & upper-frame saliency center-of-mass analyzer.
 */
export async function detectFaceCenterFromVideoSource(
  videoBlobOrUrl: Blob | string,
  sampleTimeSec = 1.0
): Promise<FaceDetectionResult> {
  const isBlob = videoBlobOrUrl instanceof Blob;
  const srcUrl = isBlob ? URL.createObjectURL(videoBlobOrUrl) : videoBlobOrUrl;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Video frame load timed out.')), 6000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Could not decode video frame for face detection.'));
      };
      video.src = srcUrl;
      video.load();
    });

    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const seekSec = Math.max(0.1, Math.min(dur - 0.1, sampleTimeSec));
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => resolve(), 2000);
      video.addEventListener(
        'seeked',
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
      try {
        video.currentTime = seekSec;
      } catch {
        window.clearTimeout(timeout);
        resolve();
      }
    });

    const w = Math.min(320, Math.max(120, video.videoWidth || 320));
    const h = Math.max(90, Math.round((w * (video.videoHeight || 180)) / Math.max(1, video.videoWidth || 320)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { anchorX: 0.5, anchorY: 0.35, source: 'canvas-saliency', detectedCount: 0 };
    }
    ctx.drawImage(video, 0, 0, w, h);

    // 1. Try native browser FaceDetector API where supported
    const FaceDetectorCtor = (window as unknown as { FaceDetector?: new (opts?: object) => NativeFaceDetector })
      .FaceDetector;
    if (typeof FaceDetectorCtor === 'function') {
      try {
        const detector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 3 });
        const faces = await detector.detect(canvas);
        if (faces && faces.length > 0) {
          // Pick largest detected face bounding box
          const primary = faces.reduce((best, f) =>
            f.boundingBox.width * f.boundingBox.height > best.boundingBox.width * best.boundingBox.height
              ? f
              : best
          );
          const cx = (primary.boundingBox.x + primary.boundingBox.width / 2) / w;
          const cy = (primary.boundingBox.y + primary.boundingBox.height / 2) / h;
          return {
            anchorX: Math.round(Math.max(0.15, Math.min(0.85, cx)) * 100) / 100,
            anchorY: Math.round(Math.max(0.15, Math.min(0.75, cy)) * 100) / 100,
            source: 'browser-face-detector',
            detectedCount: faces.length,
          };
        }
      } catch {
        // Fall through to canvas saliency analysis
      }
    }

    // 2. Canvas 2D YCbCr skin-tone + upper-frame contrast saliency fallback
    const imgData = ctx.getImageData(0, 0, w, h).data;
    let sumX = 0;
    let sumY = 0;
    let totalWeight = 0;

    for (let y = 0; y < h; y += 2) {
      const upperBias = y < h * 0.65 ? 1.4 : 0.6;
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];

        // YCbCr skin-tone chrominance range
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const isSkinTone = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > 60;

        if (isSkinTone) {
          const weight = 2.5 * upperBias;
          sumX += (x / w) * weight;
          sumY += (y / h) * weight;
          totalWeight += weight;
        }
      }
    }

    if (totalWeight > 25) {
      return {
        anchorX: Math.round(Math.max(0.18, Math.min(0.82, sumX / totalWeight)) * 100) / 100,
        anchorY: Math.round(Math.max(0.18, Math.min(0.68, sumY / totalWeight)) * 100) / 100,
        source: 'canvas-saliency',
        detectedCount: 1,
      };
    }

    return {
      anchorX: 0.5,
      anchorY: 0.36,
      source: 'canvas-saliency',
      detectedCount: 0,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (isBlob) URL.revokeObjectURL(srcUrl);
  }
}
