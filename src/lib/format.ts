// Spanish relative-time formatting. Pure + tiny so it runs anywhere.

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} d`;
  return new Date(iso).toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
  });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Parse the (free-text or standardized) age field into whole years for
// filtering. "8 meses" / "menos de 1 año" → 0; "5 años" → 5; unparseable → null.
export function ageToYears(age: string | null | undefined): number | null {
  if (!age) return null;
  if (/mes|month|menos de 1|under 1/i.test(age)) return 0;
  const m = age.match(/\d+/);
  if (!m) return null;
  return parseInt(m[0], 10);
}
