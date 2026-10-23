import { getSetting, setSetting, triggerHook } from 'kempo/server/sdk.js';
import { parseCountries } from './countries.js';
import { validWeightUnit, validDimensionUnit } from './units.js';
import { convertProducts, registerShippingAttributes } from './productAttributes.js';
import { convertAllBoxes } from './boxRows.js';
import { DEFAULT_TIME_ZONE, cutoffMinutes, validTimeZone } from './arrival.js';

/*
  The store's own shipping settings: the flat rate (and whether it is offered), the countries it ships to, the units weights and sizes are measured
  in, whether items are combined into one box where they fit, and the address orders are sent from. Stored as kempo
  settings under kempo-shipping, so they also appear on kempo's settings screen.
*/
export const OWNER = 'kempo-shipping';
export const UNITS_EVENT = 'kempo-shipping:units_changed';
const MAX_FLAT_RATE = 1000000000;

/* The address orders are sent from, which a carrier needs to quote. Each part is its own setting. */
export const ORIGIN_SETTINGS = { name: 'origin_name', phone: 'origin_phone', line1: 'origin_line1', line2: 'origin_line2', city: 'origin_city', state: 'origin_state', postalCode: 'origin_postal_code', country: 'origin_country' };
const ORIGIN_MAX = 200;

export const readShipping = async () => {
  const [, flat] = await getSetting(OWNER, 'shipping_flat_rate', 0);
  const [, flatEnabled] = await getSetting(OWNER, 'flat_rate_enabled', true);
  const [, countries] = await getSetting(OWNER, 'shipping_countries', '');
  const [, weightUnit] = await getSetting(OWNER, 'weight_unit', 'lb');
  const [, dimensionUnit] = await getSetting(OWNER, 'dimension_unit', 'in');
  const [, combine] = await getSetting(OWNER, 'combine_items', false);
  const [, countWeekends] = await getSetting(OWNER, 'processing_count_weekends', false);
  const [, cutoff] = await getSetting(OWNER, 'processing_cutoff', '17:00');
  const [, timeZone] = await getSetting(OWNER, 'processing_timezone', DEFAULT_TIME_ZONE);
  const origin = {};
  for(const [key, name] of Object.entries(ORIGIN_SETTINGS)){
    const [, value] = await getSetting(OWNER, name, '');
    origin[key] = String(value ?? '').trim();
  }
  origin.country = origin.country.toUpperCase();
  const flatRate = Number(flat);
  return {
    flatRate: Number.isSafeInteger(flatRate) && flatRate >= 0 ? flatRate : 0,
    flatRateEnabled: !(flatEnabled === false || flatEnabled === 'false'),
    countries: parseCountries(countries),
    weightUnit: validWeightUnit(weightUnit),
    dimensionUnit: validDimensionUnit(dimensionUnit),
    combine: combine === true || combine === 'true',
    origin,
    processing: {
      countWeekends: countWeekends === true || countWeekends === 'true',
      cutoff: String(cutoff ?? '').trim() === '' ? '' : cutoffMinutes(cutoff) === null ? '17:00' : String(cutoff).trim(),
      timeZone: validTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
    },
  };
};

