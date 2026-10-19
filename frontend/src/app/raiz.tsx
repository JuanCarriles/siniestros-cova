import { Outlet, ScrollRestoration } from 'react-router'

// Raíz de todas las rutas: cada página nueva empieza arriba (y Atrás vuelve a la posición anterior)
export function Raiz() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  )
}
