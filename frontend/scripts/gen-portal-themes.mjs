// Generate the report portal's theme stylesheet from the game's single source
// of truth (src/lib/themes.ts), so the portal's colors never drift from the
// game. Emits one CSS block per [data-color-theme][data-mode] plus a default
// (Tokyo Night, following the OS). The portal's app.js stamps those attributes
// on :root from the shared localStorage theme.
//
// Run: npx tsx frontend/scripts/gen-portal-themes.mjs > .github/scripts/report_portal.themes.css
import { THEMES, themeToCssVars } from '../src/lib/themes.ts'

const modes = ['light', 'dark']
const fmt = (vars, indent) =>
  Object.entries(vars).map(([k, v]) => `${indent}${k}: ${v};`).join('\n')

let css = '/* GENERATED from src/lib/themes.ts by frontend/scripts/gen-portal-themes.mjs.\n'
css += '   Do not edit by hand. The report portal mirrors the game theme via the\n'
css += '   shared localStorage keys (colorTheme, modePreference). */\n\n'

for (const [theme, variants] of Object.entries(THEMES)) {
  for (const mode of modes) {
    css += `:root[data-color-theme="${theme}"][data-mode="${mode}"] {\n${fmt(themeToCssVars(variants[mode]), '  ')}\n}\n`
  }
}

css += '\n/* Default before JS runs / no saved theme: Tokyo Night, following the OS. */\n'
css += `:root {\n${fmt(themeToCssVars(THEMES.tokyonight.light), '  ')}\n}\n`
css += '@media (prefers-color-scheme: dark) {\n'
css += `  :root:not([data-mode]) {\n${fmt(themeToCssVars(THEMES.tokyonight.dark), '    ')}\n  }\n}\n`

process.stdout.write(css)
