import authorize from '../../../server/utils/authorize.js';
import { replaceBoxes } from '../../../server/utils/boxRows.js';
import { saveShipping } from '../../../server/utils/config.js';

/*
  Replaces the seller's own boxes with the list sent, turns the boxes carriers registered on or off (`carrierBoxes`:
  [{ id, enabled }]), and saves whether items are combined into one box where they fit.
*/
export default async (request, response) => {
  const [authError] = await authorize(request, 'manage');
  if(authError) return response.status(authError.code).json({ error: authError.msg });
  const { boxes, carrierBoxes, combine } = request.body || {};
  const [error, saved] = await replaceBoxes({ boxes, carrierBoxes });
  if(error) return response.status(error.code).json({ error: error.msg });
  const [settingsError, settings] = await saveShipping({ combine });
  if(settingsError) return response.status(settingsError.code).json({ error: settingsError.msg });
  response.json({ boxes: saved, combine: settings.combine });
};
