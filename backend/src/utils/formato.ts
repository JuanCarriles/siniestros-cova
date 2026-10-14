// Formatos de texto para mostrar o guardar datos legibles (historial, novedades, mails, PDF).

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

const fechaAR = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * dd/mm/aaaa en hora argentina. El servidor corre en UTC: sin la zona horaria, un evento de las
 * 22:00 del 20/10 quedaría como 21/10.
 */
export function formatearFecha(fecha: Date): string {
  return fechaAR.format(fecha)
}

export function nombreCompleto(persona: { nombres: string; apellidos: string }): string {
  return `${persona.nombres} ${persona.apellidos}`
}
