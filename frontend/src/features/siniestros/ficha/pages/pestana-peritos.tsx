import { CircleDashed, Stethoscope, Wrench, type LucideIcon } from 'lucide-react'
import type { TipoPerito } from '@cova/shared/schemas/enums'
import { Badge } from '@/components/ui/badge'
import { email, telefono } from '../../components/contacto'
import { Dato } from '../../components/dato'
import { PestanaFicha } from '../components/pestana-ficha'
import { fechaDe } from '../formato'
import { usePestana } from '../hooks/use-ficha'

const TIPOS: Record<
  TipoPerito,
  { titulo: string; tema: string; icono: LucideIcon; nombre: string }
> = {
  CESVI: {
    titulo: 'Perito CESVI',
    tema: 'Daños materiales del vehículo',
    icono: Wrench,
    nombre: 'un perito CESVI',
  },
  MEDICO: {
    titulo: 'Perito médico',
    tema: 'Lesiones de las personas',
    icono: Stethoscope,
    nombre: 'un perito médico',
  },
}

// Pestaña "Peritos" (CU-10 1.e): un lugar para el CESVI y otro para el médico, con su contacto y las fechas de
// solicitud y de cierre. Sin fecha de cierre, la pericia sigue en curso (CU-09 29.a).
export function PestanaPeritos() {
  const peritos = usePestana<'peritos'>()
  return (
    <PestanaFicha titulo="Peritos del siniestro" nota="Un perito CESVI y uno médico como máximo">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {(Object.keys(TIPOS) as TipoPerito[]).map((tipo) => {
          const { titulo, tema, icono: Icono, nombre } = TIPOS[tipo]
          const delTipo = peritos.filter((p) => p.tipo === tipo)
          const encabezado = (
            <span className="flex items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-info-bg text-info-ink">
                <Icono className="size-6" aria-hidden="true" />
              </span>
              <span className="grid">
                <span className="text-xl font-bold">{titulo}</span>
                <span className="font-normal text-muted-foreground">{tema}</span>
              </span>
            </span>
          )
          if (delTipo.length === 0)
            return (
              <section
                key={tipo}
                className="grid gap-4 rounded-lg border-2 border-dashed border-line-strong p-5"
              >
                <h3>{encabezado}</h3>
                <p className="flex items-center gap-2 border-t-2 border-line pt-4 text-lg text-muted-foreground">
                  <CircleDashed className="size-5" aria-hidden="true" />
                  Todavía no hay {nombre} cargado.
                </p>
              </section>
            )
          return delTipo.map((p) => (
            <section
              key={p.id}
              className="grid gap-4 rounded-lg border-2 border-line-strong bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3>{encabezado}</h3>
                {p.cerrado ? (
                  <Badge variant="success">Cerrada</Badge>
                ) : (
                  <Badge variant="warning">En curso</Badge>
                )}
              </div>
              <dl className="grid gap-x-6 gap-y-4 border-t-2 border-line pt-4 text-lg sm:grid-cols-2">
                <Dato etiqueta="Nombre" ancho>
                  <strong>{p.nombre}</strong>
                </Dato>
                <Dato etiqueta="Teléfono">{telefono(p.telefono)}</Dato>
                <Dato etiqueta="Email">{email(p.email)}</Dato>
                <Dato etiqueta="Fecha de solicitud">
                  <span className="dato">{fechaDe(p.fechaSolicitud)}</span>
                </Dato>
                <Dato etiqueta="Fecha de cierre">
                  {p.fechaCierre ? (
                    <span className="dato">{fechaDe(p.fechaCierre)}</span>
                  ) : (
                    'Sin cerrar'
                  )}
                </Dato>
              </dl>
            </section>
          ))
        })}
      </div>
    </PestanaFicha>
  )
}
