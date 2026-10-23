import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertWeight, convertLength, validWeightUnit, validDimensionUnit } from '../server/utils/units.js';

test('weights convert between pounds, ounces, grams and kilograms', () => {
  assert.equal(convertWeight(1, 'lb', 'oz'), 16);
  assert.equal(convertWeight(1000, 'g', 'kg'), 1);
  assert.equal(convertWeight(1, 'lb', 'g'), 453.5924);
  assert.equal(convertWeight(2, 'kg', 'kg'), 2);
});

test('lengths convert between inches and centimetres', () => {
  assert.equal(convertLength(10, 'in', 'cm'), 25.4);
  assert.equal(convertLength(25.4, 'cm', 'in'), 10);
});

test('converting there and back gives the number you started with', () => {
  assert.equal(convertWeight(convertWeight(3.5, 'lb', 'g'), 'g', 'lb'), 3.5);
  assert.equal(convertLength(convertLength(12, 'in', 'cm'), 'cm', 'in'), 12);
});

test('an unknown unit falls back to the default', () => {
  assert.equal(validWeightUnit('stone'), 'lb');
  assert.equal(validWeightUnit('kg'), 'kg');
  assert.equal(validDimensionUnit('furlong'), 'in');
  assert.equal(validDimensionUnit('cm'), 'cm');
});
