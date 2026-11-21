import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react';
import { ProcessingStatus } from '../types/clipforge';

interface ProcessingStatusBannerProps {
  status: ProcessingStatus;
  onCancel?: () => void;
  onRunFallback?: () => void;
  fallbackLabel?: string;
  onDismiss?: () => void;
}

export function ProcessingStatusBanner({
  status,
  onCancel,
  onRunFallback,
  fallbackLabel = 'Use Browser Fallback',
  onDismiss,
}: ProcessingStatusBannerProps) {
  if (status.stage === 'idle') return null;

  const isError = status.stage === 'Failed';
  const isDone = status.stage === 'Completed';
  const isActive = !isError && !isDone;

  return (
    <div
      data-testid="processing-status-banner"
      data-stage={status.stage}
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
      className={`rounded-xl border p-4 transition-colors ${
        isError
          ? 'bg-[#FEF2F2] border-[#FECACA]'
          : isDone
            ? 'bg-[#F0FDF4] border-[#BBF7D0]'
            : 'bg-[#FAFAFA] border-[#E5E5E5]'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {isActive && <Loader2 className="h-4 w-4 text-[#DC2626] animate-spin shrink-0 mt-0.5" />}
          {isDone && <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0 mt-0.5" />}
          {isError && <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0 mt-0.5" />}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm font-semibold ${
                  isError ? 'text-[#B91C1C]' : isDone ? 'text-[#15803D]' : 'text-[#171717]'
                }`}
              >
                {status.stage}
              </span>
              {typeof status.progress === 'number' && (
                <span className="font-mono text-xs tabular-nums text-[#737373]">
                  {Math.round(status.progress)}%
                </span>
              )}
            </div>
            {status.detail && (
              <p className="text-xs text-[#737373] mt-0.5 break-words leading-relaxed">
                {status.detail}
              </p>
            )}
            {status.error && status.error !== status.detail && (
              <p className="text-xs text-[#DC2626] mt-1 break-words leading-relaxed">
                {status.error}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isActive && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              data-testid="cancel-processing-btn"
              className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#171717] whitespace-nowrap transition-colors"
            >
              Cancel
            </button>
          )}
          {isError && status.fallbackAvailable && onRunFallback && (
            <button
              type="button"
              onClick={onRunFallback}
              data-testid="fallback-render-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-xs font-semibold text-white whitespace-nowrap transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{fallbackLabel}</span>
            </button>
          )}
          {(isDone || isError) && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss processing status"
              className="p-1 rounded-md text-[#737373] hover:text-[#171717] hover:bg-black/[0.04] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <div className="mt-3 h-1.5 w-full rounded-full bg-[#E5E5E5] overflow-hidden">
          {typeof status.progress === 'number' ? (
            <div
              className="h-full bg-[#DC2626] transition-[width] duration-200 rounded-full"
              style={{ width: `${Math.max(4, Math.min(100, status.progress))}%` }}
            />
          ) : (
            <div className="h-full w-1/3 bg-[#DC2626] animate-pulse rounded-full" />
          )}
        </div>
      )}
    </div>
  );
}
