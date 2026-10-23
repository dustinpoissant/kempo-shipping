import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsFor, mergeSides, fitsIn, limitOf, canHold, priceFor, bestBox, packItems } from '../server/utils/packing.js';

const small = { name: 'Small', length: 7, width: 6, height: 5, defaultPrice: 800, weights: [{ maxWeight: 1, price: 500 }, { maxWeight: 3, price: 650 }] };
const big = { name: 'Big', length: 13, width: 8, height: 6, defaultPrice: 1400, weights: [{ maxWeight: 5, price: 1100 }] };
const flatRate = { name: 'Flat rate', length: 12, width: 12, height: 5.5, defaultPrice: 1000, weights: [] };

const car = { weight: 1, sides: [7, 6, 5] };

/* What the store's own table charges for every parcel, added up. */
const total = packed => packed.parcels.reduce((sum, parcel) => sum + priceFor(parcel.box, parcel.weight), 0);

test('each unit bought is an item, with sides longest first, and a missing size or weight is unknown, not zero', () => {
  const items = itemsFor([{ quantity: 2, weight: 1.5, length: 5, width: 9, height: 2 }, { quantity: 1, weight: null, length: null, width: null, height: null }]);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { weight: 1.5, sides: [9, 5, 2] });
  assert.deepEqual(items[2], { weight: null, sides: null });
});

test('two blocks merge by stacking along the sides that make the smallest block', () => {
  assert.deepEqual(mergeSides([7, 6, 5], [7, 6, 5]), [10, 7, 6]);
  assert.deepEqual(mergeSides([5, 4, 3], [5, 4, 3]), [6, 5, 4]);
  assert.deepEqual(mergeSides([7, 6, 5], [6, 6, 6]), [11, 7, 6]);
});

test('merging is the same whichever block comes first', () => {
  assert.deepEqual(mergeSides([9, 4, 2], [5, 5, 3]), mergeSides([5, 5, 3], [9, 4, 2]));
});

test('a block fits a box if it does turned any way, comparing longest to shortest', () => {
  assert.equal(fitsIn([6, 5, 4], small), true);
  assert.equal(fitsIn([8, 5, 4], small), false);
  assert.equal(fitsIn([5, 6, 7], small), false);
});

test('the weight tier is the lightest one that holds the parcel, then the default, then none', () => {
  assert.equal(priceFor(small, 0.5), 500);
  assert.equal(priceFor(small, 1), 500);
  assert.equal(priceFor(small, 2), 650);
  assert.equal(priceFor(small, 10), 800);
  assert.equal(priceFor({ ...small, defaultPrice: null }, 10), null);
  assert.equal(priceFor(flatRate, 99), 1000);
  assert.equal(priceFor({ length: 5, width: 5, height: 5 }, 1), null);
});

test('what a box can hold is its own limit, else its heaviest tier when nothing heavier has a price, else no limit', () => {
  assert.equal(limitOf({ ...small, maxWeight: 20 }), 20);
  assert.equal(limitOf({ ...small, defaultPrice: null }), 3);
  assert.equal(limitOf(small), null);
  assert.equal(limitOf(flatRate), null);
  assert.equal(canHold({ ...small, maxWeight: 2 }, 3), false);
  assert.equal(canHold({ ...small, maxWeight: 2 }, 2), true);
  assert.equal(canHold(small, null), false);
  assert.equal(canHold(flatRate, null), true);
  assert.equal(canHold({ length: 5, width: 5, height: 5 }, null), true);
});

test('the smallest box that fits and can take the weight is chosen', () => {
  assert.equal(bestBox([big, small], [7, 6, 5], 1).box.name, 'Small');
  assert.equal(bestBox([big, small], [10, 7, 6], 2).box.name, 'Big');
  assert.equal(bestBox([small, { ...big, defaultPrice: null, weights: [{ maxWeight: 5, price: 1100 }] }], [10, 7, 6], 9), null);
  assert.equal(bestBox([{ ...small, maxWeight: 2 }, big], [7, 6, 5], 3).box.name, 'Big');
});

