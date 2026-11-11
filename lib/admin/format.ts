import "server-only";

const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Server-side only (Intl output differs between runtimes, so never render this on the client). */
export function formatTimestamp(iso: string | null): string {
  if (iso === null) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${timestampFormat.format(date)} EAT`;
}