/*
  Saves what is supplied. A change of units converts the weights and sizes already saved on products and renames
  the product attributes to match, so a number never quietly changes meaning.
*/
export const saveShipping = async ({ flatRate, flatRateEnabled, countries, weightUnit, dimensionUnit, combine, origin, processing }) => {
  const before = await readShipping();
  const next = {
    flatRate: flatRate ?? before.flatRate,
    flatRateEnabled: flatRateEnabled ?? before.flatRateEnabled,
    countries: countries ?? before.countries,
    weightUnit: weightUnit ?? before.weightUnit,
    dimensionUnit: dimensionUnit ?? before.dimensionUnit,
    combine: combine ?? before.combine,
    processing: processing === undefined ? before.processing : { countWeekends: processing?.countWeekends, cutoff: typeof processing?.cutoff === 'string' ? processing.cutoff.trim() : processing?.cutoff, timeZone: processing?.timeZone },
    origin: origin === undefined ? before.origin : Object.fromEntries(Object.keys(ORIGIN_SETTINGS).map(key => [key, String(origin?.[key] ?? '').trim()])),
  };

  if(!Number.isSafeInteger(next.flatRate) || next.flatRate < 0 || next.flatRate > MAX_FLAT_RATE){
    return [{ code: 400, msg: 'The flat rate must be a whole number of the smallest currency unit, zero or more' }, null];
  }
  if(typeof next.flatRateEnabled !== 'boolean') return [{ code: 400, msg: 'The flat rate must be on or off' }, null];
  if(!Array.isArray(next.countries) || next.countries.some(code => typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code))){
    return [{ code: 400, msg: 'Countries must be two-letter codes' }, null];
  }
  if(next.weightUnit !== validWeightUnit(next.weightUnit) || next.dimensionUnit !== validDimensionUnit(next.dimensionUnit)){
    return [{ code: 400, msg: 'That is not a unit this store can use' }, null];
  }

  if(typeof next.combine !== 'boolean') return [{ code: 400, msg: 'Combining items must be on or off' }, null];
  if(typeof next.processing.countWeekends !== 'boolean') return [{ code: 400, msg: 'Counting weekends must be on or off' }, null];
  if(next.processing.cutoff !== '' && cutoffMinutes(next.processing.cutoff) === null) return [{ code: 400, msg: 'The order cutoff time must be a time such as 17:00, or blank for none' }, null];
  if(!validTimeZone(next.processing.timeZone)) return [{ code: 400, msg: 'That is not a time zone' }, null];
  next.origin.country = next.origin.country.toUpperCase();
  if(Object.values(next.origin).some(value => value.length > ORIGIN_MAX)) return [{ code: 400, msg: `Each part of the ship-from address must be ${ORIGIN_MAX} characters or fewer` }, null];
  if(next.origin.country && !/^[A-Z]{2}$/.test(next.origin.country)) return [{ code: 400, msg: 'The ship-from country must be a two-letter code' }, null];

  const list = parseCountries(next.countries.join(','));
  const writes = [
    ['shipping_flat_rate', next.flatRate, 'number', 'The flat shipping charge for an order that needs sending, in the smallest currency unit'],
    ['flat_rate_enabled', next.flatRateEnabled, 'boolean', 'Whether an order that boxes and carriers cannot price pays the flat rate. When off, such an order cannot be placed'],
    ['shipping_countries', list.join(','), 'string', 'The countries the store ships physical items to, as two-letter codes separated by commas'],
    ['weight_unit', next.weightUnit, 'string', 'The unit product weights are measured in: oz, lb, g or kg'],
    ['dimension_unit', next.dimensionUnit, 'string', 'The unit product lengths, widths and heights are measured in: in or cm'],
    ['processing_count_weekends', next.processing.countWeekends, 'boolean', 'Whether weekends count towards processing days'],
    ['processing_cutoff', next.processing.cutoff, 'string', 'The time of day (HH:MM) after which today no longer counts towards processing days. Blank for none'],
    ['processing_timezone', next.processing.timeZone, 'string', 'The time zone the cutoff time is in'],
    ['combine_items', next.combine, 'boolean', 'Whether items in an order are put into one box where they fit, instead of one box each'],
    ...Object.entries(ORIGIN_SETTINGS).map(([key, name]) => [name, next.origin[key], 'string', 'Part of the address orders are sent from, which carriers need to quote a rate']),
  ];
  for(const [name, value, type, description] of writes){
    const [error] = await setSetting(OWNER, name, value, type, false, description);
    if(error) return [error, null];
  }

  if(before.weightUnit !== next.weightUnit || before.dimensionUnit !== next.dimensionUnit){
    const [convertError] = await convertProducts({ from: before, to: next });
    if(convertError) return [convertError, null];
    const [boxesError] = await convertAllBoxes(before, next);
    if(boxesError) return [boxesError, null];
    try {
      await registerShippingAttributes(next);
      /* Carrier extensions that keep weights or sizes of their own convert them too. */
      await triggerHook(UNITS_EVENT, { from: { weightUnit: before.weightUnit, dimensionUnit: before.dimensionUnit }, to: { weightUnit: next.weightUnit, dimensionUnit: next.dimensionUnit } }, { bail: true });
    } catch(error) {
      return [{ code: 500, msg: error?.msg || error?.message || 'The units were saved, but something that uses them could not be converted' }, null];
    }
  }
  return [null, { ...next, countries: list }];
};
