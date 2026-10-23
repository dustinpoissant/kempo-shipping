import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packItems } from '../server/utils/packing.js';
import { parcelsFor, withStoreQuotes, buildOptions, pickOption, publicOption } from '../server/utils/quotes.js';

const small = { id: 'b1', name: 'Small', length: 7, width: 6, height: 5, emptyWeight: 0.2, defaultPrice: 800, weights: [{ maxWeight: 1, price: 500 }] };
const unpriced = { id: 'b2', owner: 'kempo-usps', ref: 'medium', name: 'Medium', length: 13, width: 11, height: 3, weights: [], defaultPrice: null };
const car = { weight: 0.5, sides: [7, 6, 4] };

const pack = (boxes, items = [car]) => packItems(items, boxes, { combine: false });

test('a parcel is described for a carrier with its box, items, weight and an empty list of quotes', () => {
  const packed = pack([small]);
  const [parcel] = parcelsFor(packed);
  assert.equal(parcel.id, 'parcel-1');
  assert.deepEqual(parcel.box, { id: 'b1', ref: '', owner: '', name: 'Small', length: 7, width: 6, height: 5, emptyWeight: 0.2 });
  assert.equal(parcel.items, 1);
  assert.equal(parcel.contentsWeight, 0.5);
  assert.equal(parcel.weight, 0.7);
  assert.deepEqual(parcel.quotes, []);
});

test('the store table is the first quote of a parcel it can price, and leaves one it cannot alone', () => {
  const packed = pack([small]);
  const [priced] = withStoreQuotes(parcelsFor(packed), packed);
  assert.deepEqual(priced.quotes, [{ carrier: '', service: 'Standard shipping', price: 500 }]);
  const carrierPacked = pack([unpriced], [{ weight: 0.5, sides: [7, 6, 2] }]);
  const [bare] = withStoreQuotes(parcelsFor(carrierPacked), carrierPacked);
  assert.deepEqual(bare.quotes, []);
});

test('every carrier and service with a quote is an option, cheapest first, the store table winning a tie', () => {
  const packed = pack([small]);
  const [parcel] = withStoreQuotes(parcelsFor(packed), packed);
  parcel.quotes.push({ carrier: 'USPS', service: 'Ground Advantage', price: 420, days: 3 }, { carrier: 'USPS', service: 'Priority Mail', price: 900, days: 2 }, { carrier: 'UPS', service: 'Ground', price: 500 });
  const options = buildOptions([parcel]);
  assert.deepEqual(options.map(option => option.label), ['USPS Ground Advantage', 'Standard shipping', 'UPS Ground', 'USPS Priority Mail']);
  assert.equal(options[0].price, 420);
  assert.equal(options[0].days, 3);
  assert.equal(options[2].days, null);
});

test('an option is offered only when every parcel has a quote for it, and its price is the quotes added up', () => {
  const packed = pack([small, unpriced], [car, { weight: 0.5, sides: [12, 10, 2] }]);
  const parcels = withStoreQuotes(parcelsFor(packed), packed);
  const medium = parcels.find(parcel => parcel.box.ref === 'medium');
  const little = parcels.find(parcel => parcel.box.name === 'Small');
  medium.quotes.push({ carrier: 'USPS', service: 'Priority Mail', price: 900, days: 2 }, { carrier: 'USPS', service: 'Express', price: 2500 });
  little.quotes.push({ carrier: 'USPS', service: 'Priority Mail', price: 700, days: 3 });
  const options = buildOptions(parcels);
  assert.deepEqual(options.map(option => [option.label, option.price, option.days]), [['USPS Priority Mail', 1600, 3]]);
  assert.deepEqual(options[0].shipments.map(shipment => [shipment.name, shipment.price, shipment.carrier, shipment.service]).sort(), [['Medium', 900, 'USPS', 'Priority Mail'], ['Small', 700, 'USPS', 'Priority Mail']]);
  assert.deepEqual(Object.keys(options[0].shipments[0]).sort(), ['carrier', 'height', 'items', 'length', 'name', 'price', 'service', 'weight', 'width']);
});

test('a bad quote is ignored, a cheaper duplicate wins, and a parcel with no usable quote leaves no options', () => {
  const bad = { id: 'p', box: { name: 'x' }, quotes: [{ carrier: 'x', price: -1 }, { carrier: 'x', price: 1.5 }, null, { carrier: 'x' }] };
  assert.deepEqual(buildOptions([bad]), []);
  assert.deepEqual(buildOptions([{ id: 'p', box: { name: 'x' }, quotes: 'nope' }]), []);
  assert.deepEqual(buildOptions([]), []);
  const twice = { id: 'q', box: { name: 'x' }, quotes: [{ carrier: 'UPS', service: 'Ground', price: 700 }, { carrier: 'UPS', service: 'Ground', price: 650 }] };
  assert.equal(buildOptions([twice])[0].price, 650);
  assert.deepEqual(buildOptions([twice, bad]), []);
});

test('the option picked is the one with the key, or the cheapest when it is missing or gone', () => {
  const options = buildOptions([{ id: 'p', box: { name: 'x' }, quotes: [{ carrier: 'USPS', service: 'Ground', price: 400 }, { carrier: 'UPS', service: 'Ground', price: 600 }] }]);
  assert.equal(pickOption(options, 'UPS|Ground').price, 600);
  assert.equal(pickOption(options, 'gone|gone').price, 400);
  assert.equal(pickOption(options, null).price, 400);
  assert.equal(pickOption([], 'x'), null);
});

test('what the checkout is told about an option leaves out the shipments', () => {
  const [option] = buildOptions([{ id: 'p', box: { name: 'x' }, quotes: [{ carrier: 'USPS', service: 'Ground', price: 400, days: 3 }] }]);
  assert.deepEqual(publicOption(option), { key: 'USPS|Ground', carrier: 'USPS', service: 'Ground', label: 'USPS Ground', price: 400, days: 3 });
});
