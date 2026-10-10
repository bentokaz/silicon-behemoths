// Colour themes. Each one overrides the CSS colour variables in index.css.

export const THEMES = [
  { id: 'ember', name: 'Ember', swatch: '#ff6b1a' },
  { id: 'volt', name: 'Volt', swatch: '#c6f135' },
  { id: 'ice', name: 'Ice', swatch: '#36c5d6' },
  { id: 'rose', name: 'Rose', swatch: '#ff4f81' },
] as const
export type ThemeId = (typeof THEMES)[number]['id']

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('sb-theme')
    if (THEMES.some((t) => t.id === saved)) return saved as ThemeId
  } catch {
    /* storage unavailable */
  }
  return 'ember'
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  try {
    localStorage.setItem('sb-theme', id)
  } catch {
    /* storage unavailable */
  }
}

/** Current value of a theme colour, for code that cannot use CSS variables (three.js). */
export function themeColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim() || fallback
}
