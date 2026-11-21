import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Camera,
  Download,
  Flag,
  Monitor,
  Radio,
  Square,
  Trash2,
} from 'lucide-react';
import { formatTimecode } from '../utils/timecode';
import { triggerRealBlobDownload } from '../utils/videoEngine';

interface LiveMoment {
  id: string;
  timestampSec: number;
  label: string;
  source: 'manual' | 'audio-peak';
  saved: boolean;
}

interface LiveCaptureClip {
  id: string;
  title: string;
  durationSec: number;
  mimeType: string;
  blob: Blob;
  createdAt: string;
}

interface LiveClipperViewProps {
  onNavigateCreate: () => void;
}

export function LiveClipperView({ onNavigateCreate }: LiveClipperViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const lastPeakTimeRef = useRef<number>(-10);

  const [streamUrl, setStreamUrl] = useState('');
  const [urlNotice, setUrlNotice] = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<'none' | 'screen' | 'camera'>('none');
  const [statusMessage, setStatusMessage] = useState<string>(
    'Connect a browser tab, screen, or camera to monitor live video and mark moments.'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [moments, setMoments] = useState<LiveMoment[]>([]);
  const [capturedRecordings, setCapturedRecordings] = useState<LiveCaptureClip[]>([]);

  const isLive = captureSource !== 'none';

  const stopCapture = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCaptureSource('none');
    setAudioLevel(0);
    setStatusMessage('Stream disconnected. Saved recordings remain available below.');
  };

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, (Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [isLive]);

  const startLiveStream = async (mode: 'screen' | 'camera') => {
    setErrorMessage(null);
    setUrlNotice(null);

    if (!navigator.mediaDevices) {
      setErrorMessage('Browser MediaDevices API is unavailable in this environment.');
      return;
    }

    try {
      const stream =
        mode === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            })
          : await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });

      streamRef.current = stream;
      startedAtRef.current = Date.now();
      lastPeakTimeRef.current = -10;
      setElapsedSec(0);
      setCaptureSource(mode);
      setStatusMessage(
        mode === 'screen'
          ? 'Monitoring live browser screen/tab capture.'
          : 'Monitoring live camera and microphone input.'
      );

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Attach real stop listener when user stops browser share bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => stopCapture();
      }

      // Start real MediaRecorder so stopped capture produces a real downloadable clip
      if (typeof MediaRecorder !== 'undefined') {
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            chunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = () => {
          if (chunksRef.current.length === 0) return;
          const recordedBlob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'video/webm',
          });
          const dur = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
          setCapturedRecordings((prev) => [
            {
              id: `live-rec-${Date.now()}`,
              title: `Live Capture (${formatTimecode(dur)})`,
              durationSec: dur,
              mimeType: recordedBlob.type || 'video/webm',
              blob: recordedBlob,
              createdAt: new Date().toISOString(),
            },
            ...prev,
          ]);
          chunksRef.current = [];
        };

        recorder.start(1000);
      }

      // Real Web Audio RMS peak monitor when an audio track is present
      if (stream.getAudioTracks().length > 0 && typeof AudioContext !== 'undefined') {
        try {
          const ctx = new AudioContext();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.fftSize);
          const monitor = () => {
            analyser.getByteTimeDomainData(dataArray);
            let sumSq = 0;
            for (let i = 0; i < dataArray.length; i += 1) {
              const centered = (dataArray[i] - 128) / 128;
              sumSq += centered * centered;
            }
            const rms = Math.sqrt(sumSq / dataArray.length);
            const pct = Math.min(100, Math.round(rms * 280));
            setAudioLevel(pct);

            const sec = (Date.now() - startedAtRef.current) / 1000;
            if (rms > 0.28 && sec - lastPeakTimeRef.current >= 8) {
              lastPeakTimeRef.current = sec;
              setMoments((prev) => [
                {
                  id: `peak-${Date.now()}`,
                  timestampSec: Math.round(sec * 10) / 10,
                  label: 'Audio Energy Spike Detected',
                  source: 'audio-peak',
                  saved: false,
                },
                ...prev,
              ]);
            }
            rafRef.current = requestAnimationFrame(monitor);
          };
          rafRef.current = requestAnimationFrame(monitor);
        } catch {
          // Ignore audio context restriction errors
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Permission denied or capture device unavailable in this browser.';
      setErrorMessage(msg);
      setCaptureSource('none');
    }
  };

  const handleMarkMoment = () => {
    const sec = Math.round(elapsedSec * 10) / 10;
    setMoments((prev) => [
      {
        id: `mark-${Date.now()}`,
        timestampSec: sec,
        label: `Manual Marker at ${formatTimecode(sec)}`,
        source: 'manual',
        saved: true,
      },
      ...prev,
    ]);
  };

  const handleToggleSaveMoment = (id: string) => {
    setMoments((prev) => prev.map((m) => (m.id === id ? { ...m, saved: !m.saved } : m)));
  };

  const handleRemoveMoment = (id: string) => {
    setMoments((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCheckStreamUrl = () => {
    const trimmed = streamUrl.trim();
    if (!trimmed) {
      setUrlNotice('Enter a stream URL or connect directly via Browser Screen / Camera below.');
      return;
    }
    setUrlNotice(
      'Direct RTMP/Twitch/YouTube stream ingestion requires a server relay. To clip a live broadcast right now in your browser, click "Capture Browser Tab / Screen" and select the stream window.'
    );
  };

  const savedMoments = moments.filter((m) => m.saved);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
              Live Clipper
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                isLive ? 'text-[#DC2626]' : 'text-[#737373]'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isLive ? 'bg-[#DC2626] animate-pulse' : 'bg-[#D4D4D4]'
                }`}
              />
              {isLive ? 'LIVE' : 'STANDBY'}
            </span>
          </div>
          <p className="text-sm text-[#737373] mt-1">
            Monitor a live screen capture or camera stream, detect audio peaks, mark standout
            moments, and save real browser recordings.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          {!isLive ? (
            <>
              <button
                type="button"
                onClick={() => void startLiveStream('screen')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>Capture Tab / Screen</span>
              </button>
              <button
                type="button"
                onClick={() => void startLiveStream('camera')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5 text-[#737373]" />
                <span>Use Camera</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleMarkMoment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFFFFF] hover:bg-[#FEF2F2] border border-[#DC2626] text-[#DC2626] text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Flag className="h-3.5 w-3.5" />
                <span>Mark Moment</span>
              </button>
              <button
                type="button"
                onClick={stopCapture}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop &amp; Save Recording</span>
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs text-[#B91C1C]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#DC2626]" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Two-Column Monitoring Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Video Preview + Stream Connection + Processing Info */}
        <div className="lg:col-span-7 space-y-5">
          {/* Live Video Preview Card */}
          <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#171717]">Live Video Preview</span>
              <span className="font-mono tabular-nums text-[#737373]">
                {isLive ? `REC ${formatTimecode(elapsedSec)}` : '00:00'}
              </span>
            </div>

            <div className="relative aspect-video bg-[#171717] flex items-center justify-center">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`h-full w-full object-contain ${isLive ? 'block' : 'hidden'}`}
              />
              {!isLive && (
                <div className="text-center px-6 py-10 space-y-3">
                  <Radio className="h-8 w-8 text-[#737373] mx-auto" />
                  <p className="text-sm font-medium text-white">No live source connected</p>
                  <p className="text-xs text-[#A3A3A3] max-w-sm mx-auto leading-relaxed">
                    Start a browser screen/tab capture or camera feed to monitor live video and log
                    timestamped moments in real time.
                  </p>
                </div>
              )}
              {isLive && (
                <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/70 text-[11px] font-mono text-white">
                  <span className="h-2 w-2 rounded-full bg-[#DC2626] animate-pulse" />
                  <span>LIVE · {formatTimecode(elapsedSec)}</span>
                </div>
              )}
            </div>

            {/* Stream Status & Real Audio Energy Meter */}
            <div className="px-4 py-3 bg-[#FAFAFA] border-t border-[#E5E5E5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="text-[#525252]">{statusMessage}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-[#737373]">Input Peak</span>
                <div className="w-24 h-2 rounded-full bg-[#E5E5E5] overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-100 rounded-full ${
                      audioLevel > 70 ? 'bg-[#DC2626]' : 'bg-[#171717]'
                    }`}
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Stream Connection Input */}
          <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold text-[#171717]">
              Stream URL Connection
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="live-stream-url" className="sr-only">
                Stream URL
              </label>
              <input
                id="live-stream-url"
                type="url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="Paste Twitch, YouTube Live, or RTMP URL..."
                className="flex-1 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3 py-2 text-xs text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
              />
              <button
                type="button"
                onClick={handleCheckStreamUrl}
                className="px-4 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] whitespace-nowrap"
              >
                Check Stream
              </button>
            </div>
            {urlNotice && (
              <p className="text-xs text-[#525252] bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg px-3 py-2 leading-relaxed">
                {urlNotice}
              </p>
            )}
          </section>

          {/* Saved Live Recordings */}
          <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#171717]">
                Captured Recordings ({capturedRecordings.length})
              </h2>
              <button
                type="button"
                onClick={onNavigateCreate}
                className="text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C]"
              >
                Upload to AI Clipper →
              </button>
            </div>

            {capturedRecordings.length === 0 ? (
              <p className="text-xs text-[#737373]">
                When you stop a live browser capture, the recorded WebM file appears here ready for
                download or AI clipping.
              </p>
            ) : (
              <div className="space-y-2">
                {capturedRecordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#171717] truncate">{rec.title}</p>
                      <p className="text-[11px] font-mono text-[#737373]">
                        {rec.mimeType.split(';')[0]} · {(rec.blob.size / (1024 * 1024)).toFixed(2)}{' '}
                        MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        triggerRealBlobDownload(rec.blob, `clipforge-live-${rec.id}.webm`)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Detected Moments + Saved Moments + Processing Info */}
        <div className="lg:col-span-5 space-y-5">
          {/* Detected Moments */}
          <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#171717]">
                Detected &amp; Marked Moments
              </h2>
              <span className="font-mono text-xs text-[#737373]">{moments.length}</span>
            </div>

            {moments.length === 0 ? (
              <div className="rounded-xl bg-[#FAFAFA] border border-dashed border-[#E5E5E5] p-6 text-center text-xs text-[#737373]">
                No moments logged yet. Start a capture and click Mark Moment or let live audio peak
                detection flag highlights.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {moments.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${
                      m.saved ? 'bg-[#FEF2F2] border-[#FECACA]' : 'bg-[#FAFAFA] border-[#E5E5E5]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#171717] truncate">{m.label}</p>
                      <p className="text-[11px] font-mono text-[#737373] mt-0.5">
                        {formatTimecode(m.timestampSec)} ·{' '}
                        {m.source === 'audio-peak' ? 'Auto audio peak' : 'Manual marker'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSaveMoment(m.id)}
                        aria-label={m.saved ? 'Unsave moment' : 'Save moment'}
                        className={`p-1.5 rounded-lg border ${
                          m.saved
                            ? 'bg-[#FFFFFF] border-[#DC2626] text-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#737373] hover:text-[#171717]'
                        }`}
                      >
                        <Bookmark className={`h-3.5 w-3.5 ${m.saved ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMoment(m.id)}
                        aria-label="Delete moment"
                        className="p-1.5 rounded-lg text-[#737373] hover:text-[#DC2626]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Saved Moments */}
          <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#171717]">Saved Moments</h2>
              <span className="font-mono text-xs text-[#DC2626] font-semibold">
                {savedMoments.length}
              </span>
            </div>
            {savedMoments.length === 0 ? (
              <p className="text-xs text-[#737373]">
                Bookmark any detected moment above to pin its exact timestamp for fast trimming.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {savedMoments.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-[#F5F5F5] last:border-b-0"
                  >
                    <span className="text-[#171717] font-medium truncate">{m.label}</span>
                    <span className="font-mono text-[#DC2626] shrink-0">
                      {formatTimecode(m.timestampSec)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Processing Information */}
          <section className="rounded-2xl bg-[#FAFAFA] border border-[#E5E5E5] p-5 space-y-2 text-xs text-[#737373]">
            <h2 className="font-display text-sm font-semibold text-[#171717]">
              Processing Information
            </h2>
            <div className="flex items-center justify-between pt-1">
              <span>Capture Engine</span>
              <span className="font-mono text-[#171717]">MediaDevices + MediaRecorder</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Peak Detection</span>
              <span className="font-mono text-[#171717]">Web Audio RMS Analyser</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Storage</span>
              <span className="font-mono text-[#171717]">Local Browser Memory</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
