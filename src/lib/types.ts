export interface Product {
  id: string;
  marca: string;
  modelo: string;
  calidad: string;
  precio: number;
  stock: number;
}

export type ViewMode = 'grid' | 'table';

export type SortOption = 'default' | 'price-asc' | 'price-desc' | 'brand-asc' | 'model-asc';
