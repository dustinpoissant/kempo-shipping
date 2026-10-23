import authorize from '../../../server/utils/authorize.js';
import { saveShipping } from '../../../server/utils/config.js';

export default async (request, response) => {
  const [authError] = await authorize(request, 'manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });
  const { flatRate, flatRateEnabled, countries, weightUnit, dimensionUnit, combine, origin, processing } = request.body || {};
  const [error, saved] = await saveShipping({ flatRate, flatRateEnabled, countries, weightUnit, dimensionUnit, combine, origin, processing });
  if(error) return response.status(error.code).json({ error: error.msg });
  response.json(saved);
};
