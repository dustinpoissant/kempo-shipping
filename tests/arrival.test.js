import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutoffMinutes, estimate, validTimeZone } from '../server/utils/arrival.js';

/* A moment in New York, so the tests read as the seller's clock: 2026-10-26 is a Monday. */
const at = (date, time) => new Date(`${date}T${time}:00-04:00`);
const base = { countWeekends: false, cutoff: '17:00', timeZone: 'America/New_York' };

test('an order before the cutoff counts today, and one after it starts tomorrow', () => {
  assert.equal(estimate({ ...base, now: at('2026-10-26', '10:00'), processingDays: 1 }).shipDate, '2026-10-26');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '16:59'), processingDays: 1 }).shipDate, '2026-10-26');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '17:00'), processingDays: 1 }).shipDate, '2026-10-27');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '20:30'), processingDays: 1 }).shipDate, '2026-10-27');
});

test('processing days are counted from that first day, so two days from Monday morning is Tuesday', () => {
  assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 2 }).shipDate, '2026-10-27');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 5 }).shipDate, '2026-10-30');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '18:00'), processingDays: 5 }).shipDate, '2026-11-02', 'after the cutoff the fifth day is the next Monday');
});

test('no processing days, or a blank, ships the day it is ordered', () => {
  for(const processingDays of [0, undefined, null, '', -3, 'soon']) assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays }).shipDate, '2026-10-26', String(processingDays));
});

test('weekends do not count towards processing unless the seller says so', () => {
  const friday = at('2026-10-23', '09:00');
  assert.equal(estimate({ ...base, now: friday, processingDays: 3 }).shipDate, '2026-10-27', 'Fri, Mon, Tue');
  assert.equal(estimate({ ...base, now: at('2026-10-24', '10:00'), processingDays: 1 }).shipDate, '2026-10-26', 'ordered on a Saturday it starts Monday');
  assert.equal(estimate({ ...base, now: at('2026-10-25', '10:00'), processingDays: 2 }).shipDate, '2026-10-27');
});

test('counting weekends moves the finish earlier, but a carrier still only picks up on a weekday', () => {
  const counted = { ...base, countWeekends: true };
  assert.equal(estimate({ ...counted, now: at('2026-10-23', '09:00'), processingDays: 3 }).shipDate, '2026-10-26', 'Fri, Sat, Sun: ready Sunday, shipped Monday');
  assert.equal(estimate({ ...counted, now: at('2026-10-23', '09:00'), processingDays: 2 }).shipDate, '2026-10-26', 'ready Saturday, shipped Monday');
  assert.equal(estimate({ ...counted, now: at('2026-10-23', '09:00'), processingDays: 1 }).shipDate, '2026-10-23');
  assert.equal(estimate({ ...counted, now: at('2026-10-24', '10:00'), processingDays: 1 }).shipDate, '2026-10-26');
});

test('the carrier\'s days in transit are weekdays after the ship date', () => {
  assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 1, transitDays: 3 }).arrivalDate, '2026-10-29');
  assert.equal(estimate({ ...base, now: at('2026-10-29', '09:00'), processingDays: 1, transitDays: 3 }).arrivalDate, '2026-11-03', 'Thursday plus three weekdays skips the weekend');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 1, transitDays: 0 }).arrivalDate, '2026-10-26');
  assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 1, transitDays: 1 }).arrivalDate, '2026-10-27');
});

test('no transit time means a ship date and no arrival date', () => {
  for(const transitDays of [null, undefined, 'x', -1]) assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 1, transitDays }).arrivalDate, null, String(transitDays));
  assert.equal(estimate({ ...base, now: at('2026-10-26', '09:00'), processingDays: 1 }).shipDate, '2026-10-26');
});

test('the cutoff is read in the sellers own time zone, not the servers', () => {
  const afternoon = new Date('2026-10-26T20:30:00Z');
  assert.equal(estimate({ ...base, now: afternoon, timeZone: 'America/New_York', processingDays: 1 }).shipDate, '2026-10-26', '4:30 pm in New York is before the 5 pm cutoff');
  assert.equal(estimate({ ...base, now: afternoon, timeZone: 'UTC', processingDays: 1 }).shipDate, '2026-10-27', '8:30 pm in UTC is after it');
});

test('a time zone that is not one falls back, and no cutoff means today always counts', () => {
  assert.equal(validTimeZone('America/Chicago'), true);
  assert.equal(validTimeZone('Mars/Olympus'), false);
  assert.equal(validTimeZone(''), false);
  assert.equal(estimate({ ...base, timeZone: 'Mars/Olympus', now: at('2026-10-26', '10:00'), processingDays: 1 }).shipDate, '2026-10-26');
  assert.equal(estimate({ ...base, cutoff: '', now: at('2026-10-26', '23:59'), processingDays: 1 }).shipDate, '2026-10-26');
  assert.equal(estimate({ ...base, cutoff: 'late', now: at('2026-10-26', '23:59'), processingDays: 1 }).shipDate, '2026-10-26');
});

test('a cutoff is HH:MM, or nothing', () => {
  assert.equal(cutoffMinutes('17:00'), 1020);
  assert.equal(cutoffMinutes('00:00'), 0);
  assert.equal(cutoffMinutes('23:59'), 1439);
  for(const bad of ['24:00', '5pm', '17:60', '', undefined, null]) assert.equal(cutoffMinutes(bad), null, String(bad));
});

test('the arrival is a range: the earliest date and one weekday more, to allow for holidays', () => {
  const monday = { ...base, now: at('2026-10-26', '09:00'), processingDays: 1 };
  assert.deepEqual(estimate({ ...monday, transitDays: 3 }), { shipDate: '2026-10-26', arrivalDate: '2026-10-29', latestArrivalDate: '2026-10-30' });
  assert.equal(estimate({ ...monday, transitDays: 1 }).latestArrivalDate, '2026-10-28');
  assert.equal(estimate({ ...base, now: at('2026-10-29', '09:00'), processingDays: 1, transitDays: 3 }).latestArrivalDate, '2026-11-04', 'the extra day also skips the weekend');
  assert.equal(estimate({ ...monday }).latestArrivalDate, null);
  assert.equal(estimate({ ...monday, transitDays: 0 }).latestArrivalDate, '2026-10-27');
});
