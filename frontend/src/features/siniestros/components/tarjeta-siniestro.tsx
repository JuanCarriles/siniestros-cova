import type { ReactNode } from 'react'
import { MenuAcciones, type AccionFila } from '@/components/abm/menu-acciones'
import type { SiniestroListado } from '@cova/shared/schemas/siniestros'
import {
  CeldaAbogado,
  CeldaAsegurado,
  CeldaAseguradora,
  CeldaEstado,
  CeldaGestor,
  CeldaPericias,
  CeldaSiniestro,
  CeldaTerceros,
  DiasSinMovimiento,
  type AlVer,
} from './celdas-siniestro'

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// En celular cada siniestro es una tarjeta (RNF-02), con los mismos datos que la fila de la tabla: arriba el número,
// el estado y el semáforo; abajo las partes en dos columnas cuando hay lugar.
export function TarjetaSiniestro({
  siniestro,
  href,
  esGestor,
  onVer,
  acciones,
}: {
  siniestro: SiniestroListado
  href: string
  esGestor: boolean
  onVer: AlVer
  acciones: AccionFila[]
}) {
  return (
    <article
      aria-label={`Siniestro ${siniestro.numeroSiniestro}`}
      className="grid gap-4 px-4 py-5 sm:px-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
          <CeldaSiniestro siniestro={siniestro} href={href} />
          <CeldaEstado siniestro={siniestro} />
        </div>
        <MenuAcciones nombre={`siniestro ${siniestro.numeroSiniestro}`} acciones={acciones} />
      </div>
      <div>
        <DiasSinMovimiento
          dias={siniestro.diasSinMovimiento}
          cerrado={siniestro.estado.esCierre}
          conTexto
        />
      </div>
      <dl className="grid gap-3 min-[30rem]:grid-cols-2">
        <Fila etiqueta="Asegurado">
          <span className="font-semibold">
            <CeldaAsegurado siniestro={siniestro} />
          </span>
        </Fila>
        <Fila etiqueta="Terceros">
          <CeldaTerceros siniestro={siniestro} onVer={onVer} />
        </Fila>
        <Fila etiqueta="Aseguradora y ajustador">
          <CeldaAseguradora siniestro={siniestro} onVer={onVer} />
        </Fila>
        {!esGestor && (
          <Fila etiqueta="Gestor y asignación">
            <CeldaGestor siniestro={siniestro} />
          </Fila>
        )}
        <Fila etiqueta="Pericias">
          <CeldaPericias siniestro={siniestro} onVer={onVer} />
        </Fila>
        <Fila etiqueta="Abogado">
          <CeldaAbogado siniestro={siniestro} onVer={onVer} />
        </Fila>
      </dl>
    </article>
  )
}
