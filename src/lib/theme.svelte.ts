/**
 * Helles oder dunkles Schema. Standard ist hell (unabhängig von der Systemeinstellung),
 * die Wahl wird im Browser gemerkt.
 */
const KEY = 'osvacneo-theme'

export type Theme = 'light' | 'dark'

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(t: Theme) {
  if (t === 'dark') document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
}

class ThemeState {
  current = $state<Theme>('light')

  /** früh aufrufen (main.ts), damit nichts hell aufblitzt */
  init() {
    this.current = stored()
    apply(this.current)
  }

  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark'
    apply(this.current)
    try {
      localStorage.setItem(KEY, this.current)
    } catch {
      /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
    }
  }
}

export const theme = new ThemeState()
