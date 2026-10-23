import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBox, cleanBoxes, cleanCarrierBox, convertBoxes } from '../server/utils/boxes.js';
import { convertWeight, convertLength } from '../server/utils/units.js';

const good = { name: ' Small ', length: '7', width: 6, height: 5, defaultPrice: 800, weights: [{ maxWeight: 3, price: 650 }, { maxWeight: 1, price: 500 }] };

test('a box is checked, and its weights are sorted lightest first', () => {
  const [error, rows] = cleanBoxes([good]);
  assert.equal(error, null);
  assert.equal(rows[0].name, 'Small');
  assert.equal(rows[0].length, 7);
  assert.deepEqual(rows[0].weights.map(tier => tier.maxWeight), [1, 3]);
  assert.equal(rows[0].position, 0);
  assert.equal(rows[0].emptyWeight, 0);
  assert.equal(rows[0].maxWeight, null);
});

test('a box needs a size, but no price: a carrier can price the parcels', () => {
  assert.equal(cleanBoxes([{ ...good, length: 0 }])[0].code, 400);
  assert.equal(cleanBoxes([{ ...good, width: '' }])[0].code, 400);
  const [error, rows] = cleanBoxes([{ name: 'No price', length: 5, width: 5, height: 5 }]);
  assert.equal(error, null);
  assert.equal(rows[0].defaultPrice, null);
  assert.deepEqual(rows[0].weights, []);
});

test('the weight of the empty box and the most it can hold are optional, and cannot be negative or zero', () => {
  const [, rows] = cleanBoxes([{ ...good, emptyWeight: '0.4', maxWeight: 20 }]);
  assert.equal(rows[0].emptyWeight, 0.4);
  assert.equal(rows[0].maxWeight, 20);
  assert.equal(cleanBoxes([{ ...good, emptyWeight: -1 }])[0].code, 400);
  assert.equal(cleanBoxes([{ ...good, maxWeight: 0 }])[0].code, 400);
});

test('prices must be whole amounts, and a weight cannot be listed twice', () => {
  assert.equal(cleanBoxes([{ ...good, defaultPrice: 8.5 }])[0].code, 400);
  assert.equal(cleanBoxes([{ ...good, weights: [{ maxWeight: 1, price: 500.5 }] }])[0].code, 400);
  assert.equal(cleanBoxes([{ ...good, weights: [{ maxWeight: 1, price: 500 }, { maxWeight: 1, price: 600 }] }])[0].code, 400);
  assert.equal(cleanBoxes([{ ...good, weights: [{ maxWeight: 0, price: 500 }] }])[0].code, 400);
});

test('the list has to be a list, within a limit', () => {
  assert.equal(cleanBoxes('no')[0].code, 400);
  assert.equal(cleanBoxes(Array.from({ length: 101 }, () => good))[0].code, 400);
  assert.deepEqual(cleanBoxes([])[1], []);
});

test('a single box reports errors under the name it is given', () => {
  assert.match(cleanBox({ ...good, length: 0 }, 'Box "x"')[0].msg, /^Box "x":/);
});

test('a carrier box is converted from the carrier units to the store units and has no prices', () => {
  const [error, row] = cleanCarrierBox({ ref: 'medium', name: 'Medium', length: 13, width: 11, height: 3, emptyWeight: 1, maxWeight: 70 }, { weightUnit: 'lb', dimensionUnit: 'in' }, { weightUnit: 'kg', dimensionUnit: 'cm' }, { weight: convertWeight, length: convertLength });
  assert.equal(error, null);
  assert.equal(row.ref, 'medium');
  assert.ok(Math.abs(row.length - 33.02) < 0.01);
  assert.ok(Math.abs(row.emptyWeight - 0.4536) < 0.001);
  assert.ok(Math.abs(row.maxWeight - 31.75) < 0.01);
  assert.equal(row.defaultPrice, undefined);
  assert.equal(cleanCarrierBox({ name: 'No ref', length: 1, width: 1, height: 1 }, { weightUnit: 'lb', dimensionUnit: 'in' }, { weightUnit: 'lb', dimensionUnit: 'in' }, { weight: convertWeight, length: convertLength })[0].code, 400);
});

test('converting units changes sizes and weights and keeps prices', () => {
  const converted = convertBoxes([{ id: 'b', length: 10, width: 5, height: 2, emptyWeight: 1, maxWeight: 10, defaultPrice: 800, weights: [{ maxWeight: 2, price: 500 }] }], { weightUnit: 'lb', dimensionUnit: 'in' }, { weightUnit: 'oz', dimensionUnit: 'cm' }, { weight: convertWeight, length: convertLength });
  assert.ok(Math.abs(converted[0].length - 25.4) < 0.01);
  assert.ok(Math.abs(converted[0].emptyWeight - 16) < 0.01);
  assert.ok(Math.abs(converted[0].maxWeight - 160) < 0.1);
  assert.ok(Math.abs(converted[0].weights[0].maxWeight - 32) < 0.01);
  assert.equal(converted[0].weights[0].price, 500);
  assert.equal(converted[0].defaultPrice, 800);
  assert.equal(converted[0].id, 'b');
});
