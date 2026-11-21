import { useState } from 'react';
import { Download, FileDown, Scissors, Search, Trash2 } from 'lucide-react';
import { AspectRatio, ExportRecord } from '../types/clipforge';
import { formatDurationLabel, formatFileSize } from '../utils/timecode';

interface ExportHistoryViewProps {
  exportsList: ExportRecord[];
  onRedownload: (record: ExportRecord) => void;
  onOpenClipInEditor: (clipId: string) => void;
  onDeleteExport: (exportId: string) => void;
  onNavigateProjects: () => void;
}

export function ExportHistoryView({
  exportsList,
  onRedownload,
  onOpenClipInEditor,
  onDeleteExport,
  onNavigateProjects,
}: ExportHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [ratioFilter, setRatioFilter] = useState<AspectRatio | 'all'>('all');

  const filtered = exportsList.filter((item) => {
    if (ratioFilter !== 'all' && item.aspectRatio !== ratioFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.clipTitle.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        item.templateName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
            Export History
          </h1>
          <p className="text-sm text-[#737373] mt-1">
            Review exported clips, re-download cached MP4 renders, or reopen them in the Video
            Editor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#737373]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exports..."
              aria-label="Search export history"
              className="w-full sm:w-56 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5] pl-9 pr-3 py-2 text-xs text-[#171717] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#DC2626]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter exports by aspect ratio"
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#FFFFFF] border border-[#E5E5E5]"
          >
            {(['all', '9:16', '1:1', '16:9'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setRatioFilter(ratio)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  ratioFilter === ratio
                    ? 'bg-[#FEF2F2] text-[#DC2626] font-semibold'
                    : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {ratio === 'all' ? 'All' : ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-xl bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center">
              <FileDown className="h-5 w-5 text-[#DC2626]" />
            </div>
            <h2 className="font-display text-base font-semibold text-[#171717]">
              No export records yet
            </h2>
            <p className="text-xs text-[#737373] max-w-sm mx-auto leading-relaxed">
              Download any clip from My Projects or export directly from the Video Editor to log it
              here.
            </p>
            <button
              type="button"
              onClick={onNavigateProjects}
              className="mt-2 px-4 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors"
            >
              Browse Generated Clips
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="export-history-table">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-xs font-semibold text-[#737373]">
                  <th className="py-3.5 px-4">Clip</th>
                  <th className="py-3.5 px-4 hidden md:table-cell">Template</th>
                  <th className="py-3.5 px-4">Format</th>
                  <th className="py-3.5 px-4 hidden sm:table-cell">Duration</th>
                  <th className="py-3.5 px-4 hidden lg:table-cell">Size</th>
                  <th className="py-3.5 px-4 hidden xl:table-cell">Exported</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5] text-sm">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-[#171717] truncate max-w-[200px] sm:max-w-[280px]">
                        {item.clipTitle}
                      </p>
                      <p className="text-xs text-[#737373] truncate max-w-[200px] sm:max-w-[280px]">
                        {item.projectName}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#525252] hidden md:table-cell whitespace-nowrap">
                      {item.templateName}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#171717] font-mono tabular-nums whitespace-nowrap">
                      {item.aspectRatio} · {item.resolution}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#737373] font-mono tabular-nums hidden sm:table-cell whitespace-nowrap">
                      {formatDurationLabel(item.durationSeconds)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#737373] font-mono tabular-nums hidden lg:table-cell whitespace-nowrap">
                      {formatFileSize(item.fileSizeBytes)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[#737373] tabular-nums hidden xl:table-cell whitespace-nowrap">
                      {formatDate(item.exportedAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onRedownload(item)}
                          aria-label={`Download ${item.clipTitle} again`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#DC2626] border border-[#E5E5E5] hover:border-[#DC2626] text-xs font-semibold text-[#171717] hover:text-white transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Download</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenClipInEditor(item.clipId)}
                          aria-label={`Edit ${item.clipTitle}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] transition-colors"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteExport(item.id)}
                          aria-label={`Remove ${item.clipTitle} from history`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#737373] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
