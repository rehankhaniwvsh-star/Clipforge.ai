import { useEffect, useState } from 'react';
import { ArrowRight, Pause, Play, X } from 'lucide-react';
import { CaptionTemplateId } from '../types/clipforge';
import { CAPTION_TEMPLATES } from '../data/templates';
import { CaptionRenderer } from './CaptionRenderer';

interface DemoModalProps {
  open: boolean;
  onClose: () => void;
  onStartCreating: () => void;
}

const DEMO_STEPS = [
  {
    id: 'upload',
    step: '01',
    title: 'Upload Long Video',
    desc: 'Drop any MP4, MOV, or WebM recording directly in the browser. Metadata, thumbnails, and audio chunks prepare locally.',
    timecode: '00:00 – 48:15',
    caption: 'UPLOAD ONCE AND LET AI SCAN THE FULL EPISODE',
    templateId: 'podcast-pro' as CaptionTemplateId,
  },
  {
    id: 'detect',
    step: '02',
    title: 'AI Moment Detection',
    desc: 'Gemini AI reads transcript context to isolate punchlines, hooks, and educational beats with validated timestamps.',
    timecode: '04:12 – 04:42',
    caption: 'THIS ONE HOOK DOUBLED OUR WATCH TIME',
    templateId: 'bold-viral' as CaptionTemplateId,
  },
  {
    id: 'export',
    step: '03',
    title: 'Style & Export MP4',
    desc: 'Switch between 10 caption templates, reframe to 9:16 vertical, fine-tune the timeline, and render a real playable MP4.',
    timecode: '00:00 – 00:30',
    caption: 'READY FOR SHORTS REELS AND TIKTOK',
    templateId: 'karaoke' as CaptionTemplateId,
  },
];

export function DemoModal({ open, onClose, onStartCreating }: DemoModalProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [wordTick, setWordTick] = useState(0);

  useEffect(() => {
    if (!open || !playing) return;
    const interval = window.setInterval(() => {
      setWordTick((prev) => prev + 1);
    }, 600);
    return () => window.clearInterval(interval);
  }, [open, playing]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const active = DEMO_STEPS[stepIdx];
  const tpl = CAPTION_TEMPLATES.find((t) => t.id === active.templateId) || CAPTION_TEMPLATES[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5]">
          <div>
            <h2 id="demo-modal-title" className="font-display text-base font-bold text-[#171717]">
              ClipForge AI Studio Walkthrough
            </h2>
            <p className="text-xs text-[#737373]">
              Interactive preview of the browser-based clipping pipeline
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close demo preview"
            className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 bg-[#FAFAFA]">
          {/* Preview Frame */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="relative w-full max-w-[230px] aspect-[9/16] rounded-xl overflow-hidden bg-[#171717] border border-[#E5E5E5] shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-b from-[#262626] via-[#171717] to-[#0A0A0A]" />
              <div className="absolute top-3 inset-x-3 flex items-center justify-between text-[10px] font-mono text-white/80">
                <span className="px-1.5 py-0.5 rounded bg-black/60">{active.timecode}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/60">9:16</span>
              </div>

              <CaptionRenderer
                templateId={tpl.id}
                text={active.caption}
                fontFamily={tpl.defaultFontFamily}
                fontSize={tpl.defaultFontSize}
                fontColor={tpl.defaultFontColor}
                highlightColor={tpl.defaultHighlightColor}
                backgroundColor={tpl.defaultBackgroundColor}
                backgroundOpacity={tpl.defaultBackgroundOpacity}
                outlineWidth={tpl.defaultOutlineWidth}
                outlineColor={tpl.defaultOutlineColor}
                shadowStyle={tpl.defaultShadowStyle}
                position="center"
                activeWordIndex={wordTick}
                compact
              />

              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? 'Pause caption demo' : 'Play caption demo'}
                className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 hover:bg-[#DC2626] text-white backdrop-blur-sm transition-colors"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
              </button>
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="md:col-span-7 flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              {DEMO_STEPS.map((s, idx) => {
                const isSelected = idx === stepIdx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStepIdx(idx)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-[#FEF2F2] border-[#DC2626]'
                        : 'bg-[#FFFFFF] border-[#E5E5E5] hover:border-[#D4D4D4]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-mono text-xs font-semibold ${
                          isSelected ? 'text-[#DC2626]' : 'text-[#737373]'
                        }`}
                      >
                        {s.step}
                      </span>
                      <span className="font-display text-sm font-semibold text-[#171717]">
                        {s.title}
                      </span>
                    </div>
                    <p className="text-xs text-[#737373] mt-1.5 leading-relaxed">{s.desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#171717]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartCreating();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors"
              >
                <span>Open Studio</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