test('with combining off every item ships in its own box', () => {
  const packed = packItems([car, car], [small, big], { combine: false });
  assert.equal(packed.parcels.length, 2);
  assert.equal(total(packed), 500 + 500);
});

test('your model cars: one fits the small box, and two (with the room they need) go in the big one', () => {
  const one = packItems([car], [small, big], { combine: true });
  assert.equal(one.parcels[0].box.name, 'Small');
  const two = packItems([car, car], [small, big], { combine: true });
  assert.equal(two.parcels.length, 1);
  assert.equal(two.parcels[0].box.name, 'Big');
  assert.equal(total(two), 1100);
});

test('with combining on, items that fit one box go in it, whatever the prices', () => {
  const dear = { ...big, weights: [{ maxWeight: 5, price: 3000 }], defaultPrice: 3000 };
  const packed = packItems([car, car], [small, dear], { combine: true });
  assert.equal(packed.parcels.length, 1);
  assert.equal(total(packed), 3000);
});

test('when the items will not all go in one box they go in several', () => {
  const packed = packItems([car, car, car, car, car, car], [small, big], { combine: true });
  assert.ok(packed.parcels.length > 1);
  assert.equal(packed.parcels.reduce((sum, parcel) => sum + parcel.items, 0), 6);
});

test('an item that fits no box gives nothing, so the flat rate stays', () => {
  assert.equal(packItems([{ weight: 1, sides: [40, 30, 20] }], [small, big], { combine: true }), null);
  assert.equal(packItems([car], [], { combine: true }), null);
  assert.equal(packItems([], [small], { combine: true }), null);
});

test('a flat rate box charges the same whatever the weight, and only size decides', () => {
  const packed = packItems([{ weight: 40, sides: [10, 10, 4] }], [flatRate], { combine: false });
  assert.equal(total(packed), 1000);
});

test('a product with no size is never packed, so the order falls back to the flat rate', () => {
  assert.equal(packItems(itemsFor([{ quantity: 1, weight: 1, length: null, width: 5, height: 5 }]), [small, big], { combine: true }), null);
  assert.equal(packItems([car, { weight: 1, sides: null }], [small, big], { combine: true }), null);
});

test('a product with no weight can only go in a box without weight tiers', () => {
  const noWeight = { weight: null, sides: [4, 3, 2] };
  assert.equal(packItems([noWeight], [small, big], { combine: false }), null);
  const packed = packItems([noWeight], [small, big, flatRate], { combine: false });
  assert.equal(packed.parcels[0].box.name, 'Flat rate');
  assert.equal(packed.parcels[0].weight, null);
  assert.equal(total(packed), 1000);
});

test('an unknown weight stays unknown when items are combined', () => {
  const packed = packItems([{ weight: null, sides: [4, 3, 2] }, { weight: 2, sides: [4, 3, 2] }], [{ name: 'Flat', length: 12, width: 12, height: 12, defaultPrice: 700, weights: [] }], { combine: true });
  assert.equal(packed.parcels[0].weight, null);
  assert.equal(packed.parcels[0].contentsWeight, null);
});

test('a parcel weighs its items plus the empty box', () => {
  const padded = { ...small, emptyWeight: 0.4 };
  const packed = packItems([{ weight: 1, sides: [5, 4, 3] }], [padded], { combine: false });
  assert.equal(packed.parcels[0].contentsWeight, 1);
  assert.equal(packed.parcels[0].weight, 1.4);
  assert.equal(priceFor(padded, packed.parcels[0].weight), 650);
});

test('a box a carrier prices needs no price of its own, and its limit still decides what goes in it', () => {
  const carrierBox = { name: 'Carrier box', length: 10, width: 8, height: 6, maxWeight: 4, weights: [], defaultPrice: null };
  assert.equal(packItems([{ weight: 2, sides: [6, 5, 4] }], [carrierBox], { combine: false }).parcels[0].box.name, 'Carrier box');
  assert.equal(packItems([{ weight: 5, sides: [6, 5, 4] }], [carrierBox], { combine: false }), null);
});
