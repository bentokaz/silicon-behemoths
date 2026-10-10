import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, getTheme } from './store/theme'

applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(<App />)
