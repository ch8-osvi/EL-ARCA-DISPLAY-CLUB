import { Product } from './types';

/**
 * Returns the canonical brand grouping name for consistency across the entire app
 */
export const getCanonicalBrand = (brand: string): string => {
  const b = (brand || '').toUpperCase().trim();
  if (!b) return 'OTROS';
  if (b.includes('SAMSUNG')) return 'SAMSUNG';
  if (b.includes('IPHONE') || b.includes('APPLE')) return 'IPHONE';
  if (b.includes('MOTOROLA') || b.includes('MOTO')) return 'MOTOROLA';
  if (b.includes('XIAOMI') || b.includes('REDMI') || b.includes('POCO')) return 'XIAOMI';
  if (b.includes('HUAWEI') || b.includes('HONOR') || b.includes('NOVA')) return 'HUAWEI / HONOR / NOVA';
  if (b.includes('INFINIX') || b.includes('TECNO') || b.includes('ITEL')) return 'INFINIX / TECNO / ITEL';
  if (
    b.includes('OPPO') ||
    b.includes('REALME') ||
    b.includes('RENO') ||
    b.includes('ONEPLUS') ||
    b.includes('ONE PLUS') ||
    b.includes('NARZO')
  )
    return 'OPPO / REALME / RENO / ONEPLUS';
  if (b.includes('ZTE') || b.includes('NUBIA')) return 'ZTE / NUBIA';
  if (b.includes('TCL') || b.includes('ALCATEL')) return 'TCL / ALCATEL';
  if (b.includes('LG')) return 'LG';
  if (b.includes('VIVO')) return 'VIVO';
  if (b.includes('BLACKVIEW')) return 'BLACKVIEW';
  if (b.includes('NOKIA')) return 'NOKIA';
  return b;
};

/**
 * Computes product counts per canonical brand
 */
export const getBrandCounts = (items: { marca: string; stock?: number }[]): Map<string, number> => {
  const counts = new Map<string, number>();
  items.forEach((p) => {
    if (p.marca) {
      const canonical = getCanonicalBrand(p.marca);
      counts.set(canonical, (counts.get(canonical) || 0) + 1);
    }
  });
  return counts;
};

/**
 * Returns unique brands sorted in descending order of product quantity (majority first)
 */
export const getSortedBrands = (items: { marca: string; stock?: number }[]): string[] => {
  const brandCounts = getBrandCounts(items);
  return Array.from(brandCounts.keys()).sort(
    (a, b) => (brandCounts.get(b) || 0) - (brandCounts.get(a) || 0)
  );
};

/**
 * Flexible matching for brand filters, including slash-separated groups
 */
export const matchBrandFilter = (productMarca: string, selectedBrand: string): boolean => {
  if (selectedBrand === 'ALL') return true;
  const pm = (productMarca || '').toUpperCase();
  const fb = selectedBrand.toUpperCase();
  const filterComponents = fb.split('/').map((s) => s.trim());
  return filterComponents.some((comp) => pm.includes(comp));
};

/**
 * Sorts products by:
 * 1. Brand Frequency (Descending - brands with most products first)
 * 2. Brand Name (Alphabetical)
 * 3. Model Name (Alphabetical)
 */
export const sortProductsByPopularity = <T extends { marca: string; modelo: string }>(
  items: T[],
  brandCounts?: Map<string, number>
): T[] => {
  const counts = brandCounts || getBrandCounts(items);
  return [...items].sort((a, b) => {
    const countA = counts.get(getCanonicalBrand(a.marca)) || 0;
    const countB = counts.get(getCanonicalBrand(b.marca)) || 0;

    if (countA !== countB) {
      return countB - countA; // Most models first
    }

    const brandCompare = a.marca.localeCompare(b.marca);
    if (brandCompare !== 0) return brandCompare;

    return a.modelo.localeCompare(b.modelo);
  });
};
