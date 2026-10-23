import type { Metadata } from 'next';
import './labels-print.css';

export const metadata: Metadata = {
  title: 'ETIQUETADOR | EL ARCA DISPLAY CLUB',
  description: 'Crea e imprime etiquetas de identificación para las cajas de displays de EL ARCA DISPLAY CLUB.',
  robots: { index: false, follow: false },
};

export default function EtiquetadorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
