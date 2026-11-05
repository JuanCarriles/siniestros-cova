import { useEffect, useRef, useState } from 'react'
import type { DocumentoFicha } from '@cova/shared/schemas/ficha-siniestro'
import { BajaDocumentoDialog } from '../components/baja-documento-dialog'
import { useRevalidator } from 'react-router'
import { Aviso } from '@/components/aviso'
import { CargaDocumentos } from '../components/carga-documentos'
import { ImagenDocumento } from '../components/imagen-documento'
import { rutaArchivoDocumento } from '../documentos/rutas'
import { Button } from '@/components/ui/button'
import { FileStack, Download, ArchiveX } from 'lucide-react'
import { roleLabels } from '@/components/layout/panel-navigation'
import { formatoTamanoArchivo } from '@/features/plantillas/formato-archivo'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { fechaHoraDe } from '../formato'
import { usePestana, useFicha } from '../hooks/use-ficha'

// Pestaña "Documentos" (CU-10 1.g): nombre, tipo, quién lo cargó y cuándo, del más nuevo al más viejo. Verlos y
// Imágenes con miniatura y vista; la descarga siempre conserva el archivo original.
export function PestanaDocumentos() {
  const documentos = usePestana<'documentos'>()
  const ficha = useFicha()
  const revalidator = useRevalidator()
  const [aDarDeBaja, setADarDeBaja] = useState<DocumentoFicha | null>(null)
  const [exito, setExito] = useState('')
  const aviso = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exito) return
    const timer = window.setTimeout(() => setExito(''), 6000)
    return () => window.clearTimeout(timer)
  }, [exito])
  return (
    <PestanaFicha titulo="Documentos" cantidad={documentos.length}>
      {exito && (
        <Aviso tipo="exito" ref={aviso} enfocar className="mb-4">
          {exito}
        </Aviso>
      )}
      {aDarDeBaja && (
        <BajaDocumentoDialog
          documento={aDarDeBaja}
          idSiniestro={ficha.id}
          onCerrar={() => setADarDeBaja(null)}
          onDesactualizado={() => {
            void revalidator.revalidate()
          }}
          onHecho={() => {
            setADarDeBaja(null)
            setExito(
              'Documento dado de baja. El motivo, la fecha y el autor quedaron en el historial.',
            )
            void revalidator.revalidate()
          }}
        />
      )}
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
              className="flex flex-col items-start gap-3 rounded-lg border-2 border-line-strong bg-card p-4"
            >
              <ImagenDocumento key={d.id} documento={d} idSiniestro={ficha.id} />
              <span className="grid w-full min-w-0 gap-1">
                <span className="text-lg font-semibold break-words">{d.nombreOriginal}</span>
                <span className="text-muted-foreground">
                  {d.tipoExtension.toUpperCase()} · Original:{' '}
                  {formatoTamanoArchivo(Number(d.tamanoBytes))}
                </span>
                {d.imagen && (
                  <span className="text-muted-foreground">
                    Resolución original: {d.imagen.anchoOriginal} × {d.imagen.altoOriginal} px
                  </span>
                )}
              </span>
              <Button asChild variant="outline" className="mt-auto w-full">
                <a
                  href={rutaArchivoDocumento(ficha.id, d.id, 'original')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download aria-hidden="true" />
                  Descargar original
                </a>
              </Button>
              {d.baja?.permitida ? (
                <Button
                  variant="ghost"
                  className="w-full text-destructive"
                  onClick={() => setADarDeBaja(d)}
                  aria-label={`Dar de baja ${d.nombreOriginal}`}
                >
                  <ArchiveX aria-hidden="true" />
                  Dar de baja
                </Button>
              ) : (
                d.baja?.motivo && <p className="text-sm text-muted-foreground">{d.baja.motivo}</p>
              )}
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
