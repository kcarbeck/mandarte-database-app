/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ─── Core palette: "Field Station Modern" ───
        forest: {
          50:  '#f0f5f1',
          100: '#dce8de',
          200: '#b8d1bc',
          300: '#8ab592',
          400: '#5e9968',
          500: '#3d7a48',
          600: '#2d5e36',
          700: '#1f4427',
          800: '#163320',
          900: '#0e2216',
        },
        cream: {
          50:  '#fdfcfa',
          100: '#faf7f2',
          200: '#f5efe5',
          300: '#ede4d4',
          400: '#ddd0b8',
        },
        rust: {
          50:  '#fdf3ef',
          100: '#fbe4da',
          200: '#f5c4af',
          300: '#ed9d7d',
          400: '#e27650',
          500: '#c45d3e',
          600: '#a44830',
          700: '#833928',
          800: '#6b3025',
        },
        sage: {
          50:  '#f4f7f4',
          100: '#e5ede6',
          200: '#ccdcce',
          300: '#a6c3a9',
          400: '#7ba67f',
          500: '#5a8a5f',
          600: '#466e4b',
          700: '#38583d',
          800: '#2f4733',
        },
        bark: {
          50:  '#f8f6f3',
          100: '#ede8e1',
          200: '#ddd5c8',
          300: '#c7b9a5',
          400: '#b19d82',
          500: '#9a8368',
          600: '#7d6a54',
          700: '#655545',
          800: '#544839',
        },
        // ─── Status colors (high contrast for sunlight) ───
        status: {
          active:  '#2d874a',
          warning: '#d97706',
          danger:  '#dc2626',
          info:    '#2563eb',
          muted:   '#6b7280',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '0.9rem' }],
      },
      borderRadius: {
        'card': '0.75rem',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(14, 34, 22, 0.06), 0 1px 2px rgba(14, 34, 22, 0.04)',
        'card-hover': '0 4px 12px rgba(14, 34, 22, 0.08), 0 2px 4px rgba(14, 34, 22, 0.04)',
        'nav': '0 -2px 10px rgba(14, 34, 22, 0.05)',
      },
    },
  },
  plugins: [],
}
