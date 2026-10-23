import { readShipping } from './server/utils/config.js';
import { registerShippingAttributes } from './server/utils/productAttributes.js';
import prepareBoxes from './server/utils/migrate.js';

/*
  The product type that is shipped. kempo-products has only "Generic Product"; this extension adds "Physical Item",
  which needs a shipping address, so a product has to be this type for an order to be sent.
*/
export const registerPhysicalType = async () => {
  const { registerProductType } = await import('kempo-products/sdk');
  const [error] = await registerProductType('kempo-shipping', { key: 'physical', name: 'Physical Item', description: 'Something posted or handed over. The order needs a shipping address', needsShipping: true });
  if(error) throw new Error(error.msg);
};

/*
  Registers the Physical Item product type, and the product attributes every shipping extension reads: the store's flat
  charge for a product, and its weight and size, in the product form's Shipping tab. Weight and size are labelled
  with the store's units.
*/
export default async () => {
  await prepareBoxes();
  await registerPhysicalType();
  await registerShippingAttributes(await readShipping());
  console.log('[kempo-shipping] Installed. Set the store flat rate and the countries you ship to at /admin/extension/kempo-shipping/.');
};
