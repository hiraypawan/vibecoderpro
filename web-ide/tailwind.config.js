/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'ide-bg': '#1e1e2e',
        'ide-sidebar': '#181825',
        'ide-editor': '#1e1e2e',
        'ide-panel': '#11111b',
        'ide-border': '#313244',
        'ide-text': '#cdd6f4',
        'ide-accent': '#89b4fa',
        'ide-green': '#a6e3a1',
        'ide-red': '#f38ba8',
        'ide-yellow': '#f9e2af',
        'ide-purple': '#cba6f7',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
