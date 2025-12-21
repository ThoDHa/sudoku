/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic colors - reference CSS variables set by ThemeContext
        background: 'var(--bg)',
        'background-secondary': 'var(--bg-secondary)',
        foreground: 'var(--text)',
        'foreground-muted': 'var(--text-muted)',
        
        // Board colors
        board: {
          bg: 'var(--board-bg)',
          border: 'var(--border-strong)',
          'border-light': 'var(--border-light)',
        },
        
        // Cell colors
        cell: {
          bg: 'var(--cell-bg)',
          given: 'var(--cell-given)',
          hover: 'var(--cell-hover)',
          selected: 'var(--cell-selected)',
          peer: 'var(--cell-peer)',
          primary: 'var(--cell-primary)',
          secondary: 'var(--cell-secondary)',
        },
        
        // Text colors for cells
        'cell-text': {
          given: 'var(--text-given)',
          entered: 'var(--text-entered)',
          candidate: 'var(--text-candidate)',
          'on-highlight': 'var(--text-on-highlight)',
        },
        
        // Button colors
        btn: {
          bg: 'var(--btn-bg)',
          hover: 'var(--btn-hover)',
          active: 'var(--btn-active)',
          'active-text': 'var(--btn-active-text)',
        },
        
        // Accent colors
        accent: {
          DEFAULT: 'var(--accent)',
          light: 'var(--accent-light)',
        },
        
        // Error/duplicate colors - theme-aware error tones
        error: {
          bg: 'var(--error-bg)',
          text: 'var(--error-text)',
        },
        
        // Difficulty colors - theme-aware
        diff: {
          easy: 'var(--diff-easy)',
          medium: 'var(--diff-medium)',
          hard: 'var(--diff-hard)',
          extreme: 'var(--diff-extreme)',
          impossible: 'var(--diff-impossible)',
        },
      },
      boxShadow: {
        theme: 'var(--shadow)',
        'theme-light': 'var(--shadow-light)',
      },
      borderRadius: {
        board: 'var(--board-radius)',
      },
    },
  },
  plugins: [],
}
