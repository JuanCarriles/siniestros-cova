import { useRevalidator } from 'react-router'
import { Aviso } from '@/components/aviso'
import { CargaDocumentos } from '../components/carga-documentos'
import { FileStack } from 'lucide-react'
import { roleLabels } from '@/components/layout/panel-navigation'
import { IconoArchivo } from '@/features/plantillas/components/icono-archivo'
import { formatoTamanoArchivo } from '@/features/plantillas/formato-archivo'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { usePestana, useFicha } from '../hooks/use-ficha'

// Pestaña "Documentos" (CU-10 1.g): nombre, tipo, quién lo cargó y cuándo, del más nuevo al más viejo. Verlos y
// descargarlos (1.g.2) llega con su historia.
export function PestanaDocumentos() {
  const documentos = usePestana<'documentos'>()
  const ficha = useFicha()
  const revalidator = useRevalidator()
  return (
    <PestanaFicha titulo="Documentos" cantidad={documentos.length}>
      {!ficha.fechaBaja && !ficha.estado.esCierre ? (
        <CargaDocumentos
          key={ficha.id}
          idSiniestro={ficha.id}
          onSubido={() => {
            void revalidator.revalidate()
          }}
        />
      ) : (
        <Aviso tipo="info" className="mb-5">
          Este siniestro está cerrado o dado de baja: podés consultar sus documentos, pero no cargar
          nuevos.
        </Aviso>
      )}
      {documentos.length === 0 ? (
        <PestanaVacia icono={FileStack}>Este siniestro todavía no tiene documentos.</PestanaVacia>
      ) : (
        <ul
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Documentos del expediente"
        >
          {documentos.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap content-start items-start gap-x-3 gap-y-3 rounded-lg border-2 border-line-strong bg-card p-4"
            >
              <IconoArchivo extension={d.tipoExtension} />
              <span className="grid min-w-0 flex-1 basis-40">
                <span className="text-lg font-semibold break-all">{d.nombreOriginal}</span>
                <span className="text-muted-foreground">
                  {d.tipoExtension.toUpperCase()} · {formatoTamanoArchivo(Number(d.tamanoBytes))}
                </span>
              </span>
              <span className="grid w-full gap-1 border-t pt-3 text-left">
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
