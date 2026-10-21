import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Gavel, Stethoscope, UserRound, UsersRound, Wrench } from 'lucide-react'
import type { PartesSiniestro } from '@cova/shared/schemas/siniestros'
import { Aviso } from '@/components/aviso'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { plural } from '@/lib/texto'
import { partesSiniestro } from '../api/siniestros.api'

/** Qué parte del siniestro mostrar (CU-09 3.b y 3.c) */
export type VistaPartes =
  | { tipo: 'ajustador' }
  | { tipo: 'perito'; id: number }
  | { tipo: 'abogados' }
  | { tipo: 'terceros' }

export type PedidoPartes = {
  siniestro: { id: number; numeroSiniestro: string }
  vista: VistaPartes
}

const fecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const formatearFecha = (iso: string) => fecha.format(new Date(iso))
const LESIONES = {
  LEVE: 'Leves',
  MODERADA: 'Moderadas',
  GRAVE: 'Graves',
  MUERTE: 'Muerte',
} as const

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-0.5">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="break-words">
        {children ?? <span className="text-muted-foreground">Sin dato</span>}
      </dd>
    </div>
  )
}

const email = (valor: string | null) =>
  valor ? (
    <a href={`mailto:${valor}`} className="text-primary underline underline-offset-4">
      {valor}
    </a>
  ) : null
const telefono = (valor: string | null) =>
  valor ? (
    <a
      href={`tel:${valor.replace(/[^\d+]/g, '')}`}
      className="dato text-primary underline underline-offset-4"
    >
      {valor}
    </a>
  ) : null

function Icono({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-info-bg text-info-ink [&_svg]:size-6">
      {children}
    </span>
  )
}

