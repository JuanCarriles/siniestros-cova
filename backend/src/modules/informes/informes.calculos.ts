export const ZONA_INFORMES = 'America/Argentina/Buenos_Aires'
const DIA = 86_400_000
export type Referencia = { id: number; nombre: string }
export type Foto = {
  id: number
  numero: string
  ingreso: string
  ocurrencia: string | null
  autorNombre?: string
  estado: Referencia & { cierre: boolean }
  aseguradora: Referencia
  ajustador: Referencia | null
  gestor: Referencia & { tipo: string }
  eliminado: boolean
  fechaCierre: string | null
  ultimoMovimiento: string
  menores: boolean
  moneda: string
  reclamado: string | null
  acordado: string | null
  resultado: string | null
  personas: { id: number; lesion: string | null; abogado: boolean; tercero: boolean }[]
  pericias: {
    id: number
    tipo: string
    solicitud: string
    cierre: string | null
    eliminado: boolean
  }[]
}
export type Registro = {
  id: bigint
  idSiniestro: number
  fechaRegistro: Date
  fechaEvento: Date
  evento: string
  idAutor: number | null
  datos: unknown
}
export function mesArgentina(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_INFORMES,
    year: 'numeric',
    month: '2-digit',
  })
    .format(fecha)
    .slice(0, 7)
}
export function limitesMes(periodo: string) {
  const inicio = new Date(`${periodo}-01T00:00:00-03:00`)
  const siguiente = new Date(inicio)
  siguiente.setUTCMonth(siguiente.getUTCMonth() + 1)
  return { inicio, fin: siguiente }
}
export function mesAnterior(periodo: string) {
  const f = limitesMes(periodo).inicio
  f.setUTCMonth(f.getUTCMonth() - 1)
  return mesArgentina(f)
}
export function mesesHasta(periodo: string, cantidad: number) {
  const lista = [periodo]
  while (lista.length < cantidad) lista.unshift(mesAnterior(lista[0]!))
  return lista
}
const fecha = (v: string) => new Date(v).getTime()
const dias = (a: string, b: string | Date) => Math.max(0, (new Date(b).getTime() - fecha(a)) / DIA)
const promedio = (v: number[]) =>
  v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null
const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b),
    n = s.length
  return n
    ? Math.round((n % 2 ? s[Math.floor(n / 2)]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) * 10) / 10
    : null
}
const centavos = (v: string) => {
  const [e, d = ''] = v.split('.')
  return BigInt(e!) * 100n + BigInt((d + '00').slice(0, 2))
}
const decimal = (v: bigint) =>
  `${v < 0n ? '-' : ''}${(v < 0n ? -v : v) / 100n}.${String((v < 0n ? -v : v) % 100n).padStart(2, '0')}`

