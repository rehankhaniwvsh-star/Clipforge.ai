/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import {
  AppView,
  CaptionLanguageMode,
  CaptionReactionResponse,
  CaptionTemplateId,
  ClipGenerationConfig,
  ClipItem,
  ExportRecord,
  ProcessingStatus,
  UploadedVideoInfo,
  UserSettings,
  VideoProject,
  WorkspaceTab,
} from './types/clipforge';
import { DEFAULT_USER_SETTINGS } from './data/seedData';
import { TEMPLATE_BY_ID } from './data/templates';
import { estimateCreditCostMinutes } from './utils/clipGenerator';
import {
  clearAllMediaBlobs,
  deleteMediaBlob,
  loadMediaBlob,
  saveMediaBlob,
} from './utils/mediaStorage';
import { objectUrlManager } from './utils/objectUrlManager';
import {
  extractClipAudioWavWithFfmpeg,
  recordClipWithMediaRecorder,
  renderBurnedInClipWithFfmpeg,
  trimAndRenderClipWithFfmpeg,
  triggerRealBlobDownload,
} from './utils/videoEngine';
import { classifyProcessingError, validateTrimTimestamps } from './utils/videoEngineLogic';
import {
  mapAiCategoryToClipCategory,
  validateAiClipSuggestions,
} from './utils/aiAnalysisValidation';
import { requestCaptionsAndReactions } from './utils/captionReactionClient';
import { detectFaceCenterFromVideoSource, FaceDetectionResult } from './utils/faceCropDetector';
import { LandingPage } from './components/LandingPage';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { DashboardView } from './components/DashboardView';
import { CreateClipsView } from './components/CreateClipsView';
import { ProjectsClipsView } from './components/ProjectsClipsView';
import { CaptionTemplatesView } from './components/CaptionTemplatesView';
import { VideoEditorView } from './components/VideoEditorView';
import { ExportHistoryView } from './components/ExportHistoryView';
import { SettingsView } from './components/SettingsView';
import { LiveClipperView } from './components/LiveClipperView';
import { BillingView } from './components/BillingView';
import { HelpSupportView } from './components/HelpSupportView';

const STORAGE_KEY = 'clipforge_ai_state_v3';

interface PersistedState {
  projects: VideoProject[];
  clips: ClipItem[];
  exportsList: ExportRecord[];
  settings: UserSettings;
}

function emptyWorkspaceState(): PersistedState {
  return {
    projects: [],
    clips: [],
    exportsList: [],
    settings: DEFAULT_USER_SETTINGS,
  };
}

function loadInitialState(): PersistedState {
  if (typeof window === 'undefined') {
    return emptyWorkspaceState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyWorkspaceState();
    }
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const realProjects = Array.isArray(parsed.projects)
      ? parsed.projects.filter((p) => p.sourceType !== 'sample-studio')
      : [];
    const realProjectIds = new Set(realProjects.map((p) => p.id));
    const realClips = Array.isArray(parsed.clips)
      ? parsed.clips.filter((c) => realProjectIds.has(c.projectId))
      : [];
    const realExports = Array.isArray(parsed.exportsList)
      ? parsed.exportsList.filter((e) => Boolean(e.mediaStorageKey))
      : [];

    return {
      projects: realProjects,
      clips: realClips,
      exportsList: realExports,
      settings: parsed.settings
        ? { ...DEFAULT_USER_SETTINGS, ...parsed.settings }
        : DEFAULT_USER_SETTINGS,
    };
  } catch {
    return emptyWorkspaceState();
  }
}

function slugifyFileName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 42) || 'clipforge-clip'
  );
}

