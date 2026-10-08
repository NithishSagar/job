/** Small formatting / helper utilities shared by server and client components. */

/** Tiny classnames helper (keeps JSX readable without pulling in clsx). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
};

export function currencySymbol(currency?: string | null): string {
  if (!currency) return '£';
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
}

/** 65000 -> "65k", 1200 -> "1.2k", 950 -> "950" */
export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    const k = value / 1000;
    const rounded = Math.abs(k) >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `${rounded}k`;
  }
  return String(Math.round(value));
}

/** "£65k–£85k" / "from £65k" / "up to £85k" / "—" */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency?: string | null,
): string {
  const sym = currencySymbol(currency);
  const hasMin = typeof min === 'number' && min > 0;
  const hasMax = typeof max === 'number' && max > 0;

  if (hasMin && hasMax) {
    if (min === max) return `${sym}${compactNumber(min as number)}`;
    return `${sym}${compactNumber(min as number)}–${sym}${compactNumber(max as number)}`;
  }
  if (hasMin) return `from ${sym}${compactNumber(min as number)}`;
  if (hasMax) return `up to ${sym}${compactNumber(max as number)}`;
  return '—';
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-GB');
}

/** 0.4213 (ratio) -> "42.1%" */
export function formatRatio(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** 42.13 (already a percentage) -> "42.1%" */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  // Postgres `TIMESTAMP` (without time zone) arrives as "2026-10-08T09:30:00"
  // with no trailing Z. Treat those as UTC so the rendering is stable.
  let input = value;
  if (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input) &&
    !/(Z|[+-]\d{2}:?\d{2})$/.test(input)
  ) {
    input = `${input}Z`;
  }
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "8 Oct 2026" */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "8 Oct 2026, 14:05" */
export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 hours ago" / "in 2 days" / "just now" */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  fallback = '—',
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return fallback;

  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < 45_000) return 'just now';

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', year],
    ['month', month],
    ['week', week],
    ['day', day],
    ['hour', hour],
    ['minute', minute],
  ];

  for (const [unit, ms] of units) {
    if (abs >= ms) {
      const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'just now';
}

/** Value for an `<input type="date">` from a timestamp/date string. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

/** Value for an `<input type="datetime-local">` from a timestamp string. */
export function toDateTimeInputValue(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 16);
}

/** Normalise an empty form field to NULL rather than an empty string. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Parse a numeric form field, returning null for blank/invalid input. */
export function parseNumberOrNull(value: string | null | undefined): number | null {
  const trimmed = emptyToNull(value);
  if (trimmed === null) return null;
  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Monday 00:00 (local) of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** "6 Oct" — short label for week-bucket chart axes. */
export function shortDateLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** URL-safe random invite code, e.g. "k3f9a1c7b2d8e4f6". */
export function generateInviteCode(bytes = 12): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint8Array(bytes);
    cryptoObj.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Extremely unlikely fallback (no Web Crypto available).
  return Array.from({ length: bytes * 2 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

/** Human-readable Supabase/PostgREST error text. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return (
      [e.message, e.details, e.hint].filter(Boolean).join(' — ') ||
      (e.code ? `Error ${e.code}` : 'Unknown error')
    );
  }
  return 'Unknown error';
}

/** Sort helper that pushes null/undefined values to the end. */
export function compareNullableDesc(a: number | null | undefined, b: number | null | undefined) {
  const av = a ?? Number.NEGATIVE_INFINITY;
  const bv = b ?? Number.NEGATIVE_INFINITY;
  return bv - av;
}
