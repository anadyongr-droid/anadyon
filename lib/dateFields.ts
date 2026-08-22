export interface DateParts {
  day: string;
  month: string;
  year: string;
}

export function splitIsoDate(value: string | null | undefined): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match
    ? { year: match[1], month: match[2], day: match[3] }
    : { year: "", month: "", day: "" };
}

export function daysInMonth(month: string, year: string): number {
  if (!month) return 31;
  const parsedMonth = Number(month);
  const parsedYear = Number(year) || 2000;
  if (parsedMonth < 1 || parsedMonth > 12) return 31;
  return new Date(Date.UTC(parsedYear, parsedMonth, 0)).getUTCDate();
}

export function joinIsoDate(parts: DateParts): string {
  if (!parts.day && !parts.month && !parts.year) return "";
  if (!parts.day || !parts.month || !parts.year) return "";
  if (Number(parts.day) > daysInMonth(parts.month, parts.year)) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