export default function App() {
  const initial = loadInitialState();

  const [view, setView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'app';
    }
    return 'landing';
  });

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [projects, setProjects] = useState<VideoProject[]>(initial.projects);
  const [clips, setClips] = useState<ClipItem[]>(initial.clips);
  const [exportsList, setExportsList] = useState<ExportRecord[]>(initial.exportsList);
  const [settings, setSettings] = useState<UserSettings>(initial.settings);

  const [selectedProjectId, setSelectedProjectId] = useState<string | 'all'>('all');
  const [activeClipId, setActiveClipId] = useState<string>(initial.clips[0]?.id || '');
  const [pendingYouTubeUrl, setPendingYouTubeUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Hydrate persisted real media Blobs (uploaded videos, thumbnails, trimmed MP4 clips) from IndexedDB
  useEffect(() => {
    let cancelled = false;

    const hydrateFromIndexedDb = async () => {
      const hydratedProjects = await Promise.all(
        initial.projects.map(async (proj) => {
          let nextProj = { ...proj };
          if (proj.mediaStorageKey) {
            const blob = await loadMediaBlob(proj.mediaStorageKey);
            if (blob && !cancelled) {
              nextProj = {
                ...nextProj,
                videoUrl: objectUrlManager.create(`proj-video-${proj.id}`, blob),
              };
            }
          }
          if (proj.thumbnailStorageKey) {
            const thumbBlob = await loadMediaBlob(proj.thumbnailStorageKey);
            if (thumbBlob && !cancelled) {
              nextProj = {
                ...nextProj,
                thumbnailUrl: objectUrlManager.create(`proj-thumb-${proj.id}`, thumbBlob),
              };
            }
          }
          return nextProj;
        })
      );

      const hydratedClips = await Promise.all(
        initial.clips.map(async (clip) => {
          let nextClip = { ...clip };
          if (clip.mediaStorageKey) {
            const clipBlob = await loadMediaBlob(clip.mediaStorageKey);
            if (clipBlob && !cancelled) {
              nextClip = {
                ...nextClip,
                videoUrl: objectUrlManager.create(`clip-video-${clip.id}`, clipBlob),
              };
            }
          } else if (clip.sourceMediaStorageKey) {
            const srcBlob = await loadMediaBlob(clip.sourceMediaStorageKey);
            if (srcBlob && !cancelled) {
              nextClip = {
                ...nextClip,
                videoUrl: objectUrlManager.create(`clip-src-${clip.id}`, srcBlob),
              };
            }
          }
          if (clip.thumbnailStorageKey) {
            const thumbBlob = await loadMediaBlob(clip.thumbnailStorageKey);
            if (thumbBlob && !cancelled) {
              nextClip = {
                ...nextClip,
                thumbnailUrl: objectUrlManager.create(`clip-thumb-${clip.id}`, thumbBlob),
              };
            }
          }
          return nextClip;
        })
      );

      if (!cancelled) {
        setProjects(hydratedProjects);
        setClips(hydratedClips);
      }
    };

    void hydrateFromIndexedDb();

    return () => {
      cancelled = true;
      objectUrlManager.revokeAll();
    };
  }, []);

  // Persist lightweight metadata to localStorage (binary video/audio blobs live in IndexedDB)
  useEffect(() => {
    try {
      const serializableProjects = projects.map((p) => ({
        ...p,
        videoUrl: p.videoUrl?.startsWith('blob:') ? undefined : p.videoUrl,
        thumbnailUrl: p.thumbnailUrl?.startsWith('blob:') ? '' : p.thumbnailUrl,
      }));
      const serializableClips = clips.map((c) => ({
        ...c,
        videoUrl: c.videoUrl?.startsWith('blob:') ? undefined : c.videoUrl,
        thumbnailUrl: c.thumbnailUrl?.startsWith('blob:') ? '' : c.thumbnailUrl,
      }));
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          projects: serializableProjects,
          clips: serializableClips,
          exportsList,
          settings,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [projects, clips, exportsList, settings]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 4000);
  };

  const handleStartCreating = () => {
    setView('app');
    setActiveTab('dashboard');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleStartFromYouTubeUrl = (url: string) => {
    setPendingYouTubeUrl(url);
    setView('app');
    setActiveTab('create');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleOpenTemplatesFromLanding = (templateId?: CaptionTemplateId) => {
    if (templateId) {
      setSettings((prev) => ({ ...prev, defaultTemplateId: templateId }));
    }
    setView('app');
    setActiveTab('templates');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  /**
   * Real browser video clip generation:
   * Persists the uploaded source video & canvas thumbnail to IndexedDB, then invokes
   * FFmpeg.wasm (or MediaRecorder fallback) to cut real playable MP4 segments for every clip.
   */
  const handleGenerateClips = async (
    video: UploadedVideoInfo,
    projectName: string,
    config: ClipGenerationConfig,
    onStatus: (status: ProcessingStatus) => void,
    signal: AbortSignal,
    useFallback = false
  ) => {
    const isYouTubeSource = video.sourceType === 'youtube' && Boolean(video.youtubeVideoId);

    if (!isYouTubeSource && !video.fileBlob) {
      throw new Error('No local video binary available to process.');
    }

    const projectId = `proj-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const sourceMediaStorageKey = isYouTubeSource ? undefined : `media-source-${projectId}`;
    const thumbnailStorageKey = isYouTubeSource ? undefined : `media-thumb-${projectId}`;

    let projectVideoUrl = video.objectUrl;
    let projectThumbUrl = video.thumbnailUrl;

    if (!isYouTubeSource && video.fileBlob && sourceMediaStorageKey) {
      onStatus({
        stage: 'Loading video',
        progress: null,
        detail: 'Persisting uploaded source video into local IndexedDB project cache...',
      });

      await saveMediaBlob(sourceMediaStorageKey, video.fileBlob);
      if (video.thumbnailBlob && thumbnailStorageKey) {
        await saveMediaBlob(thumbnailStorageKey, video.thumbnailBlob);
      }

      projectVideoUrl = objectUrlManager.create(`proj-video-${projectId}`, video.fileBlob);
      projectThumbUrl = video.thumbnailBlob
        ? objectUrlManager.create(`proj-thumb-${projectId}`, video.thumbnailBlob)
        : video.thumbnailUrl;
    }

    // Build planned clip metadata (exact user trim cut OR Gemini AI validated clips OR multi-clip fallback)
    let plannedClips: ClipItem[];
    let usedGeminiAi = false;

    if (config.customTrim?.enabled) {
      const tsValidation = validateTrimTimestamps(
        config.customTrim.startTime,
        config.customTrim.endTime,
        video.durationSeconds,
        1
      );
      if (!tsValidation.valid) {
        throw new Error(tsValidation.error || 'Invalid trim timestamps.');
      }
      const start = tsValidation.startTime;
      const end = tsValidation.endTime;
      const tpl = TEMPLATE_BY_ID[settings.defaultTemplateId];
      plannedClips = [
        {
          id: `${projectId}-clip-1`,
          projectId,
          title: `${projectName} (${Math.round(end - start)}s Cut)`,
          startTime: start,
          endTime: end,
          sourceDuration: video.durationSeconds,
          category: config.category,
          engagementScore: 94,
          thumbnailUrl: projectThumbUrl,
          thumbnailStorageKey,
          sourceMediaStorageKey,
          youtubeVideoId: video.youtubeVideoId,
          youtubeUrl: video.youtubeUrl,
          youtubeChannel: video.youtubeChannel,
          isLocalMedia: !isYouTubeSource,
          createdAt,
          editor: {
            templateId: settings.defaultTemplateId,
            captionText: '',
            textPosition: tpl.defaultPosition,
            verticalOffset: 0,
            fontSize: tpl.defaultFontSize,
            fontColor: tpl.defaultFontColor,
            highlightColor: tpl.defaultHighlightColor,
            zoom: 100,
            cropX: 0,
            cropY: 0,
            aspectRatio: config.aspectRatio,
            soundEffect: settings.autoAddSfx ? 'whoosh' : 'none',
            sfxVolume: 65,
          },
        },
      ];
    } else if (config.aiSelectedClips && config.aiSelectedClips.length > 0) {
      // Strict pre-render timestamp validation before invoking FFmpeg.wasm
      const validated = validateAiClipSuggestions(config.aiSelectedClips, {
        videoDurationSeconds: video.durationSeconds,
        targetDurationSeconds: config.duration,
        maxClips: config.count,
      });

      if (validated.clips.length === 0) {
        throw new Error(
          'No Gemini AI clip timestamps passed validation for this video duration. Adjust timestamps with Exact Trim or re-run AI analysis.'
        );
      }

      usedGeminiAi = true;
      const tpl = TEMPLATE_BY_ID[settings.defaultTemplateId];
      plannedClips = validated.clips.map((aiClip, idx) => ({
        id: `${projectId}-ai-clip-${idx + 1}`,
        projectId,
        title: aiClip.title,
        startTime: aiClip.startTime,
        endTime: aiClip.endTime,
        sourceDuration: video.durationSeconds,
        category: mapAiCategoryToClipCategory(aiClip.category),
        engagementScore: aiClip.score,
        thumbnailUrl: projectThumbUrl,
        thumbnailStorageKey,
        sourceMediaStorageKey,
        youtubeVideoId: video.youtubeVideoId,
        youtubeUrl: video.youtubeUrl,
        youtubeChannel: video.youtubeChannel,
        isLocalMedia: !isYouTubeSource,
        aiGenerated: true,
        aiHook: aiClip.hook,
        aiReason: aiClip.reason,
        createdAt,
        editor: {
          templateId: settings.defaultTemplateId,
          captionText: aiClip.caption,
          textPosition: tpl.defaultPosition,
          verticalOffset: 0,
          fontSize: tpl.defaultFontSize,
          fontColor: tpl.defaultFontColor,
          highlightColor: tpl.defaultHighlightColor,
          zoom: 100,
          cropX: 0,
          cropY: 0,
          aspectRatio: config.aspectRatio,
          soundEffect: settings.autoAddSfx ? 'whoosh' : 'none',
          sfxVolume: 65,
        },
      }));
    } else {
      throw new Error(
        'No validated clip timestamps are selected. Run Gemini AI analysis or switch to Exact Trim to specify timestamps.'
      );
    }

    // Cut local videos via FFmpeg.wasm (or save timestamped YouTube studio clips directly)
    const renderedClips: ClipItem[] = [];
    if (isYouTubeSource) {
      onStatus({
        stage: 'Processing clip',
        progress: 90,
        detail: `Saving ${plannedClips.length} timestamped YouTube ${
          plannedClips.length === 1 ? 'clip' : 'clips'
        } into your workspace...`,
      });
      renderedClips.push(...plannedClips);
    } else {
      for (let i = 0; i < plannedClips.length; i += 1) {
        if (signal.aborted) {
          throw new DOMException('Clip generation cancelled', 'AbortError');
        }

        const target = plannedClips[i];
        const clipStatusPrefix = `Clip ${i + 1} of ${plannedClips.length}`;
        const renderFn = useFallback ? recordClipWithMediaRecorder : trimAndRenderClipWithFfmpeg;

        const rendered = await renderFn(
          {
            sourceBlob: video.fileBlob!,
            sourceFileName: video.fileName,
            startTime: target.startTime,
            endTime: target.endTime,
            aspectRatio: target.editor.aspectRatio,
            applyReframe: false,
            quality: settings.exportQuality,
            stageLabel: 'Processing clip',
          },
          (stepStatus) => {
            onStatus({
              ...stepStatus,
              detail: `${clipStatusPrefix}: ${stepStatus.detail}`,
            });
          },
          signal
        );

        const clipStorageKey = `media-clip-${target.id}`;
        await saveMediaBlob(clipStorageKey, rendered.blob);
        const clipBlobUrl = objectUrlManager.create(`clip-video-${target.id}`, rendered.blob);

        renderedClips.push({
          ...target,
          videoUrl: clipBlobUrl,
          mediaStorageKey: clipStorageKey,
          renderedMimeType: rendered.mimeType,
          renderedFileSizeBytes: rendered.fileSizeBytes,
          isRealProcessedClip: true,
        });
      }
    }

    const newProject: VideoProject = {
      id: projectId,
      name: projectName,
      fileName: video.fileName,
      fileSizeBytes: video.fileSizeBytes,
      durationSeconds: video.durationSeconds,
      resolution: `${video.width}x${video.height}`,
      mimeType: video.mimeType,
      sourceType: video.sourceType,
      videoUrl: projectVideoUrl,
      youtubeVideoId: video.youtubeVideoId,
      youtubeUrl: video.youtubeUrl,
      youtubeChannel: video.youtubeChannel,
      mediaStorageKey: sourceMediaStorageKey,
      thumbnailUrl: projectThumbUrl,
      thumbnailStorageKey,
      audioPrep: video.audioPrep,
      category: config.category,
      aspectRatio: config.aspectRatio,
      status: 'Ready',
      clipCount: renderedClips.length,
      createdAt,
      pipelineNote: isYouTubeSource
        ? usedGeminiAi
          ? 'YouTube URL import + Gemini AI native video highlight selection'
          : 'YouTube URL import + Exact Timestamp clip selection'
        : usedGeminiAi
          ? useFallback
            ? 'Gemini AI audio & transcript selection + MediaRecorder video cuts (persisted in IndexedDB)'
            : 'Gemini AI audio & transcript selection + FFmpeg.wasm real MP4 cuts (persisted in IndexedDB)'
          : useFallback
            ? 'Browser MediaRecorder real video cuts (persisted in IndexedDB)'
            : 'FFmpeg.wasm real MP4 cuts (persisted in IndexedDB)',
    };

    const creditCost = estimateCreditCostMinutes(video.durationSeconds, renderedClips.length);

    setProjects((prev) => [newProject, ...prev]);
    setClips((prev) => [...renderedClips, ...prev]);
    setSettings((prev) => ({
      ...prev,
      availableCreditsMinutes: Math.max(0, prev.availableCreditsMinutes - creditCost),
    }));
    setSelectedProjectId(projectId);
    if (renderedClips[0]) setActiveClipId(renderedClips[0].id);

    onStatus({
      stage: 'Completed',
      progress: 100,
      detail: isYouTubeSource
        ? `Saved ${renderedClips.length} timestamped YouTube ${
            renderedClips.length === 1 ? 'clip' : 'clips'
          } ready to preview and edit.`
        : `Cut and rendered ${renderedClips.length} real playable ${
            useFallback ? 'WebM' : 'MP4'
          } ${renderedClips.length === 1 ? 'clip' : 'clips'}.`,
    });

    setActiveTab('projects');
    showToast(
      isYouTubeSource
        ? `Saved ${renderedClips.length} YouTube ${
            renderedClips.length === 1 ? 'clip' : 'clips'
          } for "${projectName}".`
        : `Rendered ${renderedClips.length} real playable ${useFallback ? 'WebM' : 'MP4'} ${
            renderedClips.length === 1 ? 'clip' : 'clips'
          } for "${projectName}".`
    );
  };

  /**
   * Re-cuts a real uploaded clip in-place inside Video Editor when the user adjusts trim timestamps.
   */
  const handleRenderTrimmedClip = async (
    clip: ClipItem,
    onStatus: (status: ProcessingStatus) => void,
    signal: AbortSignal,
    useFallback = false
  ): Promise<ClipItem | null> => {
    const project = projects.find((p) => p.id === clip.projectId);
    const sourceKey = clip.sourceMediaStorageKey || project?.mediaStorageKey;
    const sourceBlob = sourceKey ? await loadMediaBlob(sourceKey) : null;

    if (!sourceBlob) {
      onStatus({
        stage: 'Failed',
        progress: null,
        detail: 'Original uploaded video blob was not found in browser storage for this clip.',
        error: 'Upload a local video file to re-cut real video segments.',
      });
      return null;
    }

    const renderFn = useFallback ? recordClipWithMediaRecorder : trimAndRenderClipWithFfmpeg;
    const rendered = await renderFn(
      {
        sourceBlob,
        sourceFileName: project?.fileName || 'source.mp4',
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio: clip.editor.aspectRatio,
        applyReframe: false,
        quality: settings.exportQuality,
        stageLabel: 'Processing clip',
      },
      onStatus,
      signal
    );

    const clipStorageKey = clip.mediaStorageKey || `media-clip-${clip.id}`;
    await saveMediaBlob(clipStorageKey, rendered.blob);
    const newUrl = objectUrlManager.create(`clip-video-${clip.id}`, rendered.blob);

    const updatedClip: ClipItem = {
      ...clip,
      videoUrl: newUrl,
      mediaStorageKey: clipStorageKey,
      renderedMimeType: rendered.mimeType,
      renderedFileSizeBytes: rendered.fileSizeBytes,
      isRealProcessedClip: true,
    };

    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));
    showToast(`Re-cut real ${rendered.formatLabel} (${clip.startTime.toFixed(1)}s–${clip.endTime.toFixed(1)}s).`);
    return updatedClip;
  };

  const handleEditClip = (clipId: string) => {
    setActiveClipId(clipId);
    setActiveTab('editor');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleSaveClip = (updatedClip: ClipItem) => {
    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));
    showToast('Clip edits saved.');
  };

  const handleToggleSaveClip = (clipId: string) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const nextSaved = !c.saved;
        showToast(nextSaved ? 'Saved clip to Saved Clips.' : 'Removed clip from Saved Clips.');
        return { ...c, saved: nextSaved };
      })
    );
  };

  const handleGenerateClipCaptionsAndReactions = async (
    clip: ClipItem,
    options: { languageMode: CaptionLanguageMode; includeReactions: boolean },
    onStatus: (status: ProcessingStatus) => void,
    signal: AbortSignal
  ): Promise<CaptionReactionResponse> => {
    const project = projects.find((p) => p.id === clip.projectId);
    const sourceKey = clip.sourceMediaStorageKey || project?.mediaStorageKey;
    const sourceBlob = sourceKey ? await loadMediaBlob(sourceKey) : null;
    const clipBlob = clip.mediaStorageKey ? await loadMediaBlob(clip.mediaStorageKey) : null;
    const mediaBlob = sourceBlob || clipBlob;

    if (!mediaBlob) {
      throw new Error('No uploaded video file found in browser storage for this clip.');
    }

    const start = sourceBlob ? clip.startTime : 0;
    const end = sourceBlob ? clip.endTime : Math.max(1, clip.endTime - clip.startTime);
    const clipDur = Math.max(1, end - start);

    const wavBlob = await extractClipAudioWavWithFfmpeg(
      mediaBlob,
      project?.fileName || 'clip.mp4',
      start,
      end,
      onStatus,
      signal
    );

    return requestCaptionsAndReactions({
      audioBlob: wavBlob,
      clipTitle: clip.title,
      clipDurationSeconds: clipDur,
      languageMode: options.languageMode,
      includeReactions: options.includeReactions,
      existingTranscript: clip.editor.captionText,
      onStatus,
      signal,
    });
  };

  const handleDetectClipFaceCenter = async (clip: ClipItem): Promise<FaceDetectionResult> => {
    const project = projects.find((p) => p.id === clip.projectId);
    const clipBlob = clip.mediaStorageKey ? await loadMediaBlob(clip.mediaStorageKey) : null;
    const sourceKey = clip.sourceMediaStorageKey || project?.mediaStorageKey;
    const sourceBlob = sourceKey ? await loadMediaBlob(sourceKey) : null;

    if (clipBlob) {
      return detectFaceCenterFromVideoSource(clipBlob, 1.0);
    }
    if (sourceBlob) {
      return detectFaceCenterFromVideoSource(sourceBlob, clip.startTime + 1.0);
    }
    if (clip.videoUrl) {
      return detectFaceCenterFromVideoSource(clip.videoUrl, 1.0);
    }
    return { anchorX: 0.5, anchorY: 0.35, source: 'canvas-saliency', detectedCount: 0 };
  };

  /**
   * Real MP4 / WebM video export with burned-in captions, video formatting, accepted reaction effects,
   * and original synchronized audio retained cleanly.
   */
  const handleExportClip = async (
    clip: ClipItem,
    onStatus?: (status: ProcessingStatus) => void,
    useFallback = false,
    signal?: AbortSignal
  ) => {
    const project = projects.find((p) => p.id === clip.projectId);
    const sourceKey = clip.sourceMediaStorageKey || project?.mediaStorageKey;
    const sourceBlob = sourceKey ? await loadMediaBlob(sourceKey) : null;
    const existingClipBlob = clip.mediaStorageKey ? await loadMediaBlob(clip.mediaStorageKey) : null;

    if (sourceBlob || existingClipBlob) {
      try {
        const blobToRenderFrom = sourceBlob || existingClipBlob!;
        const start = sourceBlob ? clip.startTime : 0;
        const end = sourceBlob
          ? clip.endTime
          : Math.max(1, clip.endTime - clip.startTime);

        const rendered = useFallback
          ? await recordClipWithMediaRecorder(
              {
                sourceBlob: blobToRenderFrom,
                sourceFileName: project?.fileName || 'clip.mp4',
                startTime: start,
                endTime: end,
                aspectRatio: clip.editor.aspectRatio,
                applyReframe: true,
                quality: settings.exportQuality,
                zoom: clip.editor.zoom,
                cropX: clip.editor.cropX,
                cropY: clip.editor.cropY,
                editor: clip.editor,
                stageLabel: 'Rendering',
              },
              onStatus,
              signal
            )
          : await renderBurnedInClipWithFfmpeg(
              {
                sourceBlob: blobToRenderFrom,
                sourceFileName: project?.fileName || 'clip.mp4',
                startTime: start,
                endTime: end,
                aspectRatio: clip.editor.aspectRatio,
                applyReframe: true,
                quality: settings.exportQuality,
                zoom: clip.editor.zoom,
                cropX: clip.editor.cropX,
                cropY: clip.editor.cropY,
                editor: clip.editor,
                stageLabel: 'Rendering',
              },
              onStatus,
              signal
            );

        const exportId = `exp-${Date.now()}`;
        const exportStorageKey = `media-export-${exportId}`;
        await saveMediaBlob(exportStorageKey, rendered.blob);

        const filename = `${slugifyFileName(clip.title)}-${clip.editor.aspectRatio.replace(':', 'x')}.${rendered.extension}`;
        triggerRealBlobDownload(rendered.blob, filename);

        const record: ExportRecord = {
          id: exportId,
          clipId: clip.id,
          clipTitle: clip.title,
          projectName: project?.name || 'ClipForge Project',
          aspectRatio: clip.editor.aspectRatio,
          durationSeconds: Math.max(1, Math.round(rendered.durationSeconds)),
          templateName: TEMPLATE_BY_ID[clip.editor.templateId].name,
          format: rendered.formatLabel,
          mimeType: rendered.mimeType,
          resolution: rendered.resolution,
          fileSizeBytes: rendered.fileSizeBytes,
          mediaStorageKey: exportStorageKey,
          exportedAt: new Date().toISOString(),
          status: 'Completed',
        };

        setExportsList((prev) => [record, ...prev]);
        showToast(`Exported real ${rendered.formatLabel} "${filename}".`);
        return;
      } catch (err) {
        const classified = classifyProcessingError(err);
        onStatus?.({
          stage: 'Failed',
          progress: null,
          detail: classified.message,
          error: classified.message,
          fallbackAvailable: classified.suggestFallback && !useFallback,
        });
        throw err;
      }
    }

    if (clip.youtubeVideoId) {
      const clipDur = Math.max(1, Math.round((clip.endTime - clip.startTime) * 10) / 10);
      const cutPackage = {
        clipforgeVersion: '1.0',
        title: clip.title,
        projectName: project?.name || clip.title,
        youtubeVideoId: clip.youtubeVideoId,
        youtubeClipUrl: `https://www.youtube.com/watch?v=${clip.youtubeVideoId}&t=${Math.floor(clip.startTime)}s`,
        channel: clip.youtubeChannel || project?.youtubeChannel || 'YouTube',
        startTimeSeconds: clip.startTime,
        endTimeSeconds: clip.endTime,
        durationSeconds: clipDur,
        aspectRatio: clip.editor.aspectRatio,
        captionTemplate: TEMPLATE_BY_ID[clip.editor.templateId].name,
        captionText: clip.editor.captionText,
        captions: clip.editor.captions ?? [],
        aiHook: clip.aiHook,
        aiReason: clip.aiReason,
        exportedAt: new Date().toISOString(),
      };
      const packageBlob = new Blob([JSON.stringify(cutPackage, null, 2)], {
        type: 'application/json',
      });
      const exportId = `exp-${Date.now()}`;
      const exportStorageKey = `media-export-${exportId}`;
      await saveMediaBlob(exportStorageKey, packageBlob);

      const filename = `${slugifyFileName(clip.title)}-youtube-cut-package.json`;
      triggerRealBlobDownload(packageBlob, filename);

      const record: ExportRecord = {
        id: exportId,
        clipId: clip.id,
        clipTitle: clip.title,
        projectName: project?.name || 'YouTube Project',
        aspectRatio: clip.editor.aspectRatio,
        durationSeconds: Math.max(1, Math.round(clipDur)),
        templateName: TEMPLATE_BY_ID[clip.editor.templateId].name,
        format: 'SRT + Cut Package',
        mimeType: 'application/json',
        resolution: clip.editor.aspectRatio,
        fileSizeBytes: packageBlob.size,
        mediaStorageKey: exportStorageKey,
        exportedAt: new Date().toISOString(),
        status: 'Completed',
      };
      setExportsList((prev) => [record, ...prev]);
      onStatus?.({
        stage: 'Completed',
        progress: 100,
        detail: `Exported YouTube Cut Package "${filename}". For a burned-in MP4 file, record via Live Clipper or upload a local MP4.`,
      });
      showToast(`Exported YouTube Cut Package "${filename}".`);
      return;
    }

    // No real binary media found in browser IndexedDB storage — report clearly instead of faking export
    const missingErr = new Error(
      'Original video media was not found in local IndexedDB storage for this clip. Re-upload the video in Create Clips to export MP4.'
    );
    onStatus?.({
      stage: 'Failed',
      progress: null,
      detail: missingErr.message,
      error: missingErr.message,
      fallbackAvailable: false,
    });
    throw missingErr;
  };

  const handleRedownloadExport = async (record: ExportRecord) => {
    if (record.mediaStorageKey) {
      const storedBlob = await loadMediaBlob(record.mediaStorageKey);
      if (storedBlob) {
        const ext =
          record.format === 'MP4 Video'
            ? 'mp4'
            : record.format === 'SRT + Cut Package'
              ? 'json'
              : 'webm';
        const filename = `${slugifyFileName(record.clipTitle)}-${record.aspectRatio.replace(':', 'x')}.${ext}`;
        triggerRealBlobDownload(storedBlob, filename);
        showToast(`Downloaded real ${record.format} "${filename}" from local storage.`);
        return;
      }
    }

    const matchingClip = clips.find((c) => c.id === record.clipId);
    if (matchingClip) {
      await handleExportClip(matchingClip);
    } else {
      showToast('Original media blob is no longer cached in IndexedDB.');
    }
  };

  const handleDeleteExport = (id: string) => {
    const target = exportsList.find((item) => item.id === id);
    if (target?.mediaStorageKey) {
      void deleteMediaBlob(target.mediaStorageKey);
    }
    setExportsList((prev) => prev.filter((item) => item.id !== id));
    showToast('Removed export entry from history.');
  };

  const handleUseTemplateInEditor = (templateId: CaptionTemplateId) => {
    const tpl = TEMPLATE_BY_ID[templateId];
    const targetId = activeClipId || clips[0]?.id;
    if (targetId) {
      setClips((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? {
                ...c,
                editor: {
                  ...c.editor,
                  templateId,
                  fontFamily: tpl.defaultFontFamily,
                  fontColor: tpl.defaultFontColor,
                  highlightColor: tpl.defaultHighlightColor,
                  backgroundColor: tpl.defaultBackgroundColor,
                  backgroundOpacity: tpl.defaultBackgroundOpacity,
                  outlineWidth: tpl.defaultOutlineWidth,
                  outlineColor: tpl.defaultOutlineColor,
                  shadowStyle: tpl.defaultShadowStyle,
                  fontSize: tpl.defaultFontSize,
                  textPosition: tpl.defaultPosition,
                },
              }
            : c
        )
      );
      setActiveClipId(targetId);
      setActiveTab('editor');
      showToast(`Applied "${tpl.name}" template in Video Editor.`);
    } else {
      setSettings((prev) => ({ ...prev, defaultTemplateId: templateId }));
      setActiveTab('create');
      showToast(`Selected "${tpl.name}" as your default caption style.`);
    }
  };

  const handleResetWorkspaceData = () => {
    objectUrlManager.revokeAll();
    void clearAllMediaBlobs();
    setProjects([]);
    setClips([]);
    setExportsList([]);
    setSettings(DEFAULT_USER_SETTINGS);
    setSelectedProjectId('all');
    setActiveClipId('');
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem('clipforge_ai_state_v2');
    } catch {
      // ignore
    }
    showToast('Cleared all local projects, clips, exports, and IndexedDB media cache.');
  };

  return (
    <>
      {view === 'landing' ? (
        <LandingPage
          onStartCreating={handleStartCreating}
          onOpenTemplates={handleOpenTemplatesFromLanding}
          onGenerateFromYouTubeUrl={handleStartFromYouTubeUrl}
        />
      ) : (
        <WorkspaceLayout
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }}
          onBackToLanding={() => {
            setView('landing');
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }}
          availableCreditsMinutes={settings.availableCreditsMinutes}
          creatorName={settings.creatorName}
          savedClipsCount={clips.filter((c) => c.saved).length}
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              projects={projects}
              clips={clips}
              availableCreditsMinutes={settings.availableCreditsMinutes}
              onNavigateCreate={() => setActiveTab('create')}
              onGenerateFromYouTubeUrl={handleStartFromYouTubeUrl}
              onOpenProject={(projectId) => {
                setSelectedProjectId(projectId);
                setActiveTab('projects');
              }}
              onEditClip={handleEditClip}
            />
          )}

          {activeTab === 'create' && (
            <CreateClipsView
              defaultAspectRatio={settings.defaultAspectRatio}
              availableCreditsMinutes={settings.availableCreditsMinutes}
              maxUploadSizeMB={settings.maxUploadSizeMB}
              initialYouTubeUrl={pendingYouTubeUrl}
              onConsumeInitialUrl={() => setPendingYouTubeUrl(null)}
              onGenerateClips={handleGenerateClips}
            />
          )}

          {activeTab === 'live' && (
            <LiveClipperView onNavigateCreate={() => setActiveTab('create')} />
          )}

          {activeTab === 'projects' && (
            <ProjectsClipsView
              projects={projects}
              clips={clips}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              onEditClip={handleEditClip}
              onDownloadClip={handleExportClip}
              onToggleSaveClip={handleToggleSaveClip}
              onNavigateCreate={() => setActiveTab('create')}
            />
          )}

          {activeTab === 'saved' && (
            <ProjectsClipsView
              projects={projects}
              clips={clips}
              selectedProjectId="all"
              onSelectProject={setSelectedProjectId}
              onEditClip={handleEditClip}
              onDownloadClip={handleExportClip}
              onToggleSaveClip={handleToggleSaveClip}
              onNavigateCreate={() => setActiveTab('create')}
              savedOnly
            />
          )}

          {activeTab === 'templates' && (
            <CaptionTemplatesView
              defaultTemplateId={settings.defaultTemplateId}
              onSetDefaultTemplate={(templateId) => {
                setSettings((prev) => ({ ...prev, defaultTemplateId: templateId }));
                showToast(`Default template set to "${TEMPLATE_BY_ID[templateId].name}".`);
              }}
              onUseTemplateInEditor={handleUseTemplateInEditor}
            />
          )}

          {activeTab === 'editor' && (
            <VideoEditorView
              clips={clips}
              activeClipId={activeClipId}
              onSelectClip={setActiveClipId}
              onSaveClip={handleSaveClip}
              onRenderTrimmedClip={handleRenderTrimmedClip}
              onGenerateCaptionsAndReactions={handleGenerateClipCaptionsAndReactions}
              onDetectFaceCenter={handleDetectClipFaceCenter}
              onExportClip={handleExportClip}
              onNavigateCreate={() => setActiveTab('create')}
            />
          )}

          {activeTab === 'exports' && (
            <ExportHistoryView
              exportsList={exportsList}
              onRedownload={(record) => void handleRedownloadExport(record)}
              onOpenClipInEditor={handleEditClip}
              onDeleteExport={handleDeleteExport}
              onNavigateProjects={() => setActiveTab('projects')}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onSaveSettings={(next) => {
                setSettings(next);
                showToast('Workspace settings saved.');
              }}
              onResetWorkspaceData={handleResetWorkspaceData}
            />
          )}

          {activeTab === 'billing' && (
            <BillingView
              availableCreditsMinutes={settings.availableCreditsMinutes}
              totalProjectsCount={projects.length}
              totalClipsCount={clips.length}
              onNavigateCreate={() => setActiveTab('create')}
            />
          )}

          {activeTab === 'help' && (
            <HelpSupportView onNavigateCreate={() => setActiveTab('create')} />
          )}
        </WorkspaceLayout>
      )}

      {/* Non-blocking Light-Theme Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 sm:bottom-5 z-50 flex items-center gap-2.5 sm:max-w-sm rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] px-4 py-3 text-xs font-medium text-[#171717] shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
          <span className="flex-1 leading-snug">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="ml-1 text-[#737373] hover:text-[#171717] shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
