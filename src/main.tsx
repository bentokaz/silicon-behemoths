import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import * as game from './sim/game'
import { useStore } from './store/game'
import { applyTheme, getTheme } from './store/theme'

applyTheme(getTheme())

// in development the store and the game actions are reachable from the console
if (import.meta.env.DEV) Object.assign(window, { sb: useStore, sbGame: game })

createRoot(document.getElementById('root')!).render(<App />)
