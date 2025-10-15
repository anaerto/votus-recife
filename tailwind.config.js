/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media', // Força o uso apenas do media query
  theme: {
    extend: {
      colors: {
        'creme-claro': '#ffecc8',
        'cremeclaro': '#ffecc8',
      },
    },
  },
  plugins: [],
}