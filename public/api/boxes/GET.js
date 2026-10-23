import authorize from '../../../server/utils/authorize.js';
import { readBoxes } from '../../../server/utils/boxRows.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'view');
  if(authError) return response.status(authError.code).json({ error: authError.msg });
  const [error, boxes] = await readBoxes();
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json({ boxes });
};
