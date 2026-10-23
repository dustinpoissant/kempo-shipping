/*
  A shipping address, as the customer typed it or as it is copied from billing. Pure: no imports, so it can be
  tested on its own. Every function returns a tuple like everything in server/utils: the result, or the first
  thing wrong with it.
*/
const REQUIRED = ['name', 'line1', 'city', 'postalCode', 'country'];
const LIMITS = { name: 100, line1: 200, line2: 200, city: 100, state: 100, postalCode: 20, country: 2 };
const COPIED = ['name', 'line1', 'line2', 'city', 'state', 'postalCode', 'country'];

export const checkAddress = address => {
  if(!address || typeof address !== 'object' || Array.isArray(address)) return [{ code: 400, msg: 'Enter a shipping address' }, null];
  const clean = {};
  for(const [field, max] of Object.entries(LIMITS)){
    const value = typeof address[field] === 'string' ? address[field].trim() : '';
    if(value.length > max) return [{ code: 400, msg: `The shipping ${field} is too long` }, null];
    clean[field] = value;
  }
  if(REQUIRED.some(field => !clean[field])) return [{ code: 400, msg: 'Enter a shipping address' }, null];
  if(!/^[A-Z]{2}$/.test(clean.country)) return [{ code: 400, msg: 'The shipping country must be a two-letter code' }, null];
  return [null, clean];
};

/*
  The address an order ships to: the one typed, or, when the customer chose "same as billing", a copy of the
  billing address. Copied at the moment of checking, so it always follows billing.
*/
export const resolveAddress = ({ shipping, billing }) => {
  if(shipping?.sameAsBilling === true){
    const copy = {};
    for(const field of COPIED) copy[field] = typeof billing?.[field] === 'string' ? billing[field] : '';
    return checkAddress(copy);
  }
  return checkAddress(shipping);
};
