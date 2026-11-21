import { useEffect, useState } from 'react';
import { Check, Eye, SlidersHorizontal, X } from 'lucide-react';
import { CaptionTemplateConfig, CaptionTemplateId } from '../types/clipforge';
import { CAPTION_TEMPLATES } from '../data/templates';
import { CaptionRenderer } from './CaptionRenderer';

interface CaptionTemplatesViewProps {
  defaultTemplateId: CaptionTemplateId;
  onSetDefaultTemplate: (templateId: CaptionTemplateId) => void;
  onUseTemplateInEditor: (templateId: CaptionTemplateId) => void;
}

export function CaptionTemplatesView({
  defaultTemplateId,
  onSetDefaultTemplate,
  onUseTemplateInEditor,
}: CaptionTemplatesViewProps) {
  const [tick, setTick] = useState(0);
  const [previewTemplate, setPreviewTemplate] = useState<CaptionTemplateConfig | null>(null);
  const [customPreviewLine, setCustomPreviewLine] = useState('');

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 650);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
            Caption Templates
          </h1>
          <p className="text-sm text-[#737373] mt-1">
            Choose from 10 studio subtitle styles. Video caption colors stay independently
            customizable inside the Video Editor.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <label htmlFor="template-sample-input" className="sr-only">
            Test custom caption preview text
          </label>
          <input
            id="template-sample-input"
            type="text"
            value={customPreviewLine}
            onChange={(e) => setCustomPreviewLine(e.target.value)}
            placeholder="Type sample line to test all 10 styles..."
            className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3 py-2 text-xs text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {CAPTION_TEMPLATES.map((tpl) => {
          const isDefault = defaultTemplateId === tpl.id;
          const displayLine = customPreviewLine.trim() || tpl.sampleLine;

          return (
            <article
              key={tpl.id}
              data-testid={`template-card-${tpl.id}`}
              className={`rounded-2xl bg-[#FFFFFF] border overflow-hidden flex flex-col justify-between transition-colors ${
                isDefault ? 'border-[#DC2626] ring-1 ring-[#DC2626]/20' : 'border-[#E5E5E5] hover:border-[#D4D4D4]'
              }`}
            >
              {/* Dark Video Stage Preview so subtitle typography renders authentically */}
              <div className="relative h-48 bg-[#171717] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-[#262626] via-[#171717] to-[#0D0D0D]" />
                <div className="absolute top-3 inset-x-3 flex items-center justify-between text-[10px] font-mono text-white/75">
                  <span className="px-2 py-0.5 rounded bg-black/55">{tpl.defaultFontFamily}</span>
                  {isDefault && (
                    <span className="px-2 py-0.5 rounded bg-[#DC2626] text-white font-sans font-semibold">
                      Default
                    </span>
                  )}
                </div>

                <CaptionRenderer
                  templateId={tpl.id}
                  text={displayLine}
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
                  activeWordIndex={tick}
                  compact
                />
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-sm font-semibold text-[#171717]">
                      {tpl.name}
                    </h2>
                    <div className="flex items-center gap-1" aria-label="Template default palette">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-[#E5E5E5]"
                        style={{ backgroundColor: tpl.defaultFontColor }}
                        title={`Text: ${tpl.defaultFontColor}`}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-[#E5E5E5]"
                        style={{ backgroundColor: tpl.defaultHighlightColor }}
                        title={`Highlight: ${tpl.defaultHighlightColor}`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-[#737373] leading-relaxed">{tpl.subtitle}</p>
                  <p className="text-[11px] text-[#737373] pt-0.5">
                    Best for: <span className="text-[#171717]">{tpl.bestFor}</span>
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-3 border-t border-[#E5E5E5]">
                  <button
                    type="button"
                    onClick={() => setPreviewTemplate(tpl)}
                    className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#171717] transition-colors whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5 text-[#737373]" />
                    <span>Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetDefaultTemplate(tpl.id)}
                    className={`inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
                      isDefault
                        ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                        : 'bg-[#FFFFFF] hover:bg-[#FAFAFA] border-[#E5E5E5] text-[#171717]'
                    }`}
                  >
                    {isDefault && <Check className="h-3.5 w-3.5" />}
                    <span>{isDefault ? 'Applied' : 'Apply'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUseTemplateInEditor(tpl.id)}
                    className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Customize</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Live Expanded Template Preview Modal */}
      {previewTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewTemplate.name} template`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-[#E5E5E5] flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-[#171717]">
                  {previewTemplate.name}
                </h3>
                <p className="text-xs text-[#737373]">{previewTemplate.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                aria-label="Close template preview"
                className="p-1.5 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 bg-[#F5F5F5] flex justify-center">
              <div className="relative w-full max-w-[230px] aspect-[9/16] rounded-xl bg-[#171717] border border-[#E5E5E5] overflow-hidden shadow-md">
                <div className="absolute inset-0 bg-gradient-to-b from-[#262626] via-[#171717] to-[#0D0D0D]" />
                <CaptionRenderer
                  templateId={previewTemplate.id}
                  text={customPreviewLine.trim() || previewTemplate.sampleLine}
                  fontFamily={previewTemplate.defaultFontFamily}
                  fontSize={previewTemplate.defaultFontSize}
                  fontColor={previewTemplate.defaultFontColor}
                  highlightColor={previewTemplate.defaultHighlightColor}
                  backgroundColor={previewTemplate.defaultBackgroundColor}
                  backgroundOpacity={previewTemplate.defaultBackgroundOpacity}
                  outlineWidth={previewTemplate.defaultOutlineWidth}
                  outlineColor={previewTemplate.defaultOutlineColor}
                  shadowStyle={previewTemplate.defaultShadowStyle}
                  position={previewTemplate.defaultPosition}
                  activeWordIndex={tick}
                  compact
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-[#FFFFFF] border-t border-[#E5E5E5] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  onSetDefaultTemplate(previewTemplate.id);
                  setPreviewTemplate(null);
                }}
                className="px-3.5 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717]"
              >
                Apply as Default
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = previewTemplate.id;
                  setPreviewTemplate(null);
                  onUseTemplateInEditor(id);
                }}
                className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold"
              >
                Customize in Editor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
