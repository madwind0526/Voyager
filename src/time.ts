// Day phase from a real clock in a chosen time zone, optionally compressed to a shorter cycle.
export function dayHour(tz: string, cycleHours: number, now = new Date()): number {
  let h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  if (tz !== "auto") {
    try {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(now);
      const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
      h = g("hour") + g("minute") / 60 + g("second") / 3600;
    } catch {
      /* unknown zone: keep local time */
    }
  }
  return ((h % cycleHours) / cycleHours) * 24;
}
