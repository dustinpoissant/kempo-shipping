/*
  When an order ships and when it should arrive, as pure rules with no imports so they can be tested alone.

  The seller's processing time (the days it takes to make the thing and get it ready, `processingdays` on a product) is
  counted from today when the order comes in before the cutoff time, and from tomorrow when it comes in after it. Weekends
  count towards processing only when the seller says so. Carriers pick up and deliver on weekdays, so the ship date is never
  a weekend, and the carrier's days in transit are weekdays after it.

    estimate({ now, processingDays: 2, countWeekends: false, cutoff: '17:00', timeZone: 'America/New_York', transitDays: 3 })
    -> { shipDate: '2026-10-27', arrivalDate: '2026-10-30' }

  Dates are plain `YYYY-MM-DD` strings of the seller's own calendar, so there is nothing to convert on the way to a browser.
*/
const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_TIME_ZONE = 'America/New_York';

export const validTimeZone = zone => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return typeof zone === 'string' && zone !== '';
  } catch {
    return false;
  }
};

/* "17:00" as minutes into the day, or null when there is no cutoff (blank) or it is not a time. */
export const cutoffMinutes = cutoff => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(cutoff ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/* The calendar date and time of day in a time zone, as { day (UTC midnight of that date), minutes }. */
const localMoment = (now, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  return { day: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};

const isWeekend = day => [0, 6].includes(new Date(day).getUTCDay());

/* The same day when it is a weekday, otherwise the Monday after. */
const rollToWeekday = day => {
  let rolled = day;
  while(isWeekend(rolled)) rolled += DAY;
  return rolled;
};

const addWeekdays = (day, count) => {
  let result = day;
  for(let left = count; left > 0; left--) result = rollToWeekday(result + DAY);
  return result;
};

const format = day => new Date(day).toISOString().slice(0, 10);

/*
  The arrival is a range, not a day: the earliest date is the carrier's days in transit after the ship date, and the latest is
  one more weekday, which covers the things nobody can plan for (a post office holiday, a slow truck). So the customer is
  promised "Oct 28 to 29", not "Oct 28".

  `processingDays` is the days it takes (0 or blank ships the day it is ordered), `cutoff` the time of day after which today
  no longer counts ('' for none), `transitDays` the carrier's days in transit (null when it does not say, which gives no
  arrival date).
*/
export const estimate = ({ now = new Date(), processingDays = 0, countWeekends = false, cutoff = '', timeZone = DEFAULT_TIME_ZONE, transitDays = null }) => {
  const zone = validTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const { day: today, minutes } = localMoment(now, zone);
  const limit = cutoffMinutes(cutoff);
  let day = limit !== null && minutes >= limit ? today + DAY : today;
  if(!countWeekends) day = rollToWeekday(day);
  for(let counted = 1; counted < Math.max(0, Math.floor(Number(processingDays) || 0)); counted++){
    day += DAY;
    if(!countWeekends) day = rollToWeekday(day);
  }
  const ship = rollToWeekday(day);
  const days = Number(transitDays);
  const known = transitDays !== null && transitDays !== undefined && Number.isFinite(days) && days >= 0;
  return {
    shipDate: format(ship),
    arrivalDate: known ? format(addWeekdays(ship, Math.floor(days))) : null,
    latestArrivalDate: known ? format(addWeekdays(ship, Math.floor(days) + 1)) : null,
  };
};
