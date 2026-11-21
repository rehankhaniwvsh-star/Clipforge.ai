export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const decimals = idx >= 2 ? 1 : 0;
  return `${val.toFixed(decimals)} ${units[idx]}`;
}

export function clampTrimRange(
  startTime: number,
  endTime: number,
  maxDuration: number,
  minClipLength = 3
): { startTime: number; endTime: number } {
  const safeMax = Math.max(minClipLength, Number.isFinite(maxDuration) ? maxDuration : minClipLength);
  let start = Number.isFinite(startTime) ? Math.max(0, Math.min(startTime, safeMax - minClipLength)) : 0;
  let end = Number.isFinite(endTime) ? Math.max(start + minClipLength, Math.min(endTime, safeMax)) : safeMax;

  if (end - start < minClipLength) {
    if (start + minClipLength <= safeMax) {
      end = start + minClipLength;
    } else {
      start = Math.max(0, safeMax - minClipLength);
      end = safeMax;
    }
  }

  return {
    startTime: Math.round(start * 10) / 10,
    endTime: Math.round(end * 10) / 10,
  };
}

export function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return iso;
  }
}
