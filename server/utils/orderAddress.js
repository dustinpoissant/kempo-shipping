import { setOrderData } from 'kempo-commerce/sdk';
import { checkAddress } from './address.js';

/*
  Staff correcting the address an order is sent to (a typo, a customer who wrote to say it moved). The address is `order.data.shipping`,
  checked the way the checkout checks one, and the change is written to the order's history with who made it. Nothing that
  was already priced is changed: the shipping charge stays as it was, and a label that was already bought keeps its address.
*/
export const changeShippingAddress = async ({ orderId, address, actor }) => {
  const [error, clean] = checkAddress(address);
  if(error) return [error, null];
  const [saveError, data] = await setOrderData(orderId, 'shipping', clean, { actor, summary: 'Shipping address changed' });
  return saveError ? [saveError, null] : [null, data.shipping];
};
