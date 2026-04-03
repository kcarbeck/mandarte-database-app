/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ─── Core palette: bold naturalist ───────────────
        forest: {
          50:  '#ecf5ee',
          100: '#d1e7d5',
          200: '#a3cfab',
          300: '#6db57a',
          400: '#3d9a50',
          500: '#1e7a34',   // bold, saturated green
          600: '#186429',
          700: '#134e20',
          800: '#0f3d1a',
          900: '#0a2b12',
        },
        cream: {
          50:  '#fefcf8',
          100: '#faf5ec',
          200: '#f2e8d5',
          300: '#e6d5b8',
          400: '#d4bc94',
        },
        rust: {
          50:  '#fef0ea',
          100: '#fddcce',
          200: '#fab49c',
          300: '#f48862',
          400: '#eb5e30',   // punchy orange-red
          500: '#d14b1f',
          600: '#af3c18',
          700: '#8c3015',
          800: '#6e2712',
        },
        sage: {
          50:  '#f0f6f0',
          100: '#dceadc',
          200: '#b8d5b8',
          300: '#8abb8b',
          400: '#5fa162',
          500: '#41843f',
          600: '#336a33',
          700: '#285428',
          800: '#204420',
        },
        bark: {
          50:  '#f7f4f0',
          100: '#eae4db',
          200: '#d5cab9',
          300: '#b8a68d',
          400: '#9a8468',
          500: '#7d6a51',   // warm brown — readable
          600: '#655543',
          700: '#514437',
          800: '#40372d',
        },
        // ─── Bold accent pops (inspired by inspo) ───────
        pop: {
          coral:  '#e85d75',  // playful pink-coral
          teal:   '#1a9e8f',  // rich teal
          gold:   '#e8a820',  // warm gold
          sky:    '#3b82f6',  // bright blue
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.7rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        'card': '0.75rem',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(14, 34, 22, 0.08), 0 1px 2px rgba(14, 34, 22, 0.05)',
        'card-hover': '0 4px 12px rgba(14, 34, 22, 0.1), 0 2px 4px rgba(14, 34, 22, 0.06)',
        'nav': '0 -2px 10px rgba(14, 34, 22, 0.06)',
        'bold': '0 4px 0 rgba(14, 34, 22, 0.15)',
      },
    },
  },
  plugins: [],
}
