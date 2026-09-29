/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17251f',
        forest: '#275848',
        leaf: '#dce9df',
        paper: '#f9f8f4',
        citrus: '#e8b84d',
        coral: '#c76e56',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
      boxShadow: {
        soft: '0 18px 60px rgba(23, 37, 31, .10)',
      },
    },
  },
  plugins: [],
};