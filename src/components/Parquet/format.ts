import type { ParquetJobStage, RowCountType } from '../../types/parquet';

export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function monthName(month: string): string {
  const index = Number(month) - 1;
  return MONTHS_LONG[index] ?? `Month ${month}`;
}

export function monthShort(month: string): string {
  const index = Number(month) - 1;
  return MONTHS_SHORT[index] ?? month;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDuration(
  startIso: string | null,
  endIso: string | null,
  nowMs: number = Date.now()
): string {
  if (!startIso) return '—';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';

  const totalSeconds = Math.round((end - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function stageLabel(stage: ParquetJobStage): string {
  switch (stage) {
    case 'prepare':
      return 'Prepare runner';
    case 'validate':
      return 'Validate source';
    case 'write':
      return 'Write Parquet';
    case 'inspect':
      return 'Inspect files';
    case 'preview':
      return 'Sample records';
    case 'manifest':
      return 'Write manifest';
    case 'done':
      return 'Complete';
    case 'failed':
      return 'Failed';
    default:
      return stage;
  }
}

export function rowCountLabel(type: RowCountType): string {
  if (type === 'exact') return 'exact';
  if (type === 'estimated') return 'estimated';
  return 'unavailable';
}

export function previewValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(4);
  }
  return String(value);
}
