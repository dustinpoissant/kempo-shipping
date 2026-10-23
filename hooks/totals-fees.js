import { needsShipping } from '../server/utils/lines.js';
import { resolveAddress } from '../server/utils/address.js';
import { quoteShipping } from '../server/utils/rates.js';
import addressKey from '../public/utils/addressKey.js';
import { shippingIsTaxable } from '../server/utils/tax.js';

/*
  kempo-commerce asks for fees while it works out a checkout's totals. Shipping is one fee for the order, added only
  at checkout (the cart does not know the address yet) and only when something in it needs sending. A charge that
  cannot be worked out is left out here; placing the order refuses it, so nobody is charged a guess.
*/
export default async ({ lines, adjustments, checkout, currency }) => {
  if(!checkout || !needsShipping(lines ?? [])) return;
  const [addressError, address] = resolveAddress({ shipping: checkout.data?.shipping, billing: checkout.billing });
  /* Carriers are only asked once the checkout page says this exact address is finished (see public/utils/addressKey.js). */
  const ready = !addressError && checkout.data?.shippingKey === addressKey(address);
  const [rateError, charge] = await quoteShipping({ lines, address: addressError ? null : address, currency, choice: checkout.data?.shippingOption, ready });
  if(rateError || !charge) return;
  const [taxError, taxable] = addressError ? [null, false] : await shippingIsTaxable({ address, currency });
  /* What was worked out is kept with the fee, so the order can show later which box was chosen and from what sizes. */
  const { method, products: productCharges, store, units, lines: sized, shipments, options, selected } = charge;
  adjustments.push({ type: 'fee', code: 'shipping', label: 'Shipping', amount: charge.amount, lineId: null, taxable: !taxError && taxable, source: 'kempo-shipping', data: { method, products: productCharges, store, units, lines: sized, shipments, options, selected } });
};
