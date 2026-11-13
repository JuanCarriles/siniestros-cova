// API compartida: las pantallas no necesitan conocer el evento interno de la bandeja.
const EVENTO_ACTUALIZACION = 'cova:notificaciones'
export function actualizarNotificaciones() {
  window.dispatchEvent(new Event(EVENTO_ACTUALIZACION))
}
export function suscribirActualizacionNotificaciones(actualizar: () => void) {
  window.addEventListener(EVENTO_ACTUALIZACION, actualizar)
  return () => window.removeEventListener(EVENTO_ACTUALIZACION, actualizar)
}

// Separar los cambios del servidor evita que marcar leído borre los avisos recién mostrados en el panel.
const EVENTO_SERVIDOR = 'cova:notificaciones-servidor'
export function actualizarNotificacionesServidor(datos: { nueva: boolean }) {
  window.dispatchEvent(new CustomEvent(EVENTO_SERVIDOR, { detail: datos }))
}
export function suscribirNotificacionesServidor(actualizar: (nueva: boolean) => void) {
  const recibir = (evento: Event) =>
    actualizar((evento as CustomEvent<{ nueva: boolean }>).detail.nueva)
  window.addEventListener(EVENTO_SERVIDOR, recibir)
  return () => window.removeEventListener(EVENTO_SERVIDOR, recibir)
}
