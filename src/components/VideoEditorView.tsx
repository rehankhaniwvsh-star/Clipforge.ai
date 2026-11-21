import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Crop,
  Download,
  Eye,
  Film,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ScanFace,
  Scissors,
  Sliders,
  Sparkles,
  Subtitles,
  Trash2,
  Type,
  Undo2,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AspectRatio,
  CaptionAlignment,
  CaptionAnimationSpeed,
  CaptionFontFamily,
  CaptionLanguageMode,
  CaptionReactionResponse,
  CaptionSegment,
  CaptionShadowStyle,
  CaptionTemplateId,
  ClipItem,
  ProcessingStatus,
  ReactionEffectItem,
  ReactionEffectType,
  SoundEffectId,
  TextPosition,
  VideoCropMode,
} from '../types/clipforge';
import {
  ASPECT_RATIOS,
  CAPTION_FONTS,
  CAPTION_LANGUAGES,
  CAPTION_TEMPLATES,
  REACTION_EFFECT_META,
  SOUND_EFFECTS,
  TEMPLATE_BY_ID,
  VIDEO_CROP_MODES,
} from '../data/templates';
import { clampTrimRange, formatDurationLabel, formatTimecode } from '../utils/timecode';
import { previewSoundEffect } from '../utils/mediaTools';
import { terminateFfmpegWorker } from '../utils/videoEngine';
import { classifyProcessingError, validateTrimTimestamps } from '../utils/videoEngineLogic';
import {
  buildWordsForSegment,
  resolveEditorSettings,
  updateCaptionSegmentText,
} from '../utils/captionReactionLogic';
import { FaceDetectionResult } from '../utils/faceCropDetector';
import { ClipPlayer } from './ClipPlayer';
import { ProcessingStatusBanner } from './ProcessingStatusBanner';

type EditorToolTab = 'media' | 'captions' | 'text' | 'effects' | 'audio' | 'crop';

interface VideoEditorViewProps {
  clips: ClipItem[];
  activeClipId: string;
  onSelectClip: (clipId: string) => void;
  onSaveClip: (updatedClip: ClipItem) => void;
  onRenderTrimmedClip: (
    clip: ClipItem,
    onStatus: (status: ProcessingStatus) => void,
    signal: AbortSignal,
    useFallback?: boolean
  ) => Promise<ClipItem | null>;
  onGenerateCaptionsAndReactions: (
    clip: ClipItem,
    options: { languageMode: CaptionLanguageMode; includeReactions: boolean },
    onStatus: (status: ProcessingStatus) => void,
    signal: AbortSignal
  ) => Promise<CaptionReactionResponse>;
  onDetectFaceCenter: (clip: ClipItem) => Promise<FaceDetectionResult>;
  onExportClip: (
    clip: ClipItem,
    onStatus?: (status: ProcessingStatus) => void,
    useFallback?: boolean,
    signal?: AbortSignal
  ) => Promise<void>;
  onNavigateCreate: () => void;
}

const TOOL_TABS: Array<{ id: EditorToolTab; label: string; icon: typeof Film }> = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'captions', label: 'Captions', icon: Subtitles },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'effects', label: 'Effects', icon: Sparkles },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'crop', label: 'Crop', icon: Crop },
];

const COLOR_SWATCHES = [
  '#FFFFFF',
  '#FACC15',
  '#DC2626',
  '#3B82F6',
  '#16A34A',
  '#F97316',
  '#171717',
];

const REACTION_EMOJI_PRESETS = ['💀', '😂', '🤯', '🔥', '👀', '😱', '😹', '💯'];
const MAX_HISTORY = 30;

