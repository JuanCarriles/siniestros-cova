// API compartida: las pantallas no necesitan conocer el evento interno de la bandeja.
const EVENTO_ACTUALIZACION = 'cova:notificaciones'
export function actualizarNotificaciones() {
  window.dispatchEvent(new Event(EVENTO_ACTUALIZACION))
}
export function suscribirActualizacionNotificaciones(actualizar: () => void) {
  window.addEventListener(EVENTO_ACTUALIZACION, actualizar)
  return () => window.removeEventListener(EVENTO_ACTUALIZACION, actualizar)
}
