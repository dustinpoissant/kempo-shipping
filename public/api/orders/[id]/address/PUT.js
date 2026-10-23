import authorize from '../../../../../server/utils/authorize.js';
import { changeShippingAddress } from '../../../../../server/utils/orderAddress.js';

/* Changes the address an order is sent to, from the Shipping tab of the admin order page. */
export default async (request, response) => {
  const [authError, who] = await authorize(request, 'manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });
  const [error, address] = await changeShippingAddress({ orderId: request.params.id, address: request.body?.address, actor: who.userId });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ address });
};
