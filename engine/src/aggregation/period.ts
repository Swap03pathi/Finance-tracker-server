/**
 * Period honesty (doc 01 §5, doc 05 §1, doc 08 DASH-04). With a ~2-week backfill the dashboard must
 * say "since you installed" and never imply a full month; a near-zero income on a fresh mid-cycle
 * install is correct, not broken.
 */
export interface PeriodLabel {
  label: string;
  isThin: boolean; // true when the window is shorter than a full cycle (~28 days)
  days: number;
}

export function describePeriod(installedAtIso: string, nowIso: string): PeriodLabel {
  const days = Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(installedAtIso)) / 86_400_000));
  const isThin = days < 28;
  return {
    label: isThin ? 'since you installed' : 'this month',
    isThin,
    days,
  };
}
