/*
  Takes the Physical Item product type away with the extension. Products that still have it keep the type (the
  type cannot be removed while they do), and kempo-products treats a type nobody registers as shipped, so nothing
  already sold changes. Uninstalling never fails over it.
*/
export default async () => {
  const { unregisterProductTypes } = await import('kempo-products/sdk');
  const [error] = await unregisterProductTypes('kempo-shipping');
  if(error) console.warn(`[kempo-shipping] The Physical Item product type was kept: ${error.msg}`);
};
