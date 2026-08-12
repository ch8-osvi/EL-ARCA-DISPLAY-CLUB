import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EL ARCA DISPLAY CLUB | Catálogo Premium de Repuestos y Displays',
  description: 'Explora nuestro catálogo exclusivo de repuestos y pantallas displays de alta calidad para celulares. Samsung, iPhone, Xiaomi, Motorola y más.',
  keywords: 'displays, repuestos celulares, pantallas lcd, oled, incell, samsung, iphone, xiaomi, el arca display club',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} dark`}>
      <body className="bg-[#090A0F] text-white antialiased selection:bg-[#D4AF37] selection:text-black">
        {children}
      </body>
    </html>
  );
}
