import { FileStack } from 'lucide-react'
import { roleLabels } from '@/components/layout/panel-navigation'
import { IconoArchivo } from '@/features/plantillas/components/icono-archivo'
import { formatoTamanoArchivo } from '@/features/plantillas/formato-archivo'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { usePestana } from '../hooks/use-ficha'

// Pestaña "Documentos" (CU-10 1.g): nombre, tipo, quién lo cargó y cuándo, del más nuevo al más viejo. Verlos y
// descargarlos (1.g.2) llega con su historia.
export function PestanaDocumentos() {
  const documentos = usePestana<'documentos'>()
  return (
    <PestanaFicha titulo="Documentos" cantidad={documentos.length}>
      {documentos.length === 0 ? (
        <PestanaVacia icono={FileStack}>Este siniestro todavía no tiene documentos.</PestanaVacia>
      ) : (
        <ul className="grid gap-2">
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-2 border-line-strong bg-card px-4 py-3"
            >
              <IconoArchivo extension={d.tipoExtension} />
              <span className="grid min-w-0 flex-1 basis-60">
                <span className="text-lg font-semibold break-all">{d.nombreOriginal}</span>
                <span className="text-muted-foreground">
                  {d.tipoExtension.toUpperCase()} · {formatoTamanoArchivo(Number(d.tamanoBytes))}
                </span>
              </span>
              <span className="grid text-right max-sm:text-left">
                <span>
                  Cargado por <strong>{d.autor.nombre}</strong>{' '}
                  <span className="text-muted-foreground">({roleLabels[d.autor.tipoUsuario]})</span>
                </span>
                <time dateTime={d.fechaCarga} className="dato text-muted-foreground">
                  {fechaHoraDe(d.fechaCarga)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PestanaFicha>
  )
}
