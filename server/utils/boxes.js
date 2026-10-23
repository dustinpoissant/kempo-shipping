/*
  The checks on a list of boxes, and converting it to new units. Pure, so they can be tested alone.

  A box is the seller's own (a name, an inside size, what the empty box weighs, the most it can hold, and the store's own
  prices by weight) or one a carrier extension registered (see registerBoxes in sdk.js), which the seller can only turn on
  or off. `weights` is a list of `{ maxWeight, price }` tiers and `defaultPrice` what anything heavier (or, with no tiers,
  every weight) costs: the store's own table, used when no carrier quotes lower. A box needs no price at all when a carrier
  extension prices the parcels.
*/
const MAX_BOXES = 100;
const MAX_TIERS = 50;
const MAX_PRICE = 1000000000;

const price = value => (value === null || value === undefined || value === '' ? [null, null] : (Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRICE ? [null, value] : [true, null]));

const size = (value, label, row) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? [null, number] : [{ code: 400, msg: `${row}: the ${label} must be more than zero` }, null];
};

const optionalWeight = (value, label, row) => {
  if(value === null || value === undefined || value === '') return [null, null];
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? [null, number] : [{ code: 400, msg: `${row}: the ${label} must be more than zero, or blank` }, null];
};

/* Checks one box's size, weights and prices, and returns the row to store. `row` is how it is named in an error. */
export const cleanBox = (box, row) => {
  const name = String(box?.name ?? '').trim();
  if(name.length > 100) return [{ code: 400, msg: `${row}: the name must be 100 characters or fewer` }, null];
  const clean = { name };
  for(const key of ['length', 'width', 'height']){
    const [error, value] = size(box?.[key], key, row);
    if(error) return [error, null];
    clean[key] = value;
  }
  const [emptyError, emptyWeight] = box?.emptyWeight === undefined || box?.emptyWeight === null || box?.emptyWeight === '' ? [null, 0] : (Number.isFinite(Number(box.emptyWeight)) && Number(box.emptyWeight) >= 0 ? [null, Number(box.emptyWeight)] : [{ code: 400, msg: `${row}: the weight of the empty box must be zero or more` }, null]);
  if(emptyError) return [emptyError, null];
  clean.emptyWeight = emptyWeight;
  const [limitError, maxWeight] = optionalWeight(box?.maxWeight, 'most it can hold', row);
  if(limitError) return [limitError, null];
  clean.maxWeight = maxWeight;

  const [defaultError, defaultPrice] = price(box?.defaultPrice);
  if(defaultError) return [{ code: 400, msg: `${row}: the price for any weight must be a whole number of the smallest currency unit, or blank` }, null];
  clean.defaultPrice = defaultPrice;
  const tiers = Array.isArray(box?.weights) ? box.weights : [];
  if(tiers.length > MAX_TIERS) return [{ code: 400, msg: `${row}: there can be at most ${MAX_TIERS} weights` }, null];
  const weights = [];
  for(const tier of tiers){
    const maxTier = Number(tier?.maxWeight);
    if(!Number.isFinite(maxTier) || maxTier <= 0) return [{ code: 400, msg: `${row}: a weight must be more than zero` }, null];
    if(!Number.isSafeInteger(tier?.price) || tier.price < 0 || tier.price > MAX_PRICE) return [{ code: 400, msg: `${row}: the price for ${maxTier} must be a whole number of the smallest currency unit` }, null];
    if(weights.some(existing => existing.maxWeight === maxTier)) return [{ code: 400, msg: `${row}: the weight ${maxTier} is listed twice` }, null];
    weights.push({ maxWeight: maxTier, price: tier.price });
  }
  clean.weights = weights.sort((a, b) => a.maxWeight - b.maxWeight);
  return [null, clean];
};

/* Checks the whole list as sent by the screen, and returns the rows to store, in order. */
export const cleanBoxes = boxes => {
  if(!Array.isArray(boxes)) return [{ code: 400, msg: 'The boxes must be a list' }, null];
  if(boxes.length > MAX_BOXES) return [{ code: 400, msg: `There can be at most ${MAX_BOXES} boxes` }, null];
  const rows = [];
  for(const [index, box] of boxes.entries()){
    const [error, row] = cleanBox(box, `Box ${index + 1}`);
    if(error) return [error, null];
    rows.push({ ...row, position: index });
  }
  return [null, rows];
};

/*
  A carrier's box, given in the units the carrier works in and converted to the store's: `{ ref, name, length, width,
  height, emptyWeight?, maxWeight? }`. `ref` is the carrier's own name for it, and is how a later registration finds it.
*/
export const cleanCarrierBox = (box, units, to, convert) => {
  const ref = String(box?.ref ?? '').trim();
  if(!ref || ref.length > 100) return [{ code: 400, msg: 'A box needs a ref of 100 characters or fewer' }, null];
  const [error, clean] = cleanBox({ ...box, defaultPrice: null, weights: [] }, `Box "${ref}"`);
  if(error) return [error, null];
  const length = value => convert.length(value, units.dimensionUnit, to.dimensionUnit);
  const weight = value => convert.weight(value, units.weightUnit, to.weightUnit);
  return [null, {
    ref,
    name: clean.name || ref,
    length: length(clean.length),
    width: length(clean.width),
    height: length(clean.height),
    emptyWeight: weight(clean.emptyWeight),
    maxWeight: clean.maxWeight === null ? null : weight(clean.maxWeight),
  }];
};

/* The boxes in other units, for when the store changes them. `convert` is { weight, length }, each (value, from, to) => value. Prices stay. */
export const convertBoxes = (boxes, from, to, convert) => boxes.map(box => ({
  ...box,
  length: convert.length(box.length, from.dimensionUnit, to.dimensionUnit),
  width: convert.length(box.width, from.dimensionUnit, to.dimensionUnit),
  height: convert.length(box.height, from.dimensionUnit, to.dimensionUnit),
  emptyWeight: convert.weight(box.emptyWeight ?? 0, from.weightUnit, to.weightUnit),
  maxWeight: box.maxWeight === null || box.maxWeight === undefined ? null : convert.weight(box.maxWeight, from.weightUnit, to.weightUnit),
  weights: (box.weights ?? []).map(tier => ({ ...tier, maxWeight: convert.weight(tier.maxWeight, from.weightUnit, to.weightUnit) })),
}));
