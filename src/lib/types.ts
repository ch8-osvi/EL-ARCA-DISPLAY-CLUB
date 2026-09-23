export interface Product {
  id: string;
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isTopSeller?: boolean;
  salesCount?: number;
}

export type ViewMode = 'grid' | 'table';

export type Currency = 'USD' | 'CUP';

export type SortOption = 'default' | 'price-asc' | 'price-desc' | 'brand-asc' | 'model-asc';
