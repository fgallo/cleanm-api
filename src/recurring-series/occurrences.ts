// Calendar dates of a recurring series. Pure functions over "YYYY-MM-DD"
// strings: a visit is a day on the organization's calendar, so the arithmetic
// is done in UTC on purpose, where no daylight saving time can shift a day.

export type RecurrenceRule = {
  startDate: string;
  everyWeeks: number | null;
  dayOfMonth: number | null;
};

const dayMs = 24 * 60 * 60 * 1000;

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return format(new Date(parse(date).getTime() + days * dayMs));
}

function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / dayMs);
}

// Dates of the series between from and to, both inclusive, in order.
export function occurrences(
  rule: RecurrenceRule,
  from: string,
  to: string,
): string[] {
  const start = from > rule.startDate ? from : rule.startDate;
  if (start > to) {
    return [];
  }
  return rule.everyWeeks !== null
    ? weekly(rule.startDate, rule.everyWeeks, start, to)
    : monthly(rule.startDate, rule.dayOfMonth ?? 1, start, to);
}

function weekly(
  startDate: string,
  everyWeeks: number,
  from: string,
  to: string,
): string[] {
  const step = everyWeeks * 7;
  // First visit on or after from, staying on the cycle of startDate.
  const skipped = Math.ceil(daysBetween(startDate, from) / step);
  const dates: string[] = [];
  for (let date = addDays(startDate, skipped * step); date <= to;) {
    dates.push(date);
    date = addDays(date, step);
  }
  return dates;
}

function monthly(
  startDate: string,
  dayOfMonth: number,
  from: string,
  to: string,
): string[] {
  const dates: string[] = [];
  const first = parse(startDate);
  for (let month = 0; ; month++) {
    const year = first.getUTCFullYear();
    // Day 0 of the next month is the last day of this one.
    const lastDay = new Date(
      Date.UTC(year, first.getUTCMonth() + month + 1, 0),
    ).getUTCDate();
    const date = format(
      new Date(
        Date.UTC(
          year,
          first.getUTCMonth() + month,
          Math.min(dayOfMonth, lastDay),
        ),
      ),
    );
    if (date > to) {
      return dates;
    }
    if (date >= from) {
      dates.push(date);
    }
  }
}
