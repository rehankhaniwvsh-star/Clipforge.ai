import { useMemo, useState } from 'react';
import {
  Bookmark,
  Download,
  Eye,
  FolderKanban,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ClipItem, ProcessingStatus, VideoProject } from '../types/clipforge';
import { formatDurationLabel, formatTimecode } from '../utils/timecode';
import { ClipPlayer } from './ClipPlayer';
import { ProcessingStatusBanner } from './ProcessingStatusBanner';

interface ProjectsClipsViewProps {
  projects: VideoProject[];
  clips: ClipItem[];
  selectedProjectId: string | 'all';
  onSelectProject: (projectId: string | 'all') => void;
  onEditClip: (clipId: string) => void;
  onDownloadClip: (
    clip: ClipItem,
    onStatus?: (status: ProcessingStatus) => void
  ) => Promise<void> | void;
  onToggleSaveClip: (clipId: string) => void;
  onNavigateCreate: () => void;
  savedOnly?: boolean;
}

export function ProjectsClipsView({
  projects,
  clips,
  selectedProjectId,
  onSelectProject,
  onEditClip,
  onDownloadClip,
  onToggleSaveClip,
  onNavigateCreate,
  savedOnly = false,
}: ProjectsClipsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'duration'>('newest');
  const [downloadingClipId, setDownloadingClipId] = useState<string | null>(null);
  const [previewClip, setPreviewClip] = useState<ClipItem | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: null,
    detail: '',
  });

  const visibleClips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clips
      .filter((clip) => (savedOnly ? Boolean(clip.saved) : true))
      .filter((clip) =>
        savedOnly || selectedProjectId === 'all' ? true : clip.projectId === selectedProjectId
      )
      .filter((clip) => {
        if (!q) return true;
        return (
          clip.title.toLowerCase().includes(q) ||
          clip.category.toLowerCase().includes(q) ||
          clip.editor.captionText.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'score') return b.engagementScore - a.engagementScore;
        if (sortBy === 'duration') return b.endTime - b.startTime - (a.endTime - a.startTime);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [clips, savedOnly, selectedProjectId, searchQuery, sortBy]);

  const handleDownload = async (clip: ClipItem) => {
    setDownloadingClipId(clip.id);
    try {
      await onDownloadClip(clip, setDownloadStatus);
    } finally {
      setDownloadingClipId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
            {savedOnly ? 'Saved Clips' : 'My Projects & Clips'}
          </h1>
          <p className="text-sm text-[#737373] mt-1">
            {savedOnly
              ? 'Your bookmarked clips ready for quick editing or MP4 download.'
              : 'Review generated clips, preview captions, bookmark favorites, or export real MP4 files.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Video Project</span>
        </button>
      </div>

      <ProcessingStatusBanner
        status={downloadStatus}
        onDismiss={() => setDownloadStatus({ stage: 'idle', progress: null, detail: '' })}
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {!savedOnly && projects.length > 0 && (
            <select
              aria-label="Filter by project"
              value={selectedProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
              className="rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#171717] focus:outline-none focus:border-[#DC2626]"
            >
              <option value="all">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="h-3.5 w-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clips by title or category..."
              className="w-full rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] pl-8 pr-3 py-2 text-xs text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-[#737373] font-mono tabular-nums">
            {visibleClips.length} {visibleClips.length === 1 ? 'clip' : 'clips'}
          </span>
          <select
            aria-label="Sort clips"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'score' | 'duration')}
            className="rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] px-3 py-2 text-xs font-medium text-[#171717] focus:outline-none focus:border-[#DC2626]"
          >
            <option value="newest">Sort: Newest</option>
            <option value="score">Sort: Engagement Score</option>
            <option value="duration">Sort: Longest Duration</option>
          </select>
        </div>
      </div>

      {/* Empty State OR Responsive Clip Gallery */}
      {visibleClips.length === 0 ? (
        <div className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-12 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center">
            {savedOnly ? (
              <Bookmark className="h-5 w-5 text-[#DC2626]" />
            ) : (
              <FolderKanban className="h-5 w-5 text-[#DC2626]" />
            )}
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="font-display text-base font-semibold text-[#171717]">
              {savedOnly ? 'No saved clips yet' : 'No generated clips yet'}
            </h2>
            <p className="text-sm text-[#737373] leading-relaxed">
              {savedOnly
                ? 'Bookmark your best clips from My Projects to keep them pinned here for quick publishing.'
                : 'Upload a video in Create Clips to detect highlights with Gemini AI or cut exact MP4 segments.'}
            </p>
          </div>
          {!savedOnly && (
            <button
              type="button"
              onClick={onNavigateCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create Clips</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleClips.map((clip) => {
            const clipDuration = Math.max(1, Math.round(clip.endTime - clip.startTime));
            const isExporting = downloadingClipId === clip.id;
            return (
              <article
                key={clip.id}
                data-testid="generated-clip-card"
                className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] hover:border-[#D4D4D4] overflow-hidden flex flex-col justify-between transition-colors"
              >
                <div className="p-3 bg-[#F5F5F5] border-b border-[#E5E5E5] flex justify-center">
                  <div
                    className={`w-full ${
                      clip.editor.aspectRatio === '9:16'
                        ? 'max-w-[205px]'
                        : clip.editor.aspectRatio === '1:1'
                          ? 'max-w-[250px]'
                          : 'max-w-full'
                    }`}
                  >
                    <ClipPlayer clip={clip} compact />
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold text-[#171717] leading-snug line-clamp-2">
                        {clip.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => onToggleSaveClip(clip.id)}
                        aria-label={clip.saved ? 'Remove from Saved Clips' : 'Save clip'}
                        data-testid={`save-clip-btn-${clip.id}`}
                        className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                          clip.saved
                            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                            : 'bg-[#FFFFFF] border-[#E5E5E5] text-[#737373] hover:text-[#171717]'
                        }`}
                      >
                        <Bookmark className={`h-3.5 w-3.5 ${clip.saved ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#737373] font-mono tabular-nums">
                      <span className="font-sans font-medium text-[#171717]">{clip.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatTimecode(clip.startTime)}–{formatTimecode(clip.endTime)} (
                        {formatDurationLabel(clipDuration)})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#16A34A] font-semibold">
                        Score {clip.engagementScore}
                      </span>
                    </div>

                    {clip.aiHook && (
                      <p className="text-xs text-[#737373] line-clamp-2 leading-relaxed">
                        {clip.aiHook}
                      </p>
                    )}
                  </div>

                  {/* Card Actions: Edit / Preview / Download */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#E5E5E5]">
                    <button
                      type="button"
                      onClick={() => onEditClip(clip.id)}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] transition-colors whitespace-nowrap"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#DC2626]" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPreviewClip(clip)}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] transition-colors whitespace-nowrap"
                    >
                      <Eye className="h-3.5 w-3.5 text-[#737373]" />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => void handleDownload(clip)}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      {isExporting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      <span>{isExporting ? '...' : 'MP4'}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Clean Preview Lightbox Modal */}
      {previewClip && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewClip.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setPreviewClip(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-[#E5E5E5] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-semibold text-[#171717] truncate">
                  {previewClip.title}
                </h3>
                <p className="text-xs font-mono tabular-nums text-[#737373]">
                  {formatTimecode(previewClip.startTime)}–{formatTimecode(previewClip.endTime)} ·{' '}
                  {previewClip.editor.aspectRatio}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewClip(null)}
                aria-label="Close preview"
                className="p-1.5 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 bg-[#F5F5F5] flex justify-center">
              <div
                className={`w-full ${
                  previewClip.editor.aspectRatio === '9:16'
                    ? 'max-w-[260px]'
                    : previewClip.editor.aspectRatio === '1:1'
                      ? 'max-w-[340px]'
                      : 'max-w-full'
                }`}
              >
                <ClipPlayer clip={previewClip} />
              </div>
            </div>
            <div className="px-5 py-3.5 bg-[#FFFFFF] border-t border-[#E5E5E5] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = previewClip.id;
                  setPreviewClip(null);
                  onEditClip(id);
                }}
                className="px-3.5 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717]"
              >
                Open in Editor
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = previewClip;
                  setPreviewClip(null);
                  void handleDownload(target);
                }}
                className="px-4 py-2 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold"
              >
                Download MP4
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
