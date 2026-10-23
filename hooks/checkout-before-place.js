import { needsShipping } from '../server/utils/lines.js';
import { resolveAddress } from '../server/utils/address.js';

/* The address is kept as it was checked, trimmed and copied from billing when that was chosen, in order.data.shipping. */
export default async ({ draft }) => {
  if(!needsShipping(draft.cart.lines)) return;
  const [error, address] = resolveAddress({ shipping: draft.data.shipping, billing: draft.billing });
  if(!error) draft.data.shipping = address;
};
