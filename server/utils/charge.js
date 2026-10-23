/*
  The flat charge for an order, as pure rules with no imports so they can be tested alone.

  A product's own charge is in the smallest currency unit, or null when it has none: a blank product attribute means the
  store's rate, and 0 is free. Each unit of a line whose product sets a charge pays it. The store's rate is paid once
  for the order if any line that needs sending has no charge of its own. The result is split into those two parts so
  a carrier extension can replace the store's part (the lines it would have priced) and keep the products' own charges.
*/
const ATTRIBUTE = 'shippingrate';

export const productRate = product => {
  const value = product?.attributes?.[ATTRIBUTE];
  if(value === null || value === undefined || value === '') return null;
  const rate = Number(value);
  return Number.isSafeInteger(rate) && rate >= 0 ? rate : null;
};

/* A product's weight and size in the store's units, each a number or null when the product has none. */
export const productParcel = product => {
  const read = key => {
    const value = product?.attributes?.[key];
    if(value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  return { weight: read('weight'), length: read('length'), width: read('width'), height: read('height'), processingDays: read('processingdays') };
};

export const chargeParts = ({ lines, flatRate }) => {
  const shipping = lines.filter(line => line.needsShipping !== false);
  const products = shipping.reduce((sum, line) => (line.rate === null ? sum : sum + line.rate * line.quantity), 0);
  const store = shipping.some(line => line.rate === null) ? flatRate : 0;
  return { products, store, amount: products + store };
};

export const chargeFor = input => chargeParts(input).amount;