// Las partes se piden al abrir el diálogo y se guardan mientras la página siga abierta: abrir otra parte del mismo
// siniestro no vuelve a consultar.
export function PartesDialog({
  pedido,
  onCerrar,
}: {
  pedido: PedidoPartes | null
  onCerrar: () => void
}) {
  const cache = useRef(new Map<number, PartesSiniestro>())
  const [partes, setPartes] = useState<PartesSiniestro | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = pedido?.siniestro.id

  useEffect(() => {
    if (id === undefined) return
    const guardadas = cache.current.get(id)
    if (guardadas) {
      // Un error de otro siniestro no puede quedar a la vista junto a estos datos
      setError(null)
      setPartes(guardadas)
      return
    }
    let vigente = true
    setPartes(null)
    setError(null)
    partesSiniestro(id)
      .then((datos) => {
        cache.current.set(id, datos)
        if (vigente) setPartes(datos)
      })
      .catch((err: unknown) => {
        if (vigente) {
          setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los datos.')
        }
      })
    return () => {
      vigente = false
    }
  }, [id])

  const listas = partes?.siniestro.id === id ? partes : null
  const vista = pedido?.vista
  const numero = pedido?.siniestro.numeroSiniestro ?? ''
  const perito =
    vista?.tipo === 'perito' ? listas?.peritos.find((p) => p.id === vista.id) : undefined

  let icono: ReactNode = <UsersRound />
  let titulo = 'Datos del siniestro'
  let subtitulo = `Siniestro ${numero}`
  let ancho: 'wide' | undefined
  if (vista?.tipo === 'ajustador') {
    icono = <UserRound />
    titulo = listas?.ajustador
      ? `${listas.ajustador.nombres} ${listas.ajustador.apellidos}`
      : 'Ajustador'
    subtitulo = listas?.ajustador ? `Ajustador · ${listas.ajustador.aseguradora}` : subtitulo
  } else if (vista?.tipo === 'perito') {
    icono = perito?.tipo === 'MEDICO' ? <Stethoscope /> : <Wrench />
    titulo = perito?.nombre ?? 'Perito'
    subtitulo = `Perito ${perito?.tipo === 'MEDICO' ? 'médico' : 'CESVI'} · siniestro ${numero}`
  } else if (vista?.tipo === 'abogados') {
    icono = <Gavel />
    titulo =
      listas?.abogados.length === 1
        ? (listas.abogados[0]?.nombreCompleto ?? '')
        : 'Abogados del siniestro'
  } else if (vista?.tipo === 'terceros') {
    titulo = 'Terceros del siniestro'
    subtitulo = listas ? `${numero} · ${plural(listas.terceros.length, 'tercero')}` : subtitulo
    ancho = 'wide'
  }

  return (
    <Dialog open={pedido !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent size={ancho}>
        <DialogHeader className="flex-row items-center gap-4 text-left">
          <Icono>{icono}</Icono>
          <div className="grid gap-1">
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{subtitulo}</DialogDescription>
          </div>
        </DialogHeader>

        {error && (
          <Aviso tipo="error" enfocar>
            {error}
          </Aviso>
        )}
        {!listas && !error && (
          <p role="status" className="py-6 text-center text-muted-foreground">
            Cargando datos…
          </p>
        )}

        {listas && vista?.tipo === 'ajustador' && (
          <dl className="grid gap-4 sm:grid-cols-2">
            {listas.ajustador ? (
              <>
                <Dato etiqueta="Nombres">{listas.ajustador.nombres}</Dato>
                <Dato etiqueta="Apellidos">{listas.ajustador.apellidos}</Dato>
                <Dato etiqueta="Email">{email(listas.ajustador.email)}</Dato>
                <Dato etiqueta="Teléfono">{telefono(listas.ajustador.telefono)}</Dato>
                <Dato etiqueta="Aseguradora">{listas.ajustador.aseguradora}</Dato>
              </>
            ) : (
              <p>Este siniestro no tiene ajustador asignado.</p>
            )}
          </dl>
        )}

        {listas && vista?.tipo === 'perito' && (
          <dl className="grid gap-4 sm:grid-cols-2">
            {perito ? (
              <>
                <Dato etiqueta="Nombre completo">{perito.nombre}</Dato>
                <Dato etiqueta="Teléfono">{telefono(perito.telefono)}</Dato>
                <Dato etiqueta="Email">{email(perito.email)}</Dato>
                <Dato etiqueta="Fecha de solicitud">
                  <span className="dato">{formatearFecha(perito.fechaSolicitud)}</span>
                </Dato>
                <Dato etiqueta="Fecha de cierre">
                  {perito.fechaCierre ? (
                    <span className="dato">{formatearFecha(perito.fechaCierre)}</span>
                  ) : (
                    <Badge variant="warning">En curso</Badge>
                  )}
                </Dato>
              </>
            ) : (
              <p>Ese perito ya no figura en el siniestro.</p>
            )}
          </dl>
        )}

        {listas && vista?.tipo === 'abogados' && (
          <ul className="grid gap-3">
            {listas.abogados.map((a) => (
              <li key={a.id} className="rounded-lg border bg-surface-subtle p-4">
                {listas.abogados.length > 1 && (
                  <p className="mb-3 font-semibold">{a.nombreCompleto}</p>
                )}
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Dato etiqueta="Matrícula">
                    {a.numeroMatricula !== null ? (
                      <span className="dato">{a.numeroMatricula}</span>
                    ) : null}
                  </Dato>
                  <Dato etiqueta="Teléfono">{telefono(a.telefono)}</Dato>
                  <Dato etiqueta="Email">{email(a.email)}</Dato>
                  <Dato etiqueta="Representa a">{a.representa.join(', ')}</Dato>
                </dl>
              </li>
            ))}
          </ul>
        )}

        {listas && vista?.tipo === 'terceros' && (
          <ul className="grid gap-3">
            {listas.terceros.map((t) => (
              <li key={t.id} className="rounded-lg border bg-surface-subtle p-4">
                <p className="mb-3 flex flex-wrap items-center gap-2 font-semibold">
                  {t.nombre}
                  {t.lesion && (
                    <Badge
                      variant={t.lesion.tipo === 'LEVE' ? 'warning' : 'danger'}
                      className="text-sm"
                    >
                      Lesiones {LESIONES[t.lesion.tipo].toLowerCase()}
                    </Badge>
                  )}
                </p>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Dato etiqueta="Rol">{t.rol}</Dato>
                  <Dato etiqueta="Documento">{t.documento}</Dato>
                  <Dato etiqueta="Teléfono">{telefono(t.telefono)}</Dato>
                  <Dato etiqueta="Email">{email(t.email)}</Dato>
                  <Dato etiqueta="Vehículo">
                    {t.vehiculo ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {t.vehiculo.descripcion}
                        <span className="rounded border border-line-strong px-1.5 dato text-sm font-semibold">
                          {t.vehiculo.dominio}
                        </span>
                      </span>
                    ) : (
                      'Fuera de los vehículos'
                    )}
                  </Dato>
                  <Dato etiqueta="Abogado">{t.abogado ?? 'Sin abogado'}</Dato>
                  <Dato etiqueta="Lesiones">
                    {t.lesion
                      ? `${LESIONES[t.lesion.tipo]}${t.lesion.descripcion ? `: ${t.lesion.descripcion}` : ''}`
                      : 'Sin lesiones'}
                  </Dato>
                </dl>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button>Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
