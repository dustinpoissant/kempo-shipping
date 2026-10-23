import authorize from '../../../server/utils/authorize.js';
import { readShipping } from '../../../server/utils/config.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'view');
  if(authError) return response.status(authError.code).json({ error: authError.msg });
  response.json(await readShipping());
};
