/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: "#F3E0A9",
          500: "#E5C158",
          600: "#D4AF37",
          700: "#AA8826",
          800: "#806318",
        },
        champagne: {
          100: "#FAF7F2",
          200: "#F3EFEA",
          300: "#E8DFD8",
          400: "#D4C7BC",
        },
        obsidian: {
          900: "#090A0F",
          800: "#10131E",
          700: "#171B2B",
          600: "#22273D",
        }
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'gold-glow': '0 0 25px -5px rgba(212, 175, 55, 0.25)',
        'gold-glow-lg': '0 0 35px -5px rgba(212, 175, 55, 0.4)',
        'card-dark': '0 10px 30px -10px rgba(0, 0, 0, 0.7)',
      }
    },
  },
  plugins: [],
};
