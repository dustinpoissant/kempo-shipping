import { getExtension } from 'kempo/server/sdk.js';

/*
  Whether shipping is taxed at an address. kempo-tax answers it (its shippingTax, the same calculation the checkout's
  tax uses), and only when kempo-tax is installed and enabled. Without it shipping is not taxed. An error means the
  answer is unknown, and is returned as one rather than guessed.
*/
export const shippingIsTaxable = async ({ address, currency }) => {
  const [, tax] = await getExtension({ name: 'kempo-tax' });
  if(!tax?.enabled) return [null, false];
  const sdk = await import('kempo-tax/sdk').catch(() => null);
  if(!sdk) return [null, false];
  const [error, answer] = await sdk.shippingTax({ address, currency });
  if(error) return [error, null];
  return [null, answer.taxable];
};
