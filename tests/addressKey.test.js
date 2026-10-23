import { test } from 'node:test';
import assert from 'node:assert/strict';
import addressKey, { ADDRESS_KEY_FIELDS } from '../public/utils/addressKey.js';

const address = { name: 'Dustin', line1: '74 S Main St', line2: '', city: 'Saint Albans City', state: 'VT', postalCode: '05478', country: 'US' };

test('the same address always has the same key, whatever the case or spacing', () => {
  assert.equal(addressKey(address), addressKey({ ...address, line1: ' 74 s MAIN st ', city: 'saint albans city ' }));
  assert.equal(addressKey(address), addressKey({ ...address, name: 'Somebody else', phone: '1' }), 'the name does not change where it goes');
});

test('any part of where it goes changes the key', () => {
  for(const field of ADDRESS_KEY_FIELDS) assert.notEqual(addressKey(address), addressKey({ ...address, [field]: `${address[field]}x` }), field);
});

test('a missing address, or one with parts missing, still has a key that is not the finished one', () => {
  assert.equal(typeof addressKey(undefined), 'string');
  assert.notEqual(addressKey({ ...address, postalCode: '' }), addressKey(address));
  assert.equal(addressKey(null), addressKey({}));
});
