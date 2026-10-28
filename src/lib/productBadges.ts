export const NEW_ARRIVAL_DAYS = 14;
export const LOW_STOCK_THRESHOLD = 2;

/** Shared public rules: future dates, unavailable products and invalid dates are never promotions. */
export function getProductBadges(
  product: {
    stock: number;
    isTopSeller?: boolean;
    createdAt?: string | Date;
  },
  now = Date.now(),
) {
  const available = Number.isSafeInteger(product.stock) && product.stock > 0;
  const created = product.createdAt
    ? new Date(product.createdAt).getTime()
    : NaN;
  const age = now - created;
  return {
    isTopSeller: available && product.isTopSeller === true,
    isLowStock: available && product.stock <= LOW_STOCK_THRESHOLD,
    isNewArrival:
      available &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < NEW_ARRIVAL_DAYS * 86400000,
  };
}
