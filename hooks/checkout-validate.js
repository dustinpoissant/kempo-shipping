import { needsShipping } from '../server/utils/lines.js';
import { resolveAddress } from '../server/utils/address.js';
import { readShipping } from '../server/utils/config.js';
import { quoteShipping } from '../server/utils/rates.js';
import addressKey from '../public/utils/addressKey.js';
import { shippingIsTaxable } from '../server/utils/tax.js';

/*
  An order that needs sending must have a shipping address to a country the store ships to, and its charge and tax
  must be workable. This is where a country the store does not ship to is refused.
*/
export default async ({ cart, billing, data, errors }) => {
  if(!needsShipping(cart.lines)) return;
  const [addressError, address] = resolveAddress({ shipping: data?.shipping, billing });
  if(addressError) return errors.push({ field: 'shipping', msg: addressError.msg });
  const { countries } = await readShipping();
  if(!countries.includes(address.country)){
    return errors.push({ field: 'shipping', msg: countries.length
      ? `We do not ship physical items to ${address.country}. Use another shipping address, or remove the items that need posting.`
      : 'Shipping is not set up for this store yet, so physical items cannot be ordered.' });
  }
  const [rateError] = await quoteShipping({ lines: cart.lines, address, currency: cart.currency, choice: data?.shippingOption, ready: data?.shippingKey === addressKey(address) });
  if(rateError) return errors.push({ field: 'shipping', msg: rateError.msg });
  const [taxError] = await shippingIsTaxable({ address, currency: cart.currency });
  if(taxError) errors.push({ field: 'shipping', msg: `Shipping tax could not be worked out: ${taxError.msg}` });
};
