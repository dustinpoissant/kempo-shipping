import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCountries } from '../server/utils/countries.js';

test('the country list is uppercased, de-duplicated, sorted and stripped of anything that is not a two-letter code', () => {
  assert.deepEqual(parseCountries(' us, ca ,US,gb,,France,1x'), ['CA', 'GB', 'US']);
  assert.deepEqual(parseCountries(''), []);
  assert.deepEqual(parseCountries(undefined), []);
});
