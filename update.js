import { readShipping } from './server/utils/config.js';
import { registerShippingAttributes } from './server/utils/productAttributes.js';
import { registerPhysicalType } from './install.js';
import prepareBoxes from './server/utils/migrate.js';

/* Updating makes sure the boxes table has what carriers need (and absorbs the old kempo-shipping-boxes extension), the Physical Item type and the product attributes exist, labelled with the current units. Registration changes nothing that is already right. */
export default async () => {
  await prepareBoxes();
  await registerPhysicalType();
  await registerShippingAttributes(await readShipping());
};