export type ContextoInforme = { asignaciones: Map<number, { desde: string; respondida: boolean }> }
export function calcularInforme(
  periodo: string,
  registros: Registro[],
  ahora = new Date(),
  contexto?: ContextoInforme,
) {
  const { inicio, fin } = limitesMes(periodo),
    corte = new Date(Math.min(fin.getTime(), ahora.getTime()))
  const enMes = (f: string | Date) => new Date(f) >= inicio && new Date(f) < corte
  const ordenados = [...registros]
    .filter((r) => r.fechaRegistro < corte)
    .sort(
      (a, b) =>
        a.fechaRegistro.getTime() - b.fechaRegistro.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
  const desde =
    ordenados.find((r) => r.evento === 'INICIO')?.fechaRegistro ??
    ordenados[0]?.fechaRegistro ??
    ahora
  const completa = desde <= inicio
  const fotos = new Map<number, Foto>(),
    iniciales = new Map<number, Foto>(),
    administrados = new Set<number>()
  const cierres = new Map<number, Foto>(),
    nuevos = new Map<number, Foto>(),
    asignados = new Map<number, Set<number>>()
  const actividad = new Map<
    number,
    { id: number; nombre: string; novedades: number; documentos: number; estados: number }
  >()
  const tiemposEstado = new Map<string, { nombre: string; dias: number; periodos: number }>()
  const primeraNovedad = new Map<string, number>(),
    esperas: { gestor: Referencia; dias: number }[] = []
  const asignacion = new Map<number, { desde: string; gestor: Referencia }>()
  const abogadosNuevos = new Set<number>()
  let bajas = 0,
    reactivaciones = 0,
    reaperturas = 0
  const ultimaFoto = new Map<number, Date>()
  const visita = new Map<number, string>(),
    visitasContadas = new Set<string>()
  const periciasFinalizadas = new Map<
    number,
    Foto['pericias'][number] & { numero: string; idSiniestro: number }
  >()
  const periciasVistas = new Map<
    number,
    Foto['pericias'][number] & { numero: string; idSiniestro: number }
  >()
  function sumarTiempo(f: Foto, a: Date, b: Date) {
    if (f.eliminado || f.estado.cierre) return
    const ini = Math.max(a.getTime(), inicio.getTime()),
      hasta = Math.min(b.getTime(), corte.getTime())
    if (hasta <= ini) return
    const t = tiemposEstado.get(String(f.estado.id)) ?? {
      nombre: f.estado.nombre,
      dias: 0,
      periodos: 0,
    }
    t.dias += (hasta - ini) / DIA
    const clave = visita.get(f.id)!
    if (!visitasContadas.has(clave)) {
      t.periodos++
      visitasContadas.add(clave)
    }
    tiemposEstado.set(String(f.estado.id), t)
  }
  for (const r of ordenados) {
    if (!r.idSiniestro) continue
    const s = r.datos as Foto,
      anterior = fotos.get(s.id),
      hora = r.fechaRegistro
    if (anterior) sumarTiempo(anterior, ultimaFoto.get(s.id)!, hora)
    if (!anterior || anterior.estado.id !== s.estado.id || anterior.eliminado !== s.eliminado)
      visita.set(s.id, `${s.id}:${r.id}`)
    for (const p of s.pericias) {
      const pericia = { ...p, numero: s.numero, idSiniestro: s.id }
      periciasVistas.set(p.id, pericia)
      if (p.cierre && enMes(p.cierre)) periciasFinalizadas.set(p.id, pericia)
    }
    ultimaFoto.set(s.id, hora)
    fotos.set(s.id, s)
    if (hora < inicio) iniciales.set(s.id, s)
    const previa = !anterior ? contexto?.asignaciones.get(s.id) : undefined
    if (previa) {
      asignacion.set(s.id, { desde: previa.desde, gestor: s.gestor })
      if (previa.respondida) primeraNovedad.set(`${s.id}:${previa.desde}`, 1)
    } else if (!asignacion.has(s.id) || (anterior && anterior.gestor.id !== s.gestor.id))
      asignacion.set(s.id, { desde: anterior ? hora.toISOString() : s.ingreso, gestor: s.gestor })
    if (
      hora >= inicio &&
      ((!s.eliminado && !s.estado.cierre) ||
        (anterior && !anterior.eliminado && !anterior.estado.cierre))
    )
      administrados.add(s.id)
    if (enMes(s.ingreso) && r.evento === 'ALTA') nuevos.set(s.id, s)
    // Un cierre por siniestro y período; se conserva el último cierre de ese mes.
    if (s.estado.cierre && !s.eliminado && anterior && !anterior.estado.cierre && enMes(hora))
      cierres.set(s.id, s)
    if (enMes(hora) && anterior?.estado.cierre && !s.estado.cierre) reaperturas++
    if (enMes(hora) && anterior && !anterior.eliminado && s.eliminado) bajas++
    if (enMes(hora) && anterior?.eliminado && !s.eliminado) reactivaciones++
    if (enMes(hora) && (r.evento === 'ALTA' || (anterior && anterior.gestor.id !== s.gestor.id))) {
      const set = asignados.get(s.gestor.id) ?? new Set<number>()
      set.add(s.id)
      asignados.set(s.gestor.id, set)
    }
    const tieneAbogado = (f: Foto) => f.personas.some((p) => p.tercero && p.abogado)
    if (
      r.evento !== 'BASELINE' &&
      enMes(hora) &&
      tieneAbogado(s) &&
      (!anterior || !tieneAbogado(anterior))
    )
      abogadosNuevos.add(s.id)
    if (
      ['NOVEDAD', 'DOCUMENTO', 'CAMBIO_ESTADO'].includes(r.evento) &&
      enMes(r.fechaEvento) &&
      r.idAutor != null
    ) {
      const a = actividad.get(r.idAutor) ?? {
        id: r.idAutor,
        nombre:
          s.autorNombre ?? (r.idAutor === s.gestor.id ? s.gestor.nombre : `Usuario ${r.idAutor}`),
        novedades: 0,
        documentos: 0,
        estados: 0,
      }
      if (r.evento === 'NOVEDAD') a.novedades++
      if (r.evento === 'DOCUMENTO') a.documentos++
      if (r.evento === 'CAMBIO_ESTADO') a.estados++
      actividad.set(a.id, a)
    }
    if (r.evento === 'NOVEDAD') {
      const a = asignacion.get(s.id)!,
        clave = `${s.id}:${a.desde}`
      // Solo la primera novedad posterior a cada asignación, no una novedad retroactiva.
      if (!primeraNovedad.has(clave) && fecha(a.desde) <= r.fechaEvento.getTime()) {
        primeraNovedad.set(clave, 1)
        if (enMes(r.fechaEvento))
          esperas.push({ gestor: a.gestor, dias: dias(a.desde, r.fechaEvento) })
      }
    }
  }
  for (const [id, s] of iniciales) if (!s.eliminado && !s.estado.cierre) administrados.add(id)
  for (const [id, s] of fotos) sumarTiempo(s, ultimaFoto.get(id)!, corte)
  const abiertos = [...fotos.values()].filter((s) => !s.eliminado && !s.estado.cierre),
    cerrados = [...cierres.values()],
    altas = [...nuevos.values()]
  const atraso = (s: Foto) => Math.floor(dias(s.ultimoMovimiento, corte)),
    demorados = abiertos.filter((s) => atraso(s) >= 3)
  const duraciones = cerrados
    .map((s) => (s.fechaCierre ? dias(s.ingreso, s.fechaCierre) : null))
    .filter((d): d is number => d !== null)
  function desglose(campo: 'aseguradora' | 'ajustador' | 'gestor') {
    const grupos = new Map<
      number,
      {
        id: number
        nombre: string
        nuevos: number
        cerrados: number
        abiertos: number
        demorados: number
        asignados: number
        tiempos: number[]
      }
    >()
    const grupo = (s: Foto) => {
      const ref = s[campo] ?? { id: 0, nombre: 'Sin ajustador' }
      if (!grupos.has(ref.id))
        grupos.set(ref.id, {
          ...ref,
          nuevos: 0,
          cerrados: 0,
          abiertos: 0,
          demorados: 0,
          asignados: asignados.get(ref.id)?.size ?? 0,
          tiempos: [],
        })
      return grupos.get(ref.id)!
    }
    altas.forEach((s) => grupo(s).nuevos++)
    cerrados.forEach((s) => {
      const g = grupo(s)
      g.cerrados++
      if (s.fechaCierre) g.tiempos.push(dias(s.ingreso, s.fechaCierre))
    })
    abiertos.forEach((s) => {
      const g = grupo(s)
      g.abiertos++
      if (atraso(s) >= 3) g.demorados++
    })
    return [...grupos.values()]
      .map(({ tiempos, ...g }) => ({
        ...g,
        resolucion: promedio(tiempos),
        primeraRespuesta:
          campo === 'gestor'
            ? promedio(esperas.filter((e) => e.gestor.id === g.id).map((e) => e.dias))
            : null,
      }))
      .sort((a, b) => b.abiertos - a.abiertos || a.nombre.localeCompare(b.nombre))
  }
  const estados = [...new Set(abiertos.map((s) => s.estado.id))].map((id) => {
    const casos = abiertos.filter((s) => s.estado.id === id)
    return {
      nombre: casos[0]!.estado.nombre,
      cantidad: casos.length,
      porcentaje: abiertos.length ? Math.round((casos.length / abiertos.length) * 1000) / 10 : 0,
    }
  })
  const pericias = [...periciasVistas.values()]
  const periciasTipo = ['CESVI', 'MEDICO'].map((tipo) => {
    const ps = pericias.filter((p) => p.tipo === tipo),
      cerradas = [...periciasFinalizadas.values()].filter((p) => p.tipo === tipo),
      pendientes = ps.filter(
        (p) =>
          !fotos.get(p.idSiniestro)?.eliminado &&
          !p.eliminado &&
          fecha(p.solicitud) < corte.getTime() &&
          (!p.cierre || fecha(p.cierre) >= corte.getTime()),
      )
    return {
      tipo,
      solicitadas: ps.filter((p) => enMes(p.solicitud)).length,
      finalizadas: cerradas.length,
      pendientes: pendientes.length,
      duracion: promedio(cerradas.map((p) => dias(p.solicitud, p.cierre!))),
      mayores30: pendientes
        .filter((p) => dias(p.solicitud, corte) > 30)
        .map((p) => ({ numero: p.numero, dias: Math.floor(dias(p.solicitud, corte)) })),
    }
  })
  const cartera = abiertos,
    lesiones = ['LEVE', 'MODERADA', 'GRAVE', 'MUERTE'].map((tipo) => ({
      tipo,
      casos: cartera.filter((s) => s.personas.some((p) => p.lesion === tipo)).length,
    }))
  const resultados = ['ACUERDO_PAGO', 'RECHAZO', 'DESISTIMIENTO', 'DERIVACION_JUICIO'].map(
    (resultado) => ({
      resultado,
      cantidad: cerrados.filter((s) => s.resultado === resultado).length,
    }),
  )
  const economia = ['ARS', 'USD'].map((moneda) => {
    const completos = cerrados.filter(
        (s) => s.moneda === moneda && s.reclamado !== null && s.acordado !== null,
      ),
      reclamado = completos.reduce((a, s) => a + centavos(s.reclamado!), 0n),
      acordado = completos.reduce((a, s) => a + centavos(s.acordado!), 0n)
    return {
      moneda,
      casos: completos.length,
      reclamado: decimal(reclamado),
      acordado: decimal(acordado),
      diferencia: decimal(reclamado - acordado),
    }
  })
  const economiaAseguradoras = [...new Set(cerrados.map((s) => s.aseguradora.id))].flatMap((id) =>
    ['ARS', 'USD']
      .map((moneda) => {
        const cs = cerrados.filter(
            (s) =>
              s.aseguradora.id === id &&
              s.moneda === moneda &&
              s.reclamado !== null &&
              s.acordado !== null,
          ),
          r = cs.reduce((v, s) => v + centavos(s.reclamado!), 0n),
          a = cs.reduce((v, s) => v + centavos(s.acordado!), 0n)
        return {
          aseguradora: cerrados.find((s) => s.aseguradora.id === id)!.aseguradora.nombre,
          moneda,
          casos: cs.length,
          reclamado: decimal(r),
          acordado: decimal(a),
          diferencia: decimal(r - a),
        }
      })
      .filter((g) => g.casos),
  )
  const ingresoDemora = altas.filter((s) => s.ocurrencia).map((s) => dias(s.ocurrencia!, s.ingreso))
  return {
    sinDatos: !completa && fotos.size === 0,
    version: 1,
    periodo,
    corte: corte.toISOString(),
    generado: ahora.toISOString(),
    coberturaDesde: desde.toISOString(),
    completa,
    provisional: corte < fin,
    administrados: administrados.size,
    nuevos: altas.length,
    cerrados: cerrados.length,
    abiertos: abiertos.length,
    enMediacion: abiertos.length,
    iniciales: completa
      ? [...iniciales.values()].filter((s) => !s.eliminado && !s.estado.cierre).length
      : null,
    saldo: altas.length - cerrados.length,
    bajas,
    reactivaciones,
    reaperturas,
    estados,
    resolucion: {
      promedio: promedio(duraciones),
      mediana: mediana(duraciones),
      casos: duraciones.length,
    },
    primeraRespuesta: promedio(esperas.map((e) => e.dias)),
    demoraIngreso: promedio(ingresoDemora),
    demoraIngresoAseguradoras: [...new Set(altas.map((s) => s.aseguradora.id))].map((id) => ({
      nombre: altas.find((s) => s.aseguradora.id === id)!.aseguradora.nombre,
      dias: promedio(
        altas
          .filter((s) => s.aseguradora.id === id && s.ocurrencia)
          .map((s) => dias(s.ocurrencia!, s.ingreso)),
      ),
    })),
    demorados: {
      cantidad: demorados.length,
      amarillos: demorados.filter((s) => atraso(s) < 7).length,
      rojos: demorados.filter((s) => atraso(s) >= 7).length,
      top5: [...demorados]
        .sort((a, b) => atraso(b) - atraso(a))
        .slice(0, 5)
        .map((s) => ({ numero: s.numero, gestor: s.gestor.nombre, dias: atraso(s) })),
    },
    aseguradoras: desglose('aseguradora'),
    ajustadores: desglose('ajustador'),
    gestores: desglose('gestor'),
    actividad: [...actividad.values()],
    pericias: periciasTipo,
    lesiones,
    menores: cartera.filter((s) => s.menores).length,
    conAbogado: cartera.filter((s) => s.personas.some((p) => p.tercero && p.abogado)).length,
    nuevosConAbogado: abogadosNuevos.size,
    tiemposEstado: [...tiemposEstado.values()].map((t) => ({
      ...t,
      promedio: Math.round((t.dias / Math.max(t.periodos, 1)) * 10) / 10,
    })),
    resultados,
    sinResultado: cerrados.filter((s) => !s.resultado).length,
    economia,
    economiaAseguradoras,
    antiguedad: [
      { nombre: 'Hasta 30 días', min: 0, max: 30 },
      { nombre: '31 a 90 días', min: 30, max: 90 },
      { nombre: '91 a 180 días', min: 90, max: 180 },
      { nombre: 'Más de 180 días', min: 180, max: Infinity },
    ].map((g, i) => ({
      nombre: g.nombre,
      cantidad: abiertos.filter((s) => {
        const d = Math.floor(dias(s.ingreso, corte))
        return (i === 0 ? d >= 0 : d > g.min) && d <= g.max
      }).length,
    })),
  }
}
export type DatosInforme = ReturnType<typeof calcularInforme> & {
  tendencia?: {
    periodo: string
    nuevos: number | null
    cerrados: number | null
    abiertos: number | null
  }[]
  comparacion?: { nuevos: number; cerrados: number; abiertos: number } | null
}
