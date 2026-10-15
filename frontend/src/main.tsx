import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/atkinson-hyperlegible-next'
import '@fontsource-variable/atkinson-hyperlegible-mono'
import './styles/index.css'
import { App } from './app/App'

// La barra del navegador toma el mismo token de marca que la aplicación.
document
  .querySelector('meta[name="theme-color"]')
  ?.setAttribute(
    'content',
    getComputedStyle(document.documentElement).getPropertyValue('--color-navy').trim(),
  )

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