export function VideoEditorView({
  clips,
  activeClipId,
  onSelectClip,
  onSaveClip,
  onRenderTrimmedClip,
  onGenerateCaptionsAndReactions,
  onDetectFaceCenter,
  onExportClip,
  onNavigateCreate,
}: VideoEditorViewProps) {
  const sourceClip = clips.find((c) => c.id === activeClipId) || clips[0] || null;
  const [draft, setDraft] = useState<ClipItem | null>(sourceClip);
  const [past, setPast] = useState<ClipItem[]>([]);
  const [future, setFuture] = useState<ClipItem[]>([]);
  const [activeTool, setActiveTool] = useState<EditorToolTab>('captions');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [savedNotice, setSavedNotice] = useState(false);
  const [busyMode, setBusyMode] = useState<
    'none' | 'recut' | 'export' | 'captions' | 'reactions' | 'face'
  >('none');
  const [reactionNote, setReactionNote] = useState<string>('');
  const [previewReactionId, setPreviewReactionId] = useState<string | null>(null);
  const [editingEffectId, setEditingEffectId] = useState<string | null>(null);
  const [newEffectType, setNewEffectType] = useState<ReactionEffectType>('quick-zoom');
  const [editorStatus, setEditorStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: null,
    detail: '',
  });
  const [lastActionForFallback, setLastActionForFallback] = useState<'recut' | 'export' | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setDraft(sourceClip);
    setPast([]);
    setFuture([]);
    setIsPlaying(false);
    setProgress(0);
    setSavedNotice(false);
    setReactionNote('');
    setPreviewReactionId(null);
    setEditingEffectId(null);
  }, [sourceClip?.id, sourceClip?.videoUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const commitDraftChange = useCallback((updater: (prev: ClipItem) => ClipItem) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      setPast((h) => [...h.slice(-(MAX_HISTORY - 1)), prev]);
      setFuture([]);
      return next;
    });
    setSavedNotice(false);
  }, []);

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      setDraft((current) => {
        if (current) {
          setFuture((prevFuture) => [current, ...prevFuture.slice(0, MAX_HISTORY - 1)]);
        }
        return previous;
      });
      setSavedNotice(false);
      return prevPast.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      setDraft((current) => {
        if (current) {
          setPast((prevPast) => [...prevPast.slice(-(MAX_HISTORY - 1)), current]);
        }
        return next;
      });
      setSavedNotice(false);
      return prevFuture.slice(1);
    });
  }, []);

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isFormField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (isFormField) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  if (!draft) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-12 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center">
          <Scissors className="h-5 w-5 text-[#DC2626]" />
        </div>
        <h1 className="font-display text-xl font-bold text-[#171717]">No Clips Available to Edit</h1>
        <p className="text-sm text-[#737373] max-w-md mx-auto">
          Paste a YouTube link and generate clips first to open them inside the ClipForge
          light-theme Video Editor.
        </p>
        <button
          type="button"
          onClick={onNavigateCreate}
          className="px-5 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors"
        >
          Go to Create Clips
        </button>
      </div>
    );
  }

  const resolved = resolveEditorSettings(draft.editor);
  const clipDuration = Math.max(1, Math.round((draft.endTime - draft.startTime) * 10) / 10);
  const hasRealSourceVideo = Boolean(
    draft.sourceMediaStorageKey || draft.mediaStorageKey || draft.videoUrl
  );
  const isBusy = busyMode !== 'none';
  const acceptedEffectsCount = resolved.reactionEffects.filter(
    (e) => e.status === 'accepted'
  ).length;

  const updateEditor = (patch: Partial<ClipItem['editor']>) => {
    commitDraftChange((prev) => ({
      ...prev,
      editor: { ...prev.editor, ...patch },
    }));
  };

  const handleTrimChange = (nextStart: number, nextEnd: number) => {
    const minLen = Math.min(2, Math.max(1, draft.sourceDuration));
    const clamped = clampTrimRange(nextStart, nextEnd, draft.sourceDuration, minLen);
    commitDraftChange((prev) => ({
      ...prev,
      startTime: clamped.startTime,
      endTime: clamped.endTime,
    }));
  };

  const handleApplyTemplatePreset = (templateId: CaptionTemplateId) => {
    const tpl = TEMPLATE_BY_ID[templateId];
    updateEditor({
      templateId,
      fontFamily:
        resolved.captionLanguage === 'hindi' ? 'Noto Sans Devanagari' : tpl.defaultFontFamily,
      fontColor: tpl.defaultFontColor,
      highlightColor: tpl.defaultHighlightColor,
      backgroundColor: tpl.defaultBackgroundColor,
      backgroundOpacity: tpl.defaultBackgroundOpacity,
      outlineWidth: tpl.defaultOutlineWidth,
      outlineColor: tpl.defaultOutlineColor,
      shadowStyle: tpl.defaultShadowStyle,
      fontSize: tpl.defaultFontSize,
      textPosition: tpl.defaultPosition,
    });
  };

  const handleResetEdits = () => {
    if (sourceClip) {
      commitDraftChange(() => sourceClip);
    }
  };

  const handleSave = () => {
    onSaveClip(draft);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    terminateFfmpegWorker();
    setBusyMode('none');
    setEditorStatus({
      stage: 'Failed',
      progress: null,
      detail: 'Processing cancelled.',
      error: 'Video processing cancelled by user.',
    });
  };

  const handleGenerateCaptions = async (includeReactions: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyMode(includeReactions ? 'reactions' : 'captions');

    try {
      const res = await onGenerateCaptionsAndReactions(
        draft,
        {
          languageMode: resolved.captionLanguage,
          includeReactions,
        },
        setEditorStatus,
        controller.signal
      );

      if (res.status === 'no_speech') {
        setReactionNote(res.reactionNote);
        setEditorStatus({
          stage: 'Completed',
          progress: 100,
          detail:
            'No intelligible speech detected in this clip audio. You can still type custom captions manually.',
        });
        return;
      }

      const combinedText = res.captions.map((s) => s.text).join(' ');
      const nextFont: CaptionFontFamily =
        res.detectedLanguage === 'hi' || resolved.captionLanguage === 'hindi'
          ? 'Noto Sans Devanagari'
          : resolved.fontFamily;

      const patch: Partial<ClipItem['editor']> = {
        captions: res.captions,
        captionText: res.captions[0]?.text || combinedText || draft.editor.captionText,
        captionsTimingMode: res.hasWordTimestamps ? 'word-level' : 'sentence-level',
        fontFamily: nextFont,
        showSpeakerLabels: res.captions.some((c) => Boolean(c.speaker)),
      };

      if (includeReactions) {
        const existingManual = resolved.reactionEffects.filter((fx) => fx.source === 'manual');
        patch.reactionEffects = [...existingManual, ...res.reactionEffects];
        setReactionNote(res.reactionNote);
      }

      updateEditor(patch);
    } catch (err) {
      const classified = classifyProcessingError(err);
      setEditorStatus({
        stage: 'Failed',
        progress: null,
        detail: classified.message,
        error: classified.message,
      });
    } finally {
      setBusyMode('none');
    }
  };

  const handleDetectFace = async () => {
    setBusyMode('face');
    try {
      const result = await onDetectFaceCenter(draft);
      updateEditor({
        cropMode: 'face-centered',
        faceAnchorX: result.anchorX,
        faceAnchorY: result.anchorY,
        faceDetectionSource: result.source,
      });
      setEditorStatus({
        stage: 'Completed',
        progress: 100,
        detail:
          result.source === 'browser-face-detector'
            ? `Browser FaceDetector locked subject at (${Math.round(result.anchorX * 100)}%, ${Math.round(result.anchorY * 100)}%).`
            : `Framed speaker via canvas saliency anchor at (${Math.round(result.anchorX * 100)}%, ${Math.round(result.anchorY * 100)}%).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Face center detection failed.';
      setEditorStatus({
        stage: 'Failed',
        progress: null,
        detail: msg,
        error: msg,
      });
    } finally {
      setBusyMode('none');
    }
  };

  const handleRecutPreview = async (useFallback = false) => {
    const tsCheck = validateTrimTimestamps(draft.startTime, draft.endTime, draft.sourceDuration, 1);
    if (!tsCheck.valid) {
      setEditorStatus({
        stage: 'Failed',
        progress: null,
        detail: tsCheck.error || 'Invalid trim timestamps.',
        error: tsCheck.error || 'Invalid trim timestamps.',
        fallbackAvailable: false,
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyMode('recut');
    setLastActionForFallback('recut');

    try {
      const updated = await onRenderTrimmedClip(
        draft,
        setEditorStatus,
        controller.signal,
        useFallback
      );
      if (updated) {
        setDraft(updated);
      }
    } catch (err) {
      const classified = classifyProcessingError(err);
      setEditorStatus({
        stage: 'Failed',
        progress: null,
        detail: classified.message,
        error: classified.message,
        fallbackAvailable: classified.suggestFallback && !useFallback,
      });
    } finally {
      setBusyMode('none');
    }
  };

  const handleExport = async (useFallback = false) => {
    const tsCheck = validateTrimTimestamps(draft.startTime, draft.endTime, draft.sourceDuration, 1);
    if (!tsCheck.valid) {
      setEditorStatus({
        stage: 'Failed',
        progress: null,
        detail: tsCheck.error || 'Invalid trim timestamps.',
        error: tsCheck.error || 'Invalid trim timestamps.',
        fallbackAvailable: false,
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyMode('export');
    setLastActionForFallback('export');
    onSaveClip(draft);

    try {
      await onExportClip(draft, setEditorStatus, useFallback, controller.signal);
    } catch (err) {
      const classified = classifyProcessingError(err);
      setEditorStatus({
        stage: 'Failed',
        progress: null,
        detail: classified.message,
        error: classified.message,
        fallbackAvailable: classified.suggestFallback && !useFallback,
      });
    } finally {
      setBusyMode('none');
    }
  };

  const handleUpdateSegment = (segId: string, patch: Partial<CaptionSegment>) => {
    const next = resolved.captions.map((seg) => {
      if (seg.id !== segId) return seg;
      const merged = { ...seg, ...patch };
      if (patch.text !== undefined) {
        merged.words = buildWordsForSegment(patch.text, merged.start, merged.end);
      }
      return merged;
    });
    updateEditor({
      captions: next,
      captionText: next[0]?.text || resolved.captionText,
    });
  };

  const handleDeleteSegment = (segId: string) => {
    const next = resolved.captions.filter((s) => s.id !== segId);
    updateEditor({
      captions: next,
      captionText: next[0]?.text || resolved.captionText,
    });
  };

  const handleAddSegment = () => {
    const lastEnd =
      resolved.captions.length > 0 ? resolved.captions[resolved.captions.length - 1].end : 0;
    const start = Math.min(Math.max(0, lastEnd), Math.max(0, clipDuration - 1));
    const end = Math.min(clipDuration, start + 2.5);
    const text = 'New caption line.';
    const newSeg: CaptionSegment = {
      id: `cap-${Date.now()}`,
      start: Math.round(start * 10) / 10,
      end: Math.round(end * 10) / 10,
      text,
      words: buildWordsForSegment(text, start, end),
    };
    updateEditor({ captions: [...resolved.captions, newSeg] });
  };

  const updateReactionEffect = (id: string, patch: Partial<ReactionEffectItem>) => {
    updateEditor({
      reactionEffects: resolved.reactionEffects.map((fx) =>
        fx.id === id ? { ...fx, ...patch } : fx
      ),
    });
  };

  const removeReactionEffect = (id: string) => {
    updateEditor({
      reactionEffects: resolved.reactionEffects.filter((fx) => fx.id !== id),
    });
    if (editingEffectId === id) setEditingEffectId(null);
  };

  const handlePreviewReaction = (fx: ReactionEffectItem) => {
    setPreviewReactionId(fx.id);
    const mid = Math.min(clipDuration, fx.startTime + (fx.endTime - fx.startTime) * 0.35);
    setProgress(Math.max(0, Math.min(1, mid / clipDuration)));
    if (fx.soundEffect && fx.soundEffect !== 'none') {
      previewSoundEffect(fx.soundEffect, resolved.sfxVolume);
    }
  };

  const handleAddManualReaction = () => {
    const meta = REACTION_EFFECT_META[newEffectType];
    const start =
      Math.round(Math.min(Math.max(0, progress * clipDuration), Math.max(0, clipDuration - 0.6)) * 10) /
      10;
    const end = Math.round(Math.min(clipDuration, start + meta.defaultDuration) * 10) / 10;
    const item: ReactionEffectItem = {
      id: `rx-manual-${Date.now()}`,
      type: newEffectType,
      startTime: start,
      endTime: Math.max(start + 0.4, end),
      reason: 'Manually added by creator',
      status: 'accepted',
      intensity: meta.defaultIntensity,
      text: newEffectType === 'meme-text' ? 'WAIT FOR IT...' : undefined,
      emoji: newEffectType === 'emoji-overlay' ? '😂' : undefined,
      soundEffect: newEffectType === 'sound-effect' ? 'vine-boom' : undefined,
      source: 'manual',
    };
    updateEditor({
      reactionEffects: [...resolved.reactionEffects, item].sort((a, b) => a.startTime - b.startTime),
    });
    setEditingEffectId(item.id);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      {/* TOP TOOLBAR: Project Name, Undo, Redo, Preview, Save, Export (Red Primary) */}
      <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="editor-clip-title" className="sr-only">
            Project or clip title
          </label>
          <input
            id="editor-clip-title"
            type="text"
            value={draft.title}
            onChange={(e) => {
              const val = e.target.value;
              commitDraftChange((prev) => ({ ...prev, title: val }));
            }}
            className="w-full max-w-md bg-transparent font-display text-base sm:text-lg font-bold text-[#171717] border-b border-transparent hover:border-[#E5E5E5] focus:border-[#DC2626] focus:outline-none pb-0.5 truncate"
          />
          <p className="text-xs text-[#737373] font-mono tabular-nums mt-0.5">
            {formatTimecode(draft.startTime)} – {formatTimecode(draft.endTime)} (
            {formatDurationLabel(clipDuration)}) · {resolved.aspectRatio} ·{' '}
            {TEMPLATE_BY_ID[resolved.templateId].name}
            {acceptedEffectsCount > 0 ? ` · ${acceptedEffectsCount} FX` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] p-0.5">
            <button
              type="button"
              disabled={isBusy || past.length === 0}
              onClick={handleUndo}
              aria-label="Undo edit"
              data-testid="editor-undo-btn"
              title="Undo (Ctrl+Z)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#171717] hover:bg-[#FFFFFF] disabled:opacity-40 transition-colors"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              type="button"
              disabled={isBusy || future.length === 0}
              onClick={handleRedo}
              aria-label="Redo edit"
              data-testid="editor-redo-btn"
              title="Redo (Ctrl+Shift+Z)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#171717] hover:bg-[#FFFFFF] disabled:opacity-40 transition-colors"
            >
              <Redo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => setIsPlaying((p) => !p)}
            data-testid="editor-preview-toggle-btn"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] transition-colors whitespace-nowrap"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5 text-[#DC2626]" />
            ) : (
              <Play className="h-3.5 w-3.5 text-[#DC2626]" />
            )}
            <span>{isPlaying ? 'Pause' : 'Preview'}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleResetEdits}
            aria-label="Reset unsaved edits"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#525252] hover:text-[#171717] transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {savedNotice ? (
              <Check className="h-3.5 w-3.5 text-[#16A34A]" />
            ) : (
              <Save className="h-3.5 w-3.5 text-[#737373]" />
            )}
            <span>{savedNotice ? 'Saved' : 'Save'}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleExport(false)}
            data-testid="export-mp4-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs"
          >
            {busyMode === 'export' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>
              {busyMode === 'export'
                ? `${editorStatus.stage}...`
                : hasRealSourceVideo
                  ? 'Export MP4'
                  : 'Export'}
            </span>
          </button>
        </div>
      </div>

      {/* Real Rendering / Caption / Export Lifecycle Status */}
      <ProcessingStatusBanner
        status={editorStatus}
        onCancel={isBusy ? handleCancel : undefined}
        onRunFallback={
          editorStatus.fallbackAvailable
            ? () =>
                lastActionForFallback === 'recut'
                  ? void handleRecutPreview(true)
                  : void handleExport(true)
            : undefined
        }
        onDismiss={() => setEditorStatus({ stage: 'idle', progress: null, detail: '' })}
      />

      {/* THREE-COLUMN LIGHT-THEME STUDIO WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT SIDEBAR: Media, Captions, Text, Effects, Audio, Crop */}
        <aside
          aria-label="Editing tools"
          className="order-2 lg:order-1 lg:col-span-2 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] p-3 space-y-4"
        >
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-1 gap-1">
            {TOOL_TABS.map((tool) => {
              const Icon = tool.icon;
              const active = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  data-testid={`editor-tool-${tool.id}`}
                  onClick={() => setActiveTool(tool.id)}
                  className={`flex items-center justify-center lg:justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#FEF2F2] text-[#DC2626] font-semibold border border-[#FECACA]'
                      : 'text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#DC2626]' : 'text-[#737373]'}`} />
                    <span>{tool.label}</span>
                  </span>
                  {tool.id === 'effects' && resolved.reactionEffects.length > 0 && (
                    <span className="hidden lg:inline font-mono text-[10px] text-[#DC2626]">
                      {acceptedEffectsCount}/{resolved.reactionEffects.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Clip Switcher inside left rail on desktop */}
          <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
            <label htmlFor="editor-clip-select" className="block text-[11px] font-semibold text-[#737373] uppercase tracking-wider px-1">
              Clips ({clips.length})
            </label>
            <select
              id="editor-clip-select"
              value={draft.id}
              onChange={(e) => onSelectClip(e.target.value)}
              className="lg:hidden w-full rounded-lg bg-[#FAFAFA] border border-[#E5E5E5] px-2.5 py-2 text-xs text-[#171717] focus:outline-none focus:border-[#DC2626]"
            >
              {clips.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <div className="hidden lg:block space-y-1 max-h-56 overflow-y-auto pr-0.5">
              {clips.map((c) => {
                const selected = c.id === draft.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectClip(c.id)}
                    className={`w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors border ${
                      selected
                        ? 'bg-[#FEF2F2] border-[#FECACA]'
                        : 'bg-transparent border-transparent hover:bg-[#F5F5F5]'
                    }`}
                  >
                    {c.thumbnailUrl ? (
                      <img
                        src={c.thumbnailUrl}
                        alt=""
                        className="h-9 w-7 rounded object-cover shrink-0 bg-[#171717]"
                      />
                    ) : (
                      <div className="h-9 w-7 rounded shrink-0 bg-[#E5E5E5]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#171717] truncate">{c.title}</p>
                      <p className="text-[10px] font-mono tabular-nums text-[#737373]">
                        {formatTimecode(c.startTime)}–{formatTimecode(c.endTime)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* CENTER WORKSPACE: Light Grey (#F5F5F5) Canvas + Crisp White Preview Panel + Aspect Ratio Selector */}
        <section
          aria-label="Video preview canvas"
          className="order-1 lg:order-2 lg:col-span-6 rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] p-3 sm:p-4 flex flex-col items-center gap-3"
        >
          {/* Preview Header Bar with Aspect Ratio Selector */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#737373]">
              {draft.isRealProcessedClip ? 'Trimmed MP4 Preview' : 'Live Studio Preview'} ·{' '}
              <span className="text-[#171717]">
                {VIDEO_CROP_MODES.find((m) => m.value === resolved.cropMode)?.label}
              </span>
            </span>

            <div
              role="group"
              aria-label="Aspect ratio selector"
              className="inline-flex items-center gap-0.5 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] p-0.5"
            >
              {ASPECT_RATIOS.map((ratio) => {
                const active = resolved.aspectRatio === ratio.value;
                return (
                  <button
                    key={ratio.value}
                    type="button"
                    data-testid={`aspect-ratio-${ratio.value}`}
                    onClick={() => updateEditor({ aspectRatio: ratio.value as AspectRatio })}
                    className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-[#FEF2F2] text-[#DC2626]'
                        : 'text-[#737373] hover:text-[#171717]'
                    }`}
                  >
                    {ratio.value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* White Framing Card around Actual Video Content */}
          <div className="w-full rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] p-3 sm:p-4 flex justify-center items-center shadow-2xs">
            <div
              className={`w-full flex justify-center items-center ${
                resolved.aspectRatio === '9:16'
                  ? 'max-w-[205px] sm:max-w-[225px]'
                  : resolved.aspectRatio === '1:1'
                    ? 'max-w-[310px]'
                    : 'max-w-full'
              }`}
            >
              <ClipPlayer
                clip={draft}
                externalPlaying={isPlaying}
                onPlayingChange={setIsPlaying}
                externalProgress={progress}
                onProgressChange={setProgress}
                previewReactionId={previewReactionId}
              />
            </div>
          </div>

          {/* Caption / SFX Summary Strip */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-[#737373] px-1">
            <span>
              Captions:{' '}
              <strong className="font-medium text-[#171717]">
                {resolved.captions.length > 0
                  ? `${resolved.captions.length} synced (${resolved.captionsTimingMode})`
                  : 'Manual line'}
              </strong>
            </span>
            <span>
              Audio Cue:{' '}
              <strong className="font-medium text-[#171717]">
                {SOUND_EFFECTS.find((s) => s.id === resolved.soundEffect)?.name}
              </strong>
            </span>
          </div>
        </section>

        {/* RIGHT PANEL: Clean White Properties Inspector */}
        <section
          aria-label="Properties panel"
          className="order-3 lg:order-3 lg:col-span-4 rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 space-y-5 max-h-[700px] overflow-y-auto"
        >
          {(draft.aiHook || draft.aiReason) && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 space-y-1 text-xs">
              <p className="font-semibold text-[#DC2626] text-[11px] uppercase tracking-wider">
                Gemini AI Clip Insight
              </p>
              {draft.aiHook && (
                <p className="text-[#171717] leading-snug">
                  <span className="text-[#737373]">Hook:</span> {draft.aiHook}
                </p>
              )}
              {draft.aiReason && (
                <p className="text-[#525252] leading-relaxed">{draft.aiReason}</p>
              )}
            </div>
          )}

          {/* 1. MEDIA & TRIM PANEL */}
          {activeTool === 'media' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Media &amp; Trim Bounds
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Adjust exact start time, end time, or clip duration and re-cut the real MP4
                  segment.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label htmlFor="editor-trim-start-num" className="block text-[11px] text-[#737373]">
                    Start (s)
                  </label>
                  <input
                    id="editor-trim-start-num"
                    type="number"
                    min={0}
                    max={Math.max(0, draft.sourceDuration - 1)}
                    step={0.5}
                    value={draft.startTime}
                    onChange={(e) => handleTrimChange(Number(e.target.value), draft.endTime)}
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="editor-trim-end-num" className="block text-[11px] text-[#737373]">
                    End (s)
                  </label>
                  <input
                    id="editor-trim-end-num"
                    type="number"
                    min={1}
                    max={draft.sourceDuration}
                    step={0.5}
                    value={draft.endTime}
                    onChange={(e) => handleTrimChange(draft.startTime, Number(e.target.value))}
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="editor-trim-dur-num" className="block text-[11px] text-[#737373]">
                    Duration (s)
                  </label>
                  <input
                    id="editor-trim-dur-num"
                    type="number"
                    min={1}
                    max={draft.sourceDuration}
                    step={0.5}
                    value={clipDuration}
                    onChange={(e) =>
                      handleTrimChange(draft.startTime, draft.startTime + Number(e.target.value))
                    }
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="trim-start-range" className="text-[#737373]">
                    Start Time Slider
                  </label>
                  <span className="font-mono tabular-nums text-[#171717] font-medium">
                    {formatTimecode(draft.startTime)}
                  </span>
                </div>
                <input
                  id="trim-start-range"
                  type="range"
                  min={0}
                  max={Math.max(0, Math.floor(draft.sourceDuration - 2))}
                  step={0.5}
                  value={draft.startTime}
                  onChange={(e) => handleTrimChange(Number(e.target.value), draft.endTime)}
                  className="cf-range w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="trim-end-range" className="text-[#737373]">
                    End Time Slider
                  </label>
                  <span className="font-mono tabular-nums text-[#171717] font-medium">
                    {formatTimecode(draft.endTime)}
                  </span>
                </div>
                <input
                  id="trim-end-range"
                  type="range"
                  min={Math.min(draft.sourceDuration, draft.startTime + 2)}
                  max={draft.sourceDuration}
                  step={0.5}
                  value={draft.endTime}
                  onChange={(e) => handleTrimChange(draft.startTime, Number(e.target.value))}
                  className="cf-range w-full"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] space-y-3">
                <p className="text-xs font-medium text-[#737373]">Quick Duration Snap</p>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 15, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => handleTrimChange(draft.startTime, draft.startTime + sec)}
                      className="py-1.5 rounded-lg bg-[#FAFAFA] hover:bg-[#FEF2F2] hover:text-[#DC2626] border border-[#E5E5E5] text-xs font-mono tabular-nums text-[#171717] transition-colors"
                    >
                      {sec}s
                    </button>
                  ))}
                </div>

                {hasRealSourceVideo && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleRecutPreview(false)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                  >
                    {busyMode === 'recut' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Scissors className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {busyMode === 'recut' ? 'Re-cutting MP4...' : 'Apply Trim & Re-cut MP4'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. CAPTIONS & 10 TEMPLATES PANEL */}
          {activeTool === 'captions' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Automatic Captions
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Transcribe English, Hindi, or Hinglish captions from speech and switch across all
                  10 caption templates.
                </p>
              </div>

              <div className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="caption-language-select" className="text-xs font-medium text-[#525252]">
                    Caption Language
                  </label>
                  <select
                    id="caption-language-select"
                    value={resolved.captionLanguage}
                    onChange={(e) => {
                      const nextLang = e.target.value as CaptionLanguageMode;
                      updateEditor({
                        captionLanguage: nextLang,
                        fontFamily:
                          nextLang === 'hindi' ? 'Noto Sans Devanagari' : resolved.fontFamily,
                      });
                    }}
                    className="rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-1 text-xs text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  >
                    {CAPTION_LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between text-xs text-[#525252] cursor-pointer">
                  <span>Show speaker labels</span>
                  <input
                    type="checkbox"
                    checked={resolved.showSpeakerLabels}
                    onChange={(e) => updateEditor({ showSpeakerLabels: e.target.checked })}
                    className="h-4 w-4 rounded accent-[#DC2626]"
                  />
                </label>

                <button
                  type="button"
                  disabled={isBusy || !hasRealSourceVideo}
                  onClick={() => void handleGenerateCaptions(false)}
                  data-testid="generate-auto-captions-btn"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                >
                  {busyMode === 'captions' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {busyMode === 'captions'
                      ? 'Transcribing Synced Captions...'
                      : 'Generate Auto Captions (Gemini AI)'}
                  </span>
                </button>
              </div>

              {/* 10 Caption Templates */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#171717]">Caption Template (10 Styles)</p>
                <div className="grid grid-cols-2 gap-1.5" data-testid="editor-template-grid">
                  {CAPTION_TEMPLATES.map((tpl) => {
                    const active = resolved.templateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        data-testid={`editor-tpl-${tpl.id}`}
                        onClick={() => handleApplyTemplatePreset(tpl.id)}
                        className={`px-2.5 py-2 rounded-lg text-left text-xs font-medium transition-colors whitespace-nowrap truncate border ${
                          active
                            ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626] font-semibold'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:bg-[#FAFAFA] hover:text-[#171717]'
                        }`}
                      >
                        {tpl.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Synced Caption Segments OR Manual Copy */}
              {resolved.captions.length > 0 ? (
                <div className="space-y-2.5 pt-3 border-t border-[#E5E5E5]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#171717]">
                      Synced Captions ({resolved.captions.length})
                      <span className="ml-1.5 text-[10px] font-mono text-[#DC2626]">
                        {resolved.captionsTimingMode}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={handleAddSegment}
                      className="inline-flex items-center gap-1 text-[11px] text-[#DC2626] hover:text-[#B91C1C] font-semibold"
                    >
                      <Plus className="h-3 w-3" />
                      Add Line
                    </button>
                  </div>

                  <div
                    className="space-y-2 max-h-56 overflow-y-auto pr-1"
                    data-testid="caption-segments-list"
                  >
                    {resolved.captions.map((seg) => (
                      <div
                        key={seg.id}
                        className="rounded-lg bg-[#FAFAFA] border border-[#E5E5E5] p-2.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#737373]">
                          <button
                            type="button"
                            onClick={() => setProgress(Math.min(1, seg.start / clipDuration))}
                            className="hover:text-[#DC2626] underline-offset-2 hover:underline"
                          >
                            {seg.start.toFixed(1)}s – {seg.end.toFixed(1)}s
                          </button>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={seg.speaker || ''}
                              onChange={(e) =>
                                handleUpdateSegment(seg.id, {
                                  speaker: e.target.value || undefined,
                                })
                              }
                              placeholder="Speaker"
                              aria-label={`Speaker label for ${seg.start.toFixed(1)}s`}
                              className="w-20 bg-[#FFFFFF] border border-[#E5E5E5] rounded px-1.5 py-0.5 text-[10px] text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteSegment(seg.id)}
                              aria-label="Delete caption line"
                              className="text-[#737373] hover:text-[#DC2626]"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={2}
                          value={seg.text}
                          onChange={(e) => {
                            const updated = updateCaptionSegmentText(
                              resolved.captions,
                              seg.id,
                              e.target.value
                            );
                            updateEditor({
                              captions: updated,
                              captionText: updated[0]?.text || resolved.captionText,
                            });
                          }}
                          className="w-full rounded bg-[#FFFFFF] border border-[#E5E5E5] px-2 py-1.5 text-xs text-[#171717] focus:outline-none focus:border-[#DC2626] resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 pt-3 border-t border-[#E5E5E5]">
                  <label htmlFor="caption-text-editor" className="text-xs font-semibold text-[#171717]">
                    Caption Copy (Manual / Opening Line)
                  </label>
                  <textarea
                    id="caption-text-editor"
                    rows={3}
                    value={resolved.captionText}
                    onChange={(e) => updateEditor({ captionText: e.target.value })}
                    placeholder="Type your clip caption or click Generate Auto Captions..."
                    className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3 py-2.5 text-sm text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626] resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* 3. TEXT & STYLE CUSTOMIZATION PANEL */}
          {activeTool === 'text' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Text &amp; Caption Style
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Caption typography and colors stay independently customizable for every video.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="caption-font-select" className="text-xs font-medium text-[#525252]">
                  Font Family
                </label>
                <select
                  id="caption-font-select"
                  value={resolved.fontFamily}
                  onChange={(e) => updateEditor({ fontFamily: e.target.value as CaptionFontFamily })}
                  className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3 py-2 text-xs text-[#171717] focus:outline-none focus:border-[#DC2626]"
                >
                  {CAPTION_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label} — {f.note}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="font-size-range" className="text-[#525252]">
                    Font Size
                  </label>
                  <span className="font-mono tabular-nums text-[#171717] font-medium">
                    {resolved.fontSize}px
                  </span>
                </div>
                <input
                  id="font-size-range"
                  type="range"
                  min={14}
                  max={40}
                  step={1}
                  value={resolved.fontSize}
                  onChange={(e) => updateEditor({ fontSize: Number(e.target.value) })}
                  className="cf-range w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#525252]">Alignment</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'left', icon: AlignLeft },
                        { id: 'center', icon: AlignCenter },
                        { id: 'right', icon: AlignRight },
                      ] as Array<{ id: CaptionAlignment; icon: typeof AlignLeft }>
                    ).map((a) => {
                      const Icon = a.icon;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          aria-label={`Align captions ${a.id}`}
                          onClick={() => updateEditor({ alignment: a.id })}
                          className={`flex items-center justify-center py-1.5 rounded-lg border transition-colors ${
                            resolved.alignment === a.id
                              ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                              : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#737373] hover:text-[#171717]'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#525252]">Animation Speed</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(['slow', 'normal', 'fast'] as CaptionAnimationSpeed[]).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => updateEditor({ animationSpeed: spd })}
                        className={`py-1.5 rounded-lg text-[11px] font-medium capitalize border transition-colors ${
                          resolved.animationSpeed === spd
                            ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#737373] hover:text-[#171717]'
                        }`}
                      >
                        {spd}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-[#525252]">Position</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['top', 'center', 'bottom'] as TextPosition[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => updateEditor({ textPosition: pos, verticalOffset: 0 })}
                      className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${
                        resolved.textPosition === pos
                          ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                          : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:text-[#171717]'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <label htmlFor="offset-y-range" className="text-[#525252]">
                    Fine Vertical Offset
                  </label>
                  <span className="font-mono tabular-nums text-[#171717]">
                    {resolved.verticalOffset > 0 ? `+${resolved.verticalOffset}` : resolved.verticalOffset}
                  </span>
                </div>
                <input
                  id="offset-y-range"
                  type="range"
                  min={-15}
                  max={15}
                  step={1}
                  value={resolved.verticalOffset}
                  onChange={(e) => updateEditor({ verticalOffset: Number(e.target.value) })}
                  className="cf-range w-full"
                />
              </div>

              {/* Font Color */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="font-color-input" className="text-[#525252]">
                    Font Color
                  </label>
                  <span className="font-mono text-[#171717] uppercase">{resolved.fontColor}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={`font-${hex}`}
                      type="button"
                      aria-label={`Set font color ${hex}`}
                      onClick={() => updateEditor({ fontColor: hex })}
                      className={`h-6 w-6 rounded-md border transition-transform ${
                        resolved.fontColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-[#DC2626] scale-110 ring-2 ring-[#DC2626]/30'
                          : 'border-[#D4D4D4] hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input
                    id="font-color-input"
                    type="color"
                    value={resolved.fontColor}
                    onChange={(e) => updateEditor({ fontColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded bg-transparent border border-[#E5E5E5]"
                  />
                </div>
              </div>

              {/* Highlight Color */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="highlight-color-input" className="text-[#525252]">
                    Highlight Color
                  </label>
                  <span className="font-mono text-[#171717] uppercase">{resolved.highlightColor}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={`hi-${hex}`}
                      type="button"
                      aria-label={`Set highlight color ${hex}`}
                      onClick={() => updateEditor({ highlightColor: hex })}
                      className={`h-6 w-6 rounded-md border transition-transform ${
                        resolved.highlightColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-[#DC2626] scale-110 ring-2 ring-[#DC2626]/30'
                          : 'border-[#D4D4D4] hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input
                    id="highlight-color-input"
                    type="color"
                    value={resolved.highlightColor}
                    onChange={(e) => updateEditor({ highlightColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded bg-transparent border border-[#E5E5E5]"
                  />
                </div>
              </div>

              {/* Background Box */}
              <div className="space-y-2 pt-2 border-t border-[#E5E5E5]">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="bg-color-input" className="text-[#525252]">
                    Background Box ({resolved.backgroundOpacity}%)
                  </label>
                  <input
                    id="bg-color-input"
                    type="color"
                    value={resolved.backgroundColor}
                    onChange={(e) => updateEditor({ backgroundColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded bg-transparent border border-[#E5E5E5]"
                  />
                </div>
                <input
                  type="range"
                  aria-label="Caption background opacity"
                  min={0}
                  max={100}
                  step={5}
                  value={resolved.backgroundOpacity}
                  onChange={(e) => updateEditor({ backgroundOpacity: Number(e.target.value) })}
                  className="cf-range w-full"
                />
              </div>

              {/* Outline & Shadow */}
              <div className="space-y-2 pt-2 border-t border-[#E5E5E5]">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="outline-width-range" className="text-[#525252]">
                    Text Outline ({resolved.outlineWidth}px)
                  </label>
                  <input
                    type="color"
                    aria-label="Caption outline color"
                    value={resolved.outlineColor}
                    onChange={(e) => updateEditor({ outlineColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded bg-transparent border border-[#E5E5E5]"
                  />
                </div>
                <input
                  id="outline-width-range"
                  type="range"
                  min={0}
                  max={6}
                  step={1}
                  value={resolved.outlineWidth}
                  onChange={(e) => updateEditor({ outlineWidth: Number(e.target.value) })}
                  className="cf-range w-full"
                />

                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium text-[#525252]">Text Shadow</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['none', 'soft', 'strong'] as CaptionShadowStyle[]).map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => updateEditor({ shadowStyle: sh })}
                        className={`py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors ${
                          resolved.shadowStyle === sh
                            ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#525252] hover:text-[#171717]'
                        }`}
                      >
                        {sh}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. FUNNY REACTION EFFECTS PANEL */}
          {activeTool === 'effects' && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Funny Reaction Effects
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Optional comedic editing engine. Preview, accept, reject, or customize each
                  reaction cue.
                </p>
              </div>

              <button
                type="button"
                disabled={isBusy || !hasRealSourceVideo}
                onClick={() => void handleGenerateCaptions(true)}
                data-testid="suggest-reactions-btn"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                {busyMode === 'reactions' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>
                  {busyMode === 'reactions'
                    ? 'Analyzing Comedic Beats...'
                    : 'Suggest Funny Reactions (Gemini AI)'}
                </span>
              </button>

              {reactionNote && (
                <div className="rounded-lg bg-[#FAFAFA] border border-[#E5E5E5] px-3 py-2 text-[11px] text-[#525252]">
                  {reactionNote}
                </div>
              )}

              <div className="space-y-2.5" data-testid="reaction-effects-list">
                {resolved.reactionEffects.length === 0 ? (
                  <div className="rounded-xl bg-[#FAFAFA] border border-dashed border-[#E5E5E5] p-4 text-center text-xs text-[#737373]">
                    No reaction effects yet. Click Suggest Funny Reactions or add a manual effect
                    below.
                  </div>
                ) : (
                  resolved.reactionEffects.map((fx) => {
                    const meta = REACTION_EFFECT_META[fx.type];
                    const isEditing = editingEffectId === fx.id;
                    return (
                      <div
                        key={fx.id}
                        data-testid={`reaction-card-${fx.type}`}
                        className={`rounded-xl border p-3 space-y-2 transition-colors ${
                          fx.status === 'accepted'
                            ? 'bg-[#FEF2F2] border-[#FECACA]'
                            : fx.status === 'rejected'
                              ? 'bg-[#FAFAFA] border-[#E5E5E5] opacity-60'
                              : 'bg-[#FFFFFF] border-[#E5E5E5]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-[#171717]">
                                {meta.label}
                              </span>
                              <span className="font-mono text-[10px] text-[#737373]">
                                {fx.startTime.toFixed(1)}s–{fx.endTime.toFixed(1)}s
                              </span>
                              <span
                                className={`text-[10px] font-semibold capitalize ${
                                  fx.status === 'accepted'
                                    ? 'text-[#16A34A]'
                                    : fx.status === 'rejected'
                                      ? 'text-[#737373]'
                                      : 'text-[#DC2626]'
                                }`}
                              >
                                · {fx.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#737373] mt-1 leading-relaxed">
                              {fx.reason}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeReactionEffect(fx.id)}
                            aria-label={`Remove ${meta.label}`}
                            className="text-[#737373] hover:text-[#DC2626] shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handlePreviewReaction(fx)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[11px] font-medium text-[#171717]"
                          >
                            <Eye className="h-3 w-3 text-[#DC2626]" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => updateReactionEffect(fx.id, { status: 'accepted' })}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
                              fx.status === 'accepted'
                                ? 'bg-[#16A34A] border-[#16A34A] text-white'
                                : 'bg-[#FFFFFF] hover:bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]'
                            }`}
                          >
                            <Check className="h-3 w-3" />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => updateReactionEffect(fx.id, { status: 'rejected' })}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
                              fx.status === 'rejected'
                                ? 'bg-[#171717] border-[#171717] text-white'
                                : 'bg-[#FFFFFF] hover:bg-[#FEF2F2] text-[#737373] border-[#E5E5E5]'
                            }`}
                          >
                            <X className="h-3 w-3" />
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingEffectId(isEditing ? null : fx.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#FFFFFF] hover:bg-[#F5F5F5] text-[11px] text-[#525252] border border-[#E5E5E5]"
                          >
                            <Sliders className="h-3 w-3" />
                            {isEditing ? 'Done' : 'Customize'}
                          </button>
                        </div>

                        {isEditing && (
                          <div className="pt-2 mt-1 border-t border-[#E5E5E5] space-y-2.5 text-xs">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] text-[#737373] mb-0.5">
                                  Start (s)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, clipDuration - 0.3)}
                                  step={0.1}
                                  value={fx.startTime}
                                  onChange={(e) => {
                                    const s = Math.max(
                                      0,
                                      Math.min(clipDuration - 0.3, Number(e.target.value) || 0)
                                    );
                                    updateReactionEffect(fx.id, {
                                      startTime: s,
                                      endTime: Math.max(s + 0.3, fx.endTime),
                                    });
                                  }}
                                  className="w-full rounded bg-[#FFFFFF] border border-[#E5E5E5] px-2 py-1 font-mono text-xs text-[#171717]"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-[#737373] mb-0.5">
                                  End (s)
                                </label>
                                <input
                                  type="number"
                                  min={0.3}
                                  max={clipDuration}
                                  step={0.1}
                                  value={fx.endTime}
                                  onChange={(e) => {
                                    const en = Math.max(
                                      fx.startTime + 0.3,
                                      Math.min(clipDuration, Number(e.target.value) || fx.endTime)
                                    );
                                    updateReactionEffect(fx.id, { endTime: en });
                                  }}
                                  className="w-full rounded bg-[#FFFFFF] border border-[#E5E5E5] px-2 py-1 font-mono text-xs text-[#171717]"
                                />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-[10px] text-[#737373] mb-0.5">
                                <span>Intensity</span>
                                <span className="font-mono text-[#171717]">{fx.intensity ?? 70}%</span>
                              </div>
                              <input
                                type="range"
                                min={20}
                                max={100}
                                step={5}
                                value={fx.intensity ?? 70}
                                onChange={(e) =>
                                  updateReactionEffect(fx.id, { intensity: Number(e.target.value) })
                                }
                                className="cf-range w-full"
                              />
                            </div>

                            {fx.type === 'meme-text' && (
                              <div>
                                <label className="block text-[10px] text-[#737373] mb-0.5">
                                  Meme Callout Text
                                </label>
                                <input
                                  type="text"
                                  value={fx.text || ''}
                                  onChange={(e) => updateReactionEffect(fx.id, { text: e.target.value })}
                                  className="w-full rounded bg-[#FFFFFF] border border-[#E5E5E5] px-2 py-1 text-xs text-[#171717]"
                                />
                              </div>
                            )}

                            {fx.type === 'emoji-overlay' && (
                              <div className="space-y-1">
                                <span className="block text-[10px] text-[#737373]">Reaction Emoji</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {REACTION_EMOJI_PRESETS.map((em) => (
                                    <button
                                      key={em}
                                      type="button"
                                      onClick={() => updateReactionEffect(fx.id, { emoji: em })}
                                      className={`h-7 w-7 rounded border text-sm flex items-center justify-center ${
                                        fx.emoji === em
                                          ? 'bg-[#FEF2F2] border-[#DC2626]'
                                          : 'bg-[#FFFFFF] border-[#E5E5E5]'
                                      }`}
                                    >
                                      {em}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {fx.type === 'sound-effect' && (
                              <div>
                                <label className="block text-[10px] text-[#737373] mb-0.5">
                                  Licensed Sound Effect
                                </label>
                                <select
                                  value={fx.soundEffect || 'vine-boom'}
                                  onChange={(e) => {
                                    const sfxId = e.target.value as SoundEffectId;
                                    updateReactionEffect(fx.id, { soundEffect: sfxId });
                                    previewSoundEffect(sfxId, resolved.sfxVolume);
                                  }}
                                  className="w-full rounded bg-[#FFFFFF] border border-[#E5E5E5] px-2 py-1 text-xs text-[#171717]"
                                >
                                  {SOUND_EFFECTS.filter((s) => s.id !== 'none').map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] space-y-2">
                <p className="text-xs font-semibold text-[#171717]">Add Manual Reaction Effect</p>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Select manual reaction effect type"
                    value={newEffectType}
                    onChange={(e) => setNewEffectType(e.target.value as ReactionEffectType)}
                    className="flex-1 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-2.5 py-2 text-xs text-[#171717] focus:outline-none focus:border-[#DC2626]"
                  >
                    {(Object.keys(REACTION_EFFECT_META) as ReactionEffectType[]).map((key) => (
                      <option key={key} value={key}>
                        {REACTION_EFFECT_META[key].label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddManualReaction}
                    data-testid="add-manual-reaction-btn"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#FEF2F2] border border-[#E5E5E5] hover:border-[#DC2626] text-xs font-semibold text-[#171717] hover:text-[#DC2626] whitespace-nowrap transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. AUDIO & SOUND EFFECTS PANEL */}
          {activeTool === 'audio' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Audio &amp; Sound Effects
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Attach a licensed royalty-free intro cue and mix it cleanly into the exported MP4
                  audio.
                </p>
              </div>

              <div className="space-y-2">
                {SOUND_EFFECTS.map((sfx) => {
                  const active = resolved.soundEffect === sfx.id;
                  return (
                    <div
                      key={sfx.id}
                      className={`flex items-center justify-between gap-2 rounded-xl p-2.5 border transition-colors ${
                        active
                          ? 'bg-[#FEF2F2] border-[#DC2626]'
                          : 'bg-[#FFFFFF] border-[#E5E5E5] hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => updateEditor({ soundEffect: sfx.id as SoundEffectId })}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-xs font-semibold text-[#171717]">{sfx.name}</p>
                        <p className="text-[11px] text-[#737373] truncate">{sfx.cue}</p>
                      </button>

                      {sfx.id !== 'none' && (
                        <button
                          type="button"
                          onClick={() => {
                            updateEditor({ soundEffect: sfx.id as SoundEffectId });
                            previewSoundEffect(sfx.id as SoundEffectId, resolved.sfxVolume);
                          }}
                          aria-label={`Audition ${sfx.name}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFFFFF] hover:bg-[#DC2626] border border-[#E5E5E5] hover:border-[#DC2626] text-[#171717] hover:text-white transition-colors"
                        >
                          <Play className="h-3.5 w-3.5 ml-0.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-2 border-t border-[#E5E5E5]">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="sfx-volume-range" className="text-[#525252]">
                    SFX Cue Volume
                  </label>
                  <span className="font-mono tabular-nums text-[#171717] font-medium">
                    {resolved.sfxVolume}%
                  </span>
                </div>
                <input
                  id="sfx-volume-range"
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={resolved.sfxVolume}
                  onChange={(e) => updateEditor({ sfxVolume: Number(e.target.value) })}
                  className="cf-range w-full"
                />
              </div>
            </div>
          )}

          {/* 6. CROP & FRAMING PANEL */}
          {activeTool === 'crop' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-base font-semibold text-[#171717]">
                  Crop &amp; Framing
                </h2>
                <p className="text-xs text-[#737373] mt-0.5">
                  Choose smart framing, background blur, face-centered tracking, or manual zoom &amp;
                  pan.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#171717]">Framing Mode</p>
                <div className="space-y-1.5">
                  {VIDEO_CROP_MODES.map((mode) => {
                    const active = resolved.cropMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        data-testid={`crop-mode-${mode.value}`}
                        onClick={() => updateEditor({ cropMode: mode.value as VideoCropMode })}
                        className={`w-full p-2.5 rounded-xl border text-left transition-colors ${
                          active
                            ? 'bg-[#FEF2F2] border-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] hover:bg-[#FAFAFA]'
                        }`}
                      >
                        <p className="text-xs font-semibold text-[#171717]">{mode.label}</p>
                        <p className="text-[11px] text-[#737373] mt-0.5">{mode.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {resolved.cropMode === 'face-centered' && (
                <div className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#737373]">Face Anchor</span>
                    <span className="font-mono text-[#171717] font-medium">
                      X {Math.round(resolved.faceAnchorX * 100)}% · Y{' '}
                      {Math.round(resolved.faceAnchorY * 100)}%
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleDetectFace()}
                    data-testid="detect-face-btn"
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                  >
                    {busyMode === 'face' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ScanFace className="h-3.5 w-3.5" />
                    )}
                    <span>{busyMode === 'face' ? 'Scanning Frame...' : 'Detect Face Center'}</span>
                  </button>
                  {resolved.faceDetectionSource !== 'none' && (
                    <p className="text-[11px] text-[#737373]">
                      Source:{' '}
                      <span className="text-[#171717] font-medium">
                        {resolved.faceDetectionSource === 'browser-face-detector'
                          ? 'Browser FaceDetector API'
                          : 'Canvas Saliency Detector'}
                      </span>
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-[#E5E5E5]">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="zoom-range" className="flex items-center gap-1.5 text-[#525252]">
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Zoom Scale</span>
                    </label>
                    <span className="font-mono tabular-nums text-[#171717] font-medium">
                      {resolved.zoom}%
                    </span>
                  </div>
                  <input
                    id="zoom-range"
                    type="range"
                    min={100}
                    max={180}
                    step={2}
                    value={resolved.zoom}
                    onChange={(e) =>
                      updateEditor({
                        zoom: Number(e.target.value),
                        cropMode:
                          resolved.cropMode === 'background-blur' ? 'background-blur' : 'manual',
                      })
                    }
                    className="cf-range w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="crop-x-range" className="text-[#525252]">
                      Horizontal Crop Pan (X)
                    </label>
                    <span className="font-mono tabular-nums text-[#171717] font-medium">
                      {resolved.cropX}%
                    </span>
                  </div>
                  <input
                    id="crop-x-range"
                    type="range"
                    min={-25}
                    max={25}
                    step={1}
                    value={resolved.cropX}
                    onChange={(e) =>
                      updateEditor({
                        cropX: Number(e.target.value),
                        cropMode:
                          resolved.cropMode === 'background-blur' ? 'background-blur' : 'manual',
                      })
                    }
                    className="cf-range w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="crop-y-range" className="text-[#525252]">
                      Vertical Crop Pan (Y)
                    </label>
                    <span className="font-mono tabular-nums text-[#171717] font-medium">
                      {resolved.cropY}%
                    </span>
                  </div>
                  <input
                    id="crop-y-range"
                    type="range"
                    min={-25}
                    max={25}
                    step={1}
                    value={resolved.cropY}
                    onChange={(e) =>
                      updateEditor({
                        cropY: Number(e.target.value),
                        cropMode:
                          resolved.cropMode === 'background-blur' ? 'background-blur' : 'manual',
                      })
                    }
                    className="cf-range w-full"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => updateEditor({ zoom: 100, cropX: 0, cropY: 0, cropMode: 'smart' })}
                  className="w-full py-2 rounded-lg bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#525252] hover:text-[#171717] transition-colors"
                >
                  Reset Framing
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* BOTTOM MULTI-TRACK TIMELINE (Video, Audio, Caption tracks + Playhead + Zoom controls) */}
      <section
        aria-label="Multi-track timeline"
        data-testid="editor-timeline"
        className="rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="font-sans font-semibold text-[#171717]">Timeline</span>
            <span className="text-[#737373]">In {formatTimecode(draft.startTime)}</span>
            <span className="text-[#DC2626] font-semibold">
              Playhead {formatTimecode(draft.startTime + progress * clipDuration)}
            </span>
            <span className="text-[#737373]">Out {formatTimecode(draft.endTime)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTimelineZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
              disabled={timelineZoom <= 1}
              aria-label="Zoom out timeline"
              className="p-1.5 rounded-lg bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#525252] disabled:opacity-40"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-xs tabular-nums text-[#171717] w-11 text-center">
              {Math.round(timelineZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setTimelineZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))))}
              disabled={timelineZoom >= 4}
              aria-label="Zoom in timeline"
              className="p-1.5 rounded-lg bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#525252] disabled:opacity-40"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div
            role="slider"
            tabIndex={0}
            aria-label="Timeline playhead scrubber"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setProgress(frac);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setProgress((p) => Math.min(1, p + 0.05));
              if (e.key === 'ArrowLeft') setProgress((p) => Math.max(0, p - 0.05));
            }}
            style={{ width: `${timelineZoom * 100}%`, minWidth: '100%' }}
            className="relative rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-2.5 space-y-2 cursor-pointer select-none"
          >
            {/* Track 1: Video Track */}
            <div className="flex items-center gap-2.5">
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                Video
              </span>
              <div className="relative flex-1 h-7 rounded-md bg-[#E5E5E5]/70 overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-[#171717] rounded-md flex items-center px-2 text-[10px] font-mono text-white/90 truncate"
                  style={{ left: '0%', width: '100%' }}
                >
                  {draft.title} ({formatDurationLabel(clipDuration)})
                </div>
              </div>
            </div>

            {/* Track 2: Audio Track */}
            <div className="flex items-center gap-2.5">
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                Audio
              </span>
              <div className="relative flex-1 h-6 rounded-md bg-[#F5F5F5] border border-[#E5E5E5] flex items-center gap-0.5 px-1.5 overflow-hidden">
                {Array.from({ length: Math.round(48 * timelineZoom) }).map((_, i) => (
                  <span
                    key={i}
                    className="flex-1 bg-[#A3A3A3] rounded-full"
                    style={{ height: `${25 + ((i * 29) % 70)}%` }}
                  />
                ))}
                {resolved.soundEffect !== 'none' && (
                  <span className="absolute left-1.5 top-0.5 px-1.5 py-0.5 rounded bg-[#171717]/80 text-[9px] font-mono text-white">
                    SFX: {resolved.soundEffect}
                  </span>
                )}
              </div>
            </div>

            {/* Track 3: Caption & Reaction FX Track */}
            <div className="flex items-center gap-2.5">
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                Captions
              </span>
              <div className="relative flex-1 h-6 rounded-md bg-[#FEF2F2]/70 border border-[#FECACA] overflow-hidden">
                {resolved.captions.length > 0 ? (
                  resolved.captions.map((seg) => {
                    const leftPct = (seg.start / clipDuration) * 100;
                    const widthPct = Math.max(4, ((seg.end - seg.start) / clipDuration) * 100);
                    return (
                      <div
                        key={seg.id}
                        title={seg.text}
                        className="absolute top-0.5 bottom-0.5 rounded bg-[#DC2626]/15 border border-[#DC2626]/40 px-1.5 flex items-center text-[10px] text-[#991B1B] truncate"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      >
                        {seg.text}
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center px-2 text-[10px] text-[#B91C1C] truncate">
                    {resolved.captionText || 'No caption segments yet — generate or type in Captions'}
                  </div>
                )}

                {/* Accepted Reaction Effect Markers */}
                {resolved.reactionEffects
                  .filter((fx) => fx.status === 'accepted')
                  .map((fx) => {
                    const leftPct = (fx.startTime / clipDuration) * 100;
                    const widthPct = Math.max(2, ((fx.endTime - fx.startTime) / clipDuration) * 100);
                    return (
                      <div
                        key={fx.id}
                        title={`${REACTION_EFFECT_META[fx.type].label} (${fx.startTime.toFixed(1)}s–${fx.endTime.toFixed(1)}s)`}
                        className="absolute bottom-0 h-1.5 bg-[#DC2626] rounded-t-xs"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      />
                    );
                  })}
              </div>
            </div>

            {/* Interactive Playhead Line */}
            <div
              className="pointer-events-none absolute top-1 bottom-1 w-0.5 bg-[#DC2626]"
              style={{
                left: `calc(74px + (100% - 84px) * ${Math.max(0, Math.min(1, progress))})`,
              }}
            >
              <span className="block -ml-[5px] -mt-1 h-2.5 w-2.5 rounded-full bg-[#DC2626] border-2 border-white shadow-xs" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
