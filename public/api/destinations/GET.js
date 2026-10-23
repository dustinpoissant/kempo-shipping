import { readShipping } from '../../../server/utils/config.js';

/* The countries physical items ship to, for the checkout's country list. Public: the checkout needs it before anyone signs in. */
export default async (request, response) => {
  const { countries } = await readShipping();
  response.json({ countries });
};
