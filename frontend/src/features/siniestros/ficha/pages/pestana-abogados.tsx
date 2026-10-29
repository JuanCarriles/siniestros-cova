import { Gavel } from 'lucide-react'
import { email, telefono } from '../../components/contacto'
import { Dato } from '../../components/dato'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { nombreDe } from '../formato'
import { usePestana } from '../hooks/use-ficha'

// Pestaña "Abogados" (CU-10 1.d): cada abogado con sus datos de contacto y las personas que representa
export function PestanaAbogados() {
  const abogados = usePestana<'abogados'>()
  return (
    <PestanaFicha titulo="Abogados de terceros" cantidad={abogados.length}>
      {abogados.length === 0 ? (
        <PestanaVacia icono={Gavel}>
          Ninguna persona del siniestro tiene abogado cargado.
        </PestanaVacia>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {abogados.map((a) => (
            <li key={a.id}>
              <article className="grid gap-4 rounded-lg border-2 border-line-strong bg-card p-5">
                <header className="grid gap-1">
                  <p className="flex items-center gap-2 text-sm font-bold tracking-wider text-muted-foreground uppercase">
                    <Gavel className="size-4" aria-hidden="true" />
                    Abogado
                  </p>
                  <h3 className="text-xl font-bold">{a.nombreCompleto}</h3>
                </header>
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Dato etiqueta="Matrícula">
                    {a.numeroMatricula && <span className="dato">{a.numeroMatricula}</span>}
                  </Dato>
                  <Dato etiqueta="Teléfono">{telefono(a.telefono)}</Dato>
                  <Dato etiqueta="Email" ancho>
                    {email(a.email)}
                  </Dato>
                  <Dato etiqueta="Representa a" ancho>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {a.representa.map((p) => (
                        <li
                          key={p.id}
                          className="rounded-md bg-neutral-bg px-3 py-1 font-semibold text-neutral-ink"
                        >
                          {nombreDe(p)}
                        </li>
                      ))}
                    </ul>
                  </Dato>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
    </PestanaFicha>
  )
}
