export type IsoDate = string;
export type CivilDate = { year: number; month: number; day: number };

export class InvalidIsoDateError extends Error {}

const ISO_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function tryParse(value: string): CivilDate | null {
  const match = ISO_SHAPE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidIsoDate(value: string): boolean {
  return tryParse(value) !== null;
}

export function parseIso(value: IsoDate): CivilDate {
  const parsed = tryParse(value);
  if (!parsed) throw new InvalidIsoDateError(`Invalid ISO date: ${JSON.stringify(value)}`);
  return parsed;
}

export function formatIso(date: CivilDate): IsoDate {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Howard Hinnant's days_from_civil: days since 1970-01-01 in the proleptic Gregorian calendar.
export function toDayNumber(value: IsoDate): number {
  const { year, month, day } = parseIso(value);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

// Howard Hinnant's civil_from_days.
export function fromDayNumber(days: number): IsoDate {
  if (!Number.isInteger(days)) {
    throw new InvalidIsoDateError(`Day number must be an integer, got ${days}`);
  }
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return formatIso({ year, month, day });
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(value) + days);
}

export function diffDays(later: IsoDate, earlier: IsoDate): number {
  return toDayNumber(later) - toDayNumber(earlier);
}

export function compareIso(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  const delta = toDayNumber(a) - toDayNumber(b);
  if (delta < 0) return -1;
  return delta > 0 ? 1 : 0;
}
