const TZ = 'Europe/Nicosia';

const currencyFmt = new Intl.NumberFormat('en-CY', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: TZ,
});

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});

export function formatCurrency(cents: number): string {
  return currencyFmt.format(cents / 100);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';
  return dateFmt.format(d);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';
  return dateTimeFmt.format(d);
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid time';
  return timeFmt.format(d);
}

export function formatDateRange(from: string | Date, to: string | Date): string {
  const f = typeof from === 'string' ? new Date(from) : from;
  const t = typeof to === 'string' ? new Date(to) : to;

  const fParts = dateFmt.formatToParts(f);
  const tParts = dateFmt.formatToParts(t);

  const fMonth = fParts.find((p) => p.type === 'month')?.value;
  const tMonth = tParts.find((p) => p.type === 'month')?.value;
  const fYear = fParts.find((p) => p.type === 'year')?.value;
  const tYear = tParts.find((p) => p.type === 'year')?.value;
  const fDay = fParts.find((p) => p.type === 'day')?.value;
  const tDay = tParts.find((p) => p.type === 'day')?.value;

  if (fYear === tYear && fMonth === tMonth) {
    return `${fDay} - ${tDay} ${fMonth} ${fYear}`;
  }
  if (fYear === tYear) {
    return `${fDay} ${fMonth} - ${tDay} ${tMonth} ${fYear}`;
  }
  return `${formatDate(f)} - ${formatDate(t)}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  return formatDate(d);
}

export function nightsBetween(checkIn: string | Date, checkOut: string | Date): number {
  const from = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
  const to = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}
