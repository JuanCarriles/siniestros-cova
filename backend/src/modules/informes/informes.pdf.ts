import PDFDocument from 'pdfkit'
import type { DatosInforme } from './informes.calculos.ts'
import { RESULTADOS_CIERRE } from '@cova/shared/schemas/informes'

// Paleta editorial del PDF aprobado. Texto real seleccionable, gráficos vectoriales y tablas paginadas.
const C = {
  navy: '#203F63',
  orange: '#EF7B22',
  text: '#17212D',
  muted: '#495769',
  line: '#C7CFD8',
  light: '#F1F4F7',
  white: '#FFFFFF',
}
const entero = new Intl.NumberFormat('es-AR')
const importe = (v: string) => {
  const [e, dec = '00'] = v.replace('-', '').split('.')
  return `${v.startsWith('-') ? '-' : ''}${entero.format(BigInt(e!))},${dec.padEnd(2, '0')}`
}
const valor = (v: number | null, unidad = '') =>
  v === null ? 'Sin datos' : `${entero.format(v)}${unidad}`
const mes = (p: string) =>
  new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(`${p}-15T12:00:00-03:00`))
export async function generarPdfInforme(d: DatosInforme, prueba = false): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 42, left: 42, right: 42, bottom: 25 },
    bufferPages: true,
    info: {
      Title: `Informe mensual - ${mes(d.periodo)}`,
      Author: 'Estudio Cova',
      Subject: 'Gestión mensual de siniestros',
    },
    lang: 'es-AR',
  })
  const trozos: Buffer[] = []
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (v: Buffer) => trozos.push(v))
    doc.on('end', () => resolve(Buffer.concat(trozos)))
    doc.on('error', reject)
  })
  const ancho = 511
  let y = 0
  function texto(
    s: string,
    x: number,
    top: number,
    w = ancho,
    size = 12,
    font = 'Helvetica',
    color = C.text,
  ) {
    doc.font(font).fontSize(size).fillColor(color).text(s, x, top, { width: w, lineGap: 3 })
    return doc.y
  }
  function linea(top: number) {
    doc.strokeColor(C.line).lineWidth(0.6).moveTo(42, top).lineTo(553, top).stroke()
  }
  function cabecera() {
    texto('EC', 42, 31, 36, 22, 'Helvetica-Bold', C.orange)
    texto('ESTUDIO COVA', 87, 31, 240, 13, 'Helvetica-Bold')
    texto('Gestión de siniestros', 87, 49, 240, 10)
    texto('INFORME DE GESTIÓN', 365, 37, 188, 10, 'Helvetica', C.navy)
    doc.strokeColor(C.navy).lineWidth(0.8).moveTo(42, 72).lineTo(553, 72).stroke()
    y = 92
  }
  function pagina() {
    doc.addPage()
    cabecera()
  }
  function espacio(alto: number) {
    if (y + alto > 770) pagina()
  }
  function parrafo(s: string) {
    doc.font('Helvetica').fontSize(12)
    const h = doc.heightOfString(s, { width: ancho, lineGap: 3 })
    espacio(h + 16)
    y = texto(s, 42, y) + 12
  }
  function seccion(s: string) {
    espacio(s === 'Casos que requieren atención' ? 65 : 100)
    doc.rect(42, y + 3, 4, 16).fill(C.orange)
    texto(s, 54, y, 499, 16, 'Helvetica-Bold')
    y += 32
  }
  function tabla(cab: string[], filas: (string | number)[][], pesos?: number[]) {
    const ps = pesos ?? cab.map(() => 1),
      total = ps.reduce((a, b) => a + b, 0),
      ws = ps.map((p) => (ancho * p) / total)
    function fila(celdas: (string | number)[], titulo = false) {
      doc.font(titulo ? 'Helvetica-Bold' : 'Helvetica').fontSize(11.5)
      const h = Math.max(
        32,
        ...celdas.map(
          (c, i) => doc.heightOfString(String(c), { width: ws[i]! - 14, lineGap: 3 }) + 16,
        ),
      )
      if (y + h > 770) {
        pagina()
        if (!titulo) fila(cab, true)
      }
      if (titulo) doc.rect(42, y, ancho, h).fill(C.light)
      let x = 42
      celdas.forEach((c, i) => {
        texto(String(c), x + 7, y + 8, ws[i]! - 14, 11.5, titulo ? 'Helvetica-Bold' : 'Helvetica')
        x += ws[i]!
      })
      y += h
      linea(y)
    }
    fila(cab, true)
    if (!filas.length) fila(['Sin registros para este período', ...cab.slice(1).map(() => '—')])
    else filas.forEach((f) => fila(f))
    y += 18
  }
  function barras(filas: { nombre: string; cantidad: number }[]) {
    const max = Math.max(1, ...filas.map((f) => f.cantidad))
    for (const f of filas) {
      espacio(50)
      const h = doc.font('Helvetica').fontSize(12).heightOfString(f.nombre, { width: 220 })
      texto(f.nombre, 42, y, 220, 12)
      if (f.cantidad > 0) doc.rect(278, y + 2, (215 * f.cantidad) / max, 13).fill(C.navy)
      texto(String(f.cantidad), 505, y, 48, 12, 'Helvetica-Bold')
      y += Math.max(34, h + 12)
    }
    y += 8
  }
  cabecera()
  y = texto('Informe mensual', 42, y, ancho, 31, 'Helvetica-Bold', C.text) + 2
  y = texto(mes(d.periodo), 42, y, ancho, 27, 'Helvetica-Bold', C.navy) + 14
  parrafo(
    `Período ${d.periodo} · Corte: ${new Date(d.corte).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' })}`,
  )
  if (prueba || d.provisional)
    parrafo(
      `${prueba ? 'INFORME DE PRUEBA' : 'INFORME PROVISIONAL'}${d.provisional ? ' · Mes en curso' : ''}`,
    )
  if (!d.completa)
    parrafo(
      'Cobertura parcial: las cifras reflejan la información observada. Consultá el alcance al final del informe.',
    )
  seccion('Resumen ejecutivo')
  const indicadores = [
    [d.administrados, 'Casos administrados'],
    [d.nuevos, 'Casos nuevos'],
    [d.cerrados, 'Casos cerrados'],
    [d.abiertos, 'Abiertos / en mediación'],
  ] as const
  indicadores.forEach(([n, label], i) => {
    const x = 42 + (i % 2) * 267,
      top = y + Math.floor(i / 2) * 75
    texto(
      d.sinDatos ? 'Sin datos' : entero.format(n),
      x,
      top,
      244,
      d.sinDatos ? 22 : 34,
      'Helvetica-Bold',
      C.navy,
    )
    texto(label, x, top + 40, 244, 13, 'Helvetica-Bold')
  })
  y += 148
  parrafo('En mediación corresponde a los casos que todavía no fueron cerrados.')
  if (d.iniciales !== null)
    parrafo(
      `${d.iniciales} ${d.iniciales === 1 ? 'abierto' : 'abiertos'} al inicio + ${d.nuevos} ${d.nuevos === 1 ? 'nuevo' : 'nuevos'} - ${d.cerrados} ${d.cerrados === 1 ? 'cerrado' : 'cerrados'}. Saldo de entradas y cierres: ${d.saldo}.`,
    )
  if (d.sinDatos)
    parrafo(
      'No hay información registrada para este período. Elegí un mes desde el inicio de la cobertura estadística.',
    )
  seccion('Composición de la cartera abierta')
  barras(
    d.estados.map((e) => ({ nombre: `${e.nombre} (${e.porcentaje} %)`, cantidad: e.cantidad })),
  )
  seccion('Casos que requieren atención')
  parrafo(
    `${d.demorados.cantidad} demorados: ${d.demorados.amarillos} entre 3 y 6 días; ${d.demorados.rojos} con 7 días o más sin movimiento.`,
  )
  pagina()
  y = texto('Desempeño del período', 42, y, ancho, 27, 'Helvetica-Bold', C.navy) + 22
  seccion('Tiempos de gestión')
  tabla(
    ['Indicador', 'Resultado'],
    [
      ['Resolución promedio', valor(d.resolucion.promedio, ' días')],
      ['Mediana de resolución', valor(d.resolucion.mediana, ' días')],
      ['Cierres incluidos en el cálculo', d.resolucion.casos],
      ['Asignación a primera novedad', valor(d.primeraRespuesta, ' días')],
      ['Hecho a ingreso al estudio', valor(d.demoraIngreso, ' días')],
    ],
    [3, 2],
  )
  seccion('Cinco casos con más tiempo sin movimiento')
  tabla(
    ['Siniestro', 'Responsable', 'Días'],
    d.demorados.top5.map((s) => [s.numero, s.gestor, s.dias]),
    [2, 3, 1],
  )
  seccion('Movimientos de cartera')
  tabla(
    ['Movimiento', 'Cantidad'],
    [
      ['Bajas', d.bajas],
      ['Reactivaciones', d.reactivaciones],
      ['Reaperturas de casos cerrados', d.reaperturas],
      ['Saldo: nuevos menos cerrados', d.saldo],
    ],
    [4, 1],
  )
  parrafo(
    'Bajas, reactivaciones y reaperturas pueden modificar la cartera además de los nuevos casos y cierres.',
  )
  for (const [titulo, lista] of [
    ['Cartera por aseguradora', d.aseguradoras],
    ['Cartera por ajustador', d.ajustadores],
  ] as const) {
    seccion(titulo)
    tabla(
      ['Nombre', 'Nuevos', 'Cerrados', 'Abiertos', 'Demorados'],
      lista.map((g) => [g.nombre, g.nuevos, g.cerrados, g.abiertos, g.demorados]),
      [3, 1.25, 1.25, 1.25, 1.75],
    )
    seccion(titulo.replace('Cartera', 'Resolución promedio'))
    tabla(
      ['Nombre', 'Días'],
      lista.map((g) => [g.nombre, valor(g.resolucion)]),
      [4, 1],
    )
  }
  seccion('Demora de ingreso por aseguradora')
  tabla(
    ['Aseguradora', 'Días promedio'],
    d.demoraIngresoAseguradoras.map((g) => [g.nombre, valor(g.dias)]),
    [3, 2],
  )
  seccion('Carga por responsable')
  tabla(
    ['Responsable', 'Asignados', 'Cerrados', 'Abiertos', 'Demorados'],
    d.gestores.map((g) => [g.nombre, g.asignados, g.cerrados, g.abiertos, g.demorados]),
    [3, 1.25, 1.25, 1.25, 1.75],
  )
  seccion('Primera respuesta por responsable')
  tabla(
    ['Responsable', 'Días promedio'],
    d.gestores.map((g) => [g.nombre, valor(g.primeraRespuesta)]),
    [3, 2],
  )
  seccion('Actividad por usuario')
  tabla(
    ['Usuario', 'Novedades', 'Documentos', 'Estados'],
    d.actividad.map((a) => [a.nombre, a.novedades, a.documentos, a.estados]),
    [3, 1, 1, 1],
  )
  seccion('Pericias')
  tabla(
    ['Tipo', 'Solicitadas', 'Finalizadas', 'Pendientes', 'Días promedio'],
    d.pericias.map((p) => [
      p.tipo === 'MEDICO' ? 'Médica' : 'CESVI',
      p.solicitadas,
      p.finalizadas,
      p.pendientes,
      valor(p.duracion),
    ]),
    [1.5, 1, 1, 1, 1.5],
  )
  seccion('Pericias pendientes hace más de 30 días')
  tabla(
    ['Siniestro', 'Tipo', 'Días'],
    d.pericias.flatMap((p) =>
      p.mayores30.map((m) => [m.numero, p.tipo === 'MEDICO' ? 'Médica' : 'CESVI', m.dias]),
    ),
    [2, 2, 1],
  )
  seccion('Lesiones, menores y representación')
  tabla(
    ['Indicador sobre la cartera abierta', 'Casos'],
    [
      ...d.lesiones.map((l) => [
        (
          {
            LEVE: 'Lesiones leves',
            MODERADA: 'Lesiones moderadas',
            GRAVE: 'Lesiones graves',
            MUERTE: 'Fallecimiento',
          } as Record<string, string>
        )[l.tipo]!,
        l.casos,
      ]),
      ['Menores involucrados', d.menores],
      ['Terceros con abogado', d.conAbogado],
      ['Casos que incorporaron abogado de tercero en el mes', d.nuevosConAbogado],
    ],
    [4, 1],
  )
  parrafo('Un caso puede tener personas con distintas lesiones y aparecer en más de una categoría.')
  seccion('Resultados del cierre')
  tabla(
    ['Resultado', 'Casos'],
    [
      ...d.resultados.map((r) => [
        RESULTADOS_CIERRE[r.resultado as keyof typeof RESULTADOS_CIERRE],
        r.cantidad,
      ]),
      ['Sin resultado registrado', d.sinResultado],
    ],
    [4, 1],
  )
  seccion('Resultados económicos')
  tabla(
    ['Moneda', 'Casos', 'Reclamado', 'Acordado', 'Diferencia'],
    d.economia.map((e) => [
      e.moneda,
      e.casos,
      importe(e.reclamado),
      importe(e.acordado),
      importe(e.diferencia),
    ]),
    [1, 1, 2, 2, 2],
  )
  parrafo(
    'Se incluyen únicamente cierres del mes con ambos importes. La diferencia es reclamado menos acordado; no implica un pago efectivo. No se mezclan monedas.',
  )
  seccion('Importes por aseguradora')
  tabla(
    ['Aseguradora / moneda', 'Casos', 'Reclamado', 'Acordado', 'Diferencia'],
    d.economiaAseguradoras.map((e) => [
      `${e.aseguradora} / ${e.moneda}`,
      e.casos,
      importe(e.reclamado),
      importe(e.acordado),
      importe(e.diferencia),
    ]),
    [3, 1, 2, 2, 2],
  )
  seccion('Comparación con el mes anterior')
  if (d.comparacion)
    tabla(
      ['Indicador', 'Variación absoluta'],
      [
        ['Nuevos', d.comparacion.nuevos],
        ['Cerrados', d.comparacion.cerrados],
        ['Abiertos', d.comparacion.abiertos],
      ],
      [3, 2],
    )
  else
    parrafo(
      'Sin un informe oficial del mes anterior comparable. La comparación estará disponible al contar con ambos períodos completos.',
    )
  seccion('Evolución de los últimos seis meses')
  tabla(
    ['Período', 'Nuevos', 'Cerrados', 'Abiertos'],
    (d.tendencia ?? []).map((t) => [
      t.periodo,
      valor(t.nuevos),
      valor(t.cerrados),
      valor(t.abiertos),
    ]),
    [2, 1, 1, 1],
  )
  // Serie vectorial: los meses sin cobertura permanecen separados, nunca se inventan ceros.
  const puntos = d.tendencia ?? [],
    max = Math.max(1, ...puntos.map((p) => p.abiertos ?? 0))
  espacio(145)
  doc
    .strokeColor(C.line)
    .moveTo(55, y + 105)
    .lineTo(540, y + 105)
    .stroke()
  let previo: { x: number; y: number } | null = null
  puntos.forEach((p, i) => {
    const x = 62 + i * 91
    if (p.abiertos === null) {
      previo = null
      return
    }
    const py = y + 90 - (p.abiertos / max) * 72
    if (previo)
      doc.strokeColor(C.navy).lineWidth(1.5).moveTo(previo.x, previo.y).lineTo(x, py).stroke()
    doc.circle(x, py, 3).fill(C.navy)
    texto(String(p.abiertos), x - 18, py - 22, 50, 11, 'Helvetica-Bold')
    texto(p.periodo, x - 25, y + 112, 75, 10)
    previo = { x, y: py }
  })
  y += 145
  seccion('Antigüedad de casos abiertos')
  barras(d.antiguedad)
  seccion('Tiempo en cada estado durante el período')
  tabla(
    ['Estado', 'Días promedio por permanencia'],
    d.tiemposEstado.map((t) => [t.nombre, valor(t.promedio)]),
    [3, 2],
  )
  seccion('Alcance y calidad de los datos')
  parrafo(
    d.completa
      ? 'El registro estadístico cubre el período completo.'
      : 'COBERTURA PARCIAL: no se pueden reconstruir con certeza los cambios anteriores al inicio del registro estadístico. Las cifras corresponden a lo observado; no deben interpretarse como totales históricos completos.',
  )
  parrafo(
    `Registro estadístico disponible desde ${new Date(d.coberturaDesde).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' })}. Los datos desconocidos se muestran como «Sin datos», nunca como cero.`,
  )
  parrafo(
    'Los casos se cuentan una vez por indicador. Administrados, abiertos, nuevos y cerrados se superponen y no deben sumarse. Los cierres se atribuyen al responsable y a la aseguradora del momento del cierre. Las actividades se atribuyen a su autor.',
  )
  parrafo(
    'El semáforo se calcula al corte: desde 72 horas sin movimiento es amarillo; desde 7 días es rojo. Son movimientos los cambios de estado, novedades, documentos y cierres de pericia. Las reactivaciones reinician el reloj según la regla del sistema.',
  )
  parrafo(
    'El PDF conserva los resultados del momento de generación. Cambios posteriores en expedientes o eliminación de archivos no modifican este documento.',
  )
  const rango = doc.bufferedPageRange()
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(i)
    linea(787)
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(C.muted)
      .text(`Estudio Cova · ${d.periodo}${prueba ? ' · PRUEBA' : ''}`, 42, 800, {
        lineBreak: false,
      })
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(C.navy)
      .text(String(i + 1).padStart(2, '0'), 530, 800, { lineBreak: false })
  }
  doc.end()
  return terminado
}
