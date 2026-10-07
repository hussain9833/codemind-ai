import clsx, { type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];

/** "5 minutes ago" style label. */
export function timeAgo(date: Date | null | undefined): string {
  if (!date) return "Never";
  const secs = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  return "just now";
}

export const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
