/*
  A short text that stands for a shipping address, the same in the browser and on the server (this file is served at
  /shipping/utils/addressKey.js and imported by the hooks), so the two can say "this is the address the customer finished".

  The checkout page sends the key of the address when the customer has filled in every required field and left the last one
  (see components/ShippingAddress.js). Paid carrier rate requests are made only for an address whose key matches, so
  nothing is asked of a carrier while somebody is still typing.
*/
export const ADDRESS_KEY_FIELDS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country'];

export default address => ADDRESS_KEY_FIELDS.map(field => String(address?.[field] ?? '').trim().toLowerCase()).join('|');
