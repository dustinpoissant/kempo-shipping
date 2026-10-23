/*
  The units a store measures parcels in, and converting between them. Pure, so it can be tested alone. Weight is
  pounds, ounces, grams or kilograms; size is inches or centimetres. Product weights and sizes are stored in the
  store's units, and carrier extensions read them in those units (the settings say which they are).
*/
export const WEIGHT_UNITS = {
  oz: { label: 'ounces', grams: 28.349523125 },
  lb: { label: 'pounds', grams: 453.59237 },
  g: { label: 'grams', grams: 1 },
  kg: { label: 'kilograms', grams: 1000 },
};

export const DIMENSION_UNITS = {
  in: { label: 'inches', mm: 25.4 },
  cm: { label: 'centimetres', mm: 10 },
};

const round = value => Math.round(value * 10000) / 10000;

export const convertWeight = (value, from, to) => round(value * WEIGHT_UNITS[from].grams / WEIGHT_UNITS[to].grams);

export const convertLength = (value, from, to) => round(value * DIMENSION_UNITS[from].mm / DIMENSION_UNITS[to].mm);

export const validWeightUnit = unit => (unit in WEIGHT_UNITS ? unit : 'lb');

export const validDimensionUnit = unit => (unit in DIMENSION_UNITS ? unit : 'in');
