import type { Config } from 'tailwindcss';

// Palette + type tokens ported verbatim from static/styles.css :root so Tailwind
// utilities and the ported component CSS share one source of truth.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#003057',
        blue: '#0057B8',
        cyan: '#009FDF',
        green: '#00843D',
        lime: '#84BD00',
        paper: '#F7F9FB',
        line: '#E4E9EF',
        line2: '#D6DCE3',
        g100: '#ECEFF2',
        g300: '#B3BBC4',
        g500: '#6B7480',
        g700: '#3C4755',
      },
      fontFamily: {
        sans: ['var(--font-open-sans)', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['var(--font-work-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
