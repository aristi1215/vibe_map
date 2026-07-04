/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        accent: {
          DEFAULT: '#7c6cff',
          soft: '#9a8dff',
          ink: '#0a0a0f',
        },
      },
      boxShadow: {
        panel: '0 20px 60px -20px rgba(0,0,0,0.7), 0 2px 8px -2px rgba(0,0,0,0.5)',
        soft: '0 8px 30px -12px rgba(0,0,0,0.6)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
