import { BookOpen, Film, HelpCircle, Keyboard, Sparkles } from 'lucide-react';

interface HelpSupportViewProps {
  onNavigateCreate: () => void;
}

const SHORTCUTS = [
  { keys: 'Ctrl / Cmd + Z', action: 'Undo last edit in Video Editor' },
  { keys: 'Ctrl / Cmd + Shift + Z', action: 'Redo undone edit in Video Editor' },
  { keys: 'Left / Right Arrow', action: 'Nudge timeline playhead when focused' },
  { keys: 'Escape', action: 'Close open preview modals' },
];

const GUIDES = [
  {
    icon: Film,
    title: 'Supported Video Formats',
    body: 'Upload MP4 (H.264 / AAC), WebM (VP8 / VP9 / Opus), and browser-decoded MOV files up to your configured limit (300 MB default, adjustable up to 2,000 MB in Settings).',
  },
  {
    icon: Sparkles,
    title: 'How Gemini AI Clip Selection Works',
    body: 'ClipForge extracts 30-second 16kHz mono WAV chunks in your browser and sends them to a server-side Gemini endpoint. Timestamps are strictly validated against your actual video duration before FFmpeg.wasm cuts the MP4 clips.',
  },
  {
    icon: BookOpen,
    title: 'Caption Languages & Custom Colors',
    body: 'Auto Captions support English, Hindi (Devanagari), and Hinglish. Every caption template keeps text, highlight, outline, shadow, and background box colors independently customizable.',
  },
];

export function HelpSupportView({ onNavigateCreate }: HelpSupportViewProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
            Help &amp; Support
          </h1>
          <p className="text-sm text-[#737373] mt-1">
            Studio documentation, supported video formats, keyboard shortcuts, and troubleshooting.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateCreate}
          className="px-4 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          Start New Project
        </button>
      </div>

      {/* Studio Guides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {GUIDES.map((g) => {
          const Icon = g.icon;
          return (
            <section
              key={g.title}
              className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 space-y-3"
            >
              <div className="h-9 w-9 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center">
                <Icon className="h-4 w-4 text-[#DC2626]" />
              </div>
              <h2 className="font-display text-sm font-semibold text-[#171717]">{g.title}</h2>
              <p className="text-xs text-[#737373] leading-relaxed">{g.body}</p>
            </section>
          );
        })}
      </div>

      {/* Keyboard Shortcuts */}
      <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-[#DC2626]" />
          <h2 className="font-display text-base font-semibold text-[#171717]">
            Editor Keyboard Shortcuts
          </h2>
        </div>

        <div className="divide-y divide-[#E5E5E5]">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="py-3 flex items-center justify-between gap-4 text-xs">
              <span className="text-[#525252]">{s.action}</span>
              <kbd className="px-2.5 py-1 rounded-md bg-[#FAFAFA] border border-[#E5E5E5] font-mono text-[11px] text-[#171717] whitespace-nowrap">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-[#DC2626]" />
          <h2 className="font-display text-base font-semibold text-[#171717]">
            Troubleshooting Checklist
          </h2>
        </div>

        <div className="space-y-3 text-xs text-[#737373] leading-relaxed">
          <p>
            <strong className="text-[#171717]">MOV file fails to decode:</strong> Some camera MOV
            files use HEVC/ProRes codecs not supported by all browsers. Re-encode to H.264 MP4 or
            use Safari/Chrome on supported hardware.
          </p>
          <p>
            <strong className="text-[#171717]">FFmpeg.wasm slow or out of memory:</strong> Lower
            Export Resolution Target to 720p in Settings, keep clips concise, or use the built-in
            Browser WebM Fallback button when prompted.
          </p>
          <p>
            <strong className="text-[#171717]">Reopening saved projects:</strong> All uploaded
            videos, thumbnails, and rendered MP4 clips persist locally inside your browser&apos;s
            IndexedDB storage until you clear workspace data in Settings.
          </p>
        </div>
      </section>
    </div>
  );
}
