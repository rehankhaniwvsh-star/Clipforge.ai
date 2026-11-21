import {
  ArrowRight,
  Clock,
  Film,
  FolderKanban,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ClipItem, VideoProject } from '../types/clipforge';
import { formatDurationLabel, formatRelativeDate, formatTimecode } from '../utils/timecode';

interface DashboardViewProps {
  projects: VideoProject[];
  clips: ClipItem[];
  availableCreditsMinutes: number;
  onNavigateCreate: () => void;
  onOpenProject: (projectId: string) => void;
  onEditClip: (clipId: string) => void;
}

export function DashboardView({
  projects,
  clips,
  availableCreditsMinutes,
  onNavigateCreate,
  onOpenProject,
  onEditClip,
}: DashboardViewProps) {
  const processingCount = projects.filter((p) => p.status === 'Processing').length;

  const stats = [
    {
      label: 'Total Projects',
      value: String(projects.length),
      note: 'Uploaded source videos',
      icon: FolderKanban,
    },
    {
      label: 'Clips Generated',
      value: String(clips.length),
      note: 'Rendered & editable cuts',
      icon: Scissors,
    },
    {
      label: 'Processing',
      value: String(processingCount),
      note: processingCount === 0 ? 'All pipelines idle' : 'Active background jobs',
      icon: Clock,
    },
    {
      label: 'Available Credits',
      value: `${availableCreditsMinutes} min`,
      note: 'AI analysis balance',
      icon: Sparkles,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E5E5E5]">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
            Welcome to ClipForge
          </h1>
          <p className="text-sm text-[#737373] mt-1">Your video creation workspace.</p>
        </div>

        <button
          type="button"
          onClick={onNavigateCreate}
          data-testid="dashboard-create-project-btn"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors whitespace-nowrap self-start sm:self-auto shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Project</span>
        </button>
      </div>

      {/* 4 Bordered KPI Stat Cards */}
      <section aria-label="Workspace metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] p-5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#737373]">{stat.label}</span>
                <Icon className="h-4 w-4 text-[#DC2626]" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold tabular-nums text-[#171717]">
                  {stat.value}
                </p>
                <p className="text-xs text-[#737373] mt-1">{stat.note}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Recent Projects */}
      <section aria-label="Recent projects" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#171717]">Recent Projects</h2>
            <p className="text-xs text-[#737373] mt-0.5">
              Reopen any uploaded video project to review, edit, or export its generated clips.
            </p>
          </div>
          {projects.length > 0 && (
            <button
              type="button"
              onClick={onNavigateCreate}
              className="text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C] whitespace-nowrap"
            >
              Upload another →
            </button>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-10 sm:p-12 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center">
              <Upload className="h-5 w-5 text-[#DC2626]" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="font-display text-base font-semibold text-[#171717]">
                No projects yet
              </h3>
              <p className="text-sm text-[#737373] leading-relaxed">
                Upload a long-form MP4, MOV, or WebM video to detect viral moments with AI or trim
                exact segments into ready-to-post shorts.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Create New Project</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((project) => {
              const projectClipCount = clips.filter((c) => c.projectId === project.id).length;
              return (
                <div
                  key={project.id}
                  className="rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] hover:border-[#D4D4D4] overflow-hidden flex flex-col justify-between transition-colors"
                >
                  <div className="relative aspect-video bg-[#171717] overflow-hidden">
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Film className="h-8 w-8 text-[#737373]" />
                      </div>
                    )}
                    <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/75 text-[11px] font-mono tabular-nums text-white">
                      {formatDurationLabel(project.durationSeconds)}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold text-[#171717] truncate">
                          {project.name}
                        </h3>
                        <span
                          className={`text-[11px] font-medium shrink-0 ${
                            project.status === 'Ready'
                              ? 'text-[#16A34A]'
                              : project.status === 'Processing'
                                ? 'text-[#D97706]'
                                : 'text-[#737373]'
                          }`}
                        >
                          {project.status}
                        </span>
                      </div>

                      <p className="text-xs text-[#737373] font-mono tabular-nums">
                        {projectClipCount} {projectClipCount === 1 ? 'clip' : 'clips'} ·{' '}
                        {project.aspectRatio} · {formatRelativeDate(project.createdAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#FAFAFA] hover:bg-[#FEF2F2] hover:text-[#DC2626] border border-[#E5E5E5] text-xs font-semibold text-[#171717] transition-colors"
                    >
                      <span>Open Project</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Latest Generated Clips Quick Access */}
      {clips.length > 0 && (
        <section aria-label="Latest clips" className="space-y-3">
          <h2 className="font-display text-base font-semibold text-[#171717]">
            Jump Back Into Editing
          </h2>
          <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E5E5] divide-y divide-[#E5E5E5]">
            {clips.slice(0, 4).map((clip) => (
              <div
                key={clip.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#171717] truncate">{clip.title}</p>
                  <p className="text-xs text-[#737373] font-mono tabular-nums mt-0.5">
                    {formatTimecode(clip.startTime)}–{formatTimecode(clip.endTime)} ·{' '}
                    {clip.editor.aspectRatio} · {clip.category}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEditClip(clip.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-semibold text-[#171717] whitespace-nowrap self-start sm:self-auto transition-colors"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#DC2626]" />
                  <span>Open in Editor</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
