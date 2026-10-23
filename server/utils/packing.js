/*
  Packing an order into the seller's boxes, as pure rules with no imports so they can be tested alone. The result is a list of
  parcels: which box, how many items, and how much it weighs. What a parcel costs to send is a separate question, answered by
  the store's own price table (priceFor) and by any carrier extension (see quotes.js).

  An item is one unit of a product, with its weight and the room it needs inside a box (the product's length, width and
  height, which include any bubble wrap and crush room the seller wants). Sides are kept longest first. A box has inside
  sides and optionally `emptyWeight` (what the box and its padding weigh), `maxWeight` (the most it can hold) and, for the
  store's own pricing, `defaultPrice` and `weights`, tiers of `{ maxWeight, price }`: a parcel that weighs no more than a
  tier's `maxWeight` pays that tier's price, the lightest tier that holds it. A box with no tiers is a flat price, whatever
  the weight (a flat rate box cares only about size). A box with tiers and no default price cannot hold more than its
  heaviest tier, unless `maxWeight` says otherwise.

  Items are packed together as one block: the block of two items stacks them along one side of each, and takes the larger
  of the other two sides, trying every way round and keeping the smallest block. A block goes in the smallest box it fits
  (turning it as needed) that can hold its weight. With combining off every item ships in a box of its own; with it on,
  an item joins a box that already has items whenever the result still fits a box, the one that makes the smallest block
  first. Items that will not all go in one box go in several.
*/
const positive = value => (Number.isFinite(value) && value > 0 ? value : null);

const round = value => Math.round(value * 10000) / 10000;

const volumeOf = sides => sides[0] * sides[1] * sides[2];

const descending = sides => [...sides].sort((a, b) => b - a);

/*
  One item for each unit of each line: lines have `quantity`, `weight`, `length`, `width` and `height` (per unit). A
  product that has no size has `sides: null`, which is unknown and never packed; one with no weight has `weight: null`,
  which only a box without weight tiers can take. Nothing unknown is ever guessed as zero.
*/
export const itemsFor = lines => lines.flatMap(line => Array.from({ length: Math.max(0, Math.trunc(line.quantity) || 0) }, () => {
  const sides = [positive(line.length), positive(line.width), positive(line.height)];
  return { weight: positive(line.weight), sides: sides.includes(null) ? null : descending(sides) };
}));

/*
  Two blocks as one: stack along one side of each, and take the larger of the other two sides (matching them up either
  way round). Every choice is tried and the smallest block wins, the shorter longest side breaking a tie.
*/
export const mergeSides = (a, b) => {
  const turns = sides => sides.map((side, index) => ({ side, rest: sides.filter((_, other) => other !== index) }));
  let best = null;
  for(const x of turns(a)) for(const y of turns(b)) for(const flip of [false, true]){
    const other = flip ? [y.rest[1], y.rest[0]] : y.rest;
    const merged = descending([x.side + y.side, Math.max(x.rest[0], other[0]), Math.max(x.rest[1], other[1])]);
    if(!best || volumeOf(merged) < volumeOf(best) || (volumeOf(merged) === volumeOf(best) && merged[0] < best[0])) best = merged;
  }
  return best;
};

/* Whether a block fits inside a box, turning it as needed: compare the sides longest to shortest. */
export const fitsIn = (blockSides, box) => {
  const inside = descending([box.length, box.width, box.height]);
  return blockSides.every((side, index) => side <= inside[index]);
};

/* The most a box can hold, or null for no limit: its `maxWeight`, else the heaviest tier of a box that has no price for anything heavier. */
export const limitOf = box => {
  if(Number.isFinite(box.maxWeight) && box.maxWeight > 0) return box.maxWeight;
  const tiers = box.weights ?? [];
  if(tiers.length && (box.defaultPrice === null || box.defaultPrice === undefined)) return Math.max(...tiers.map(tier => tier.maxWeight));
  return null;
};

/* Whether a box can hold contents of this weight (null is unknown, which a box with weight tiers cannot take). */
export const canHold = (box, weight) => {
  if(weight === null) return !(box.weights ?? []).length;
  const limit = limitOf(box);
  return limit === null || weight <= limit;
};

/* What the store's own table charges for a parcel of this weight in this box, or null when it has no price for it. */
export const priceFor = (box, weight) => {
  if(weight === null) return (box.weights ?? []).length ? null : (box.defaultPrice ?? null);
  const tier = [...(box.weights ?? [])].sort((a, b) => a.maxWeight - b.maxWeight).find(candidate => weight <= candidate.maxWeight);
  if(tier) return tier.price;
  return box.defaultPrice ?? null;
};

/* The smallest box a block fits that can hold its weight (the cheaper by the store's table breaks a tie), or null. */
export const bestBox = (boxes, sides, weight) => {
  let best = null;
  for(const box of boxes){
    if(!fitsIn(sides, box) || !canHold(box, weight)) continue;
    const volume = box.length * box.width * box.height;
    const price = priceFor(box, weight) ?? Infinity;
    if(!best || volume < best.volume || (volume === best.volume && price < best.price)) best = { box, price, volume };
  }
  return best;
};

/*
  Packs the items: { parcels: [{ box, items, contentsWeight, weight }] }, or null when an item has no size or fits no box
  (the caller then falls back to its flat rate). `contentsWeight` is what the items weigh and `weight` adds the empty box;
  either is null when an item's weight is unknown. Biggest items first.
*/
export const packItems = (items, boxes, { combine = false } = {}) => {
  if(!items.length || !boxes.length || items.some(item => item.sides === null)) return null;
  const groups = [];
  const ordered = [...items].sort((a, b) => volumeOf(b.sides) - volumeOf(a.sides) || (b.weight ?? 0) - (a.weight ?? 0));
  for(const item of ordered){
    const alone = bestBox(boxes, item.sides, item.weight);
    if(!alone) return null;
    let joined = null;
    if(combine){
      groups.forEach((group, index) => {
        const sides = mergeSides(group.sides, item.sides);
        const weight = group.weight === null || item.weight === null ? null : round(group.weight + item.weight);
        const together = bestBox(boxes, sides, weight);
        if(!together) return;
        if(!joined || volumeOf(sides) < volumeOf(joined.sides)) joined = { index, sides, weight, together };
      });
    }
    if(joined){
      const group = groups[joined.index];
      groups[joined.index] = { sides: joined.sides, weight: joined.weight, items: group.items + 1, box: joined.together.box };
    } else {
      groups.push({ sides: item.sides, weight: item.weight, items: 1, box: alone.box });
    }
  }
  const parcels = groups.map(group => ({
    box: group.box,
    items: group.items,
    contentsWeight: group.weight,
    weight: group.weight === null ? null : round(group.weight + (group.box.emptyWeight ?? 0)),
  }));
  return { parcels };
};
