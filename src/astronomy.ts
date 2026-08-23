export const LUNAR_CYCLE_DAYS = 29.53059;

export type LunarMoment = {
  cycleDay: number;
  lunarDay: number;
  hour: number;
  phase: number;
  phaseAngle: number;
  illumination: number;
  phaseName: string;
};

export function wrapCycle(days: number): number {
  return ((days % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
}

export function getLunarMoment(days: number): LunarMoment {
  const cycleDay = wrapCycle(days);
  const lunarDay = Math.min(30, Math.floor(cycleDay) + 1);
  const hour = (cycleDay % 1) * 24;
  const phase = cycleDay / LUNAR_CYCLE_DAYS;
  const phaseAngle = phase * Math.PI * 2;
  return {
    cycleDay,
    lunarDay,
    hour,
    phase,
    phaseAngle,
    illumination: (1 - Math.cos(phaseAngle)) / 2,
    phaseName: getPhaseName(cycleDay),
  };
}

function circularDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, LUNAR_CYCLE_DAYS - direct);
}

export function getPhaseName(cycleDay: number): string {
  if (circularDistance(cycleDay, 0) < 0.85) return '';
  if (circularDistance(cycleDay, 3) < 1.05) return '초승달';
  if (circularDistance(cycleDay, 7) < 1.05) return '상현달';
  if (circularDistance(cycleDay, 14) < 1.2) return '보름달';
  if (circularDistance(cycleDay, 21.5) < 1.15) return '하현달';
  if (circularDistance(cycleDay, 27) < 1.05) return '그믐달';
  return '';
}

export function formatKoreanTime(hourValue: number): string {
  const totalMinutes = Math.round(hourValue * 60) % (24 * 60);
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 || 12;
  return `${period} ${hour12}:${minute.toString().padStart(2, '0')}`;
}

export function daylightAmount(hour: number): number {
  const solarAltitude = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  const t = Math.max(0, Math.min(1, (solarAltitude + 0.22) / 0.4));
  return t * t * (3 - 2 * t);
}
