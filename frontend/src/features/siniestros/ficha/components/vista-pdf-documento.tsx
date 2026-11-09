import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'
import { Button } from '@/components/ui/button'
import { Aviso } from '@/components/aviso'
import { rutaLoginSesionVencida } from '@/lib/api'

GlobalWorkerOptions.workerSrc = worker

function PaginaPdf({ pdf, pagina, zoom }: { pdf: PDFDocumentProxy; pagina: number; zoom: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const contenedor = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    const observer = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width))
    observer.observe(contenedor.current!)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!ancho) return
    let cancelado = false
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    void (async () => {
      const page = await pdf.getPage(pagina)
      if (cancelado) return
      const base = page.getViewport({ scale: 1 })
      // Tope de área para PDFs con páginas enormes. El zoom aumenta detalle, no estira un bitmap.
      const escala = Math.min(
        (ancho / base.width) * zoom,
        Math.sqrt(8000000 / (base.width * base.height)),
      )
      const viewport = page.getViewport({ scale: escala })
      const pixel = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(16000000 / (viewport.width * viewport.height)),
      )
      const lienzo = canvas.current!
      lienzo.width = Math.floor(viewport.width * pixel)
      lienzo.height = Math.floor(viewport.height * pixel)
      lienzo.style.width = `${viewport.width}px`
      lienzo.style.height = `${viewport.height}px`
      render = page.render({
        canvas: lienzo,
        viewport,
        transform: pixel === 1 ? undefined : [pixel, 0, 0, pixel, 0, 0],
      })
      await render.promise
      const contenido = await page.getTextContent()
      if (!cancelado) {
        setTexto(contenido.items.map((item) => ('str' in item ? item.str : '')).join(' '))
        setCargando(false)
      }
    })().catch((err: unknown) => {
      if (!cancelado && !(err instanceof Error && err.name === 'RenderingCancelledException')) {
        setError(true)
        setCargando(false)
      }
    })
    return () => {
      cancelado = true
      render?.cancel()
    }
  }, [pdf, pagina, zoom, ancho])
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {cargando && <p role="status">Preparando página…</p>}
      {error && (
        <Aviso tipo="error">No se pudo mostrar esta página. Podés descargar el PDF original.</Aviso>
      )}
      <div
        ref={contenedor}
        tabIndex={0}
        role="region"
        aria-label={`Página ${pagina}; al ampliar podés desplazarte dentro del documento`}
        className="max-h-[55dvh] min-w-0 overflow-auto overscroll-contain rounded-lg border-2 border-line bg-surface-subtle focus-visible:outline-3 focus-visible:outline-ring"
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Página ${pagina} del PDF`}
          className="mx-auto block max-w-none"
        />
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer font-semibold text-primary">
          Texto de esta página
        </summary>
        <p className="mt-3 break-words whitespace-pre-wrap">
          {texto || 'Esta página no tiene texto extraíble; puede ser un escaneo.'}
        </p>
      </details>
    </div>
  )
}

export default function VistaPdfDocumento({ ruta }: { ruta: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const abortar = new AbortController()
    let tarea: ReturnType<typeof getDocument> | undefined
    void (async () => {
      const respuesta = await fetch(ruta, {
        credentials: 'same-origin',
        signal: abortar.signal,
        cache: 'no-store',
      })
      if (respuesta.status === 401) window.location.assign(rutaLoginSesionVencida())
      if (!respuesta.ok) {
        const datos: unknown = await respuesta.json().catch(() => null)
        const mensaje =
          datos && typeof datos === 'object' && 'error' in datos && typeof datos.error === 'string'
            ? datos.error
            : null
        throw new Error(
          respuesta.status < 500 && mensaje
            ? mensaje
            : 'No se pudo abrir el PDF. Reintentá o descargá el original.',
        )
      }
      const data = new Uint8Array(await respuesta.arrayBuffer())
      if (abortar.signal.aborted) return
      tarea = getDocument({
        data,
        disableWorkerRendering: true,
        cMapUrl: '/pdf-recursos/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/pdf-recursos/standard_fonts/',
        wasmUrl: '/pdf-recursos/wasm/',
      })
      const documento = await tarea.promise
      if (!abortar.signal.aborted) setPdf(documento)
    })().catch((err: unknown) => {
      if (!abortar.signal.aborted)
        setError(
          err instanceof Error && err.name === 'PasswordException'
            ? 'Este PDF está protegido con contraseña. Descargalo para abrirlo con tu lector.'
            : err instanceof Error
              ? err.message
              : 'No se pudo abrir el PDF.',
        )
    })
    return () => {
      abortar.abort()
      void tarea?.destroy()
    }
  }, [ruta, intento])
  if (error)
    return (
      <div className="grid gap-3">
        <Aviso tipo="error">{error}</Aviso>
        <Button
          variant="outline"
          onClick={() => {
            setError('')
            setPdf(null)
            setIntento((n) => n + 1)
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reintentar PDF
        </Button>
      </div>
    )
  if (!pdf) return <p role="status">Cargando PDF…</p>
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Controles del PDF"
      >
        <Button
          size="icon"
          variant="outline"
          aria-label="Página anterior"
          disabled={pagina === 1}
          onClick={() => setPagina((p) => p - 1)}
        >
          <ChevronLeft />
        </Button>
        <output className="dato" aria-live="polite">
          Página {pagina} de {pdf.numPages}
        </output>
        <Button
          size="icon"
          variant="outline"
          aria-label="Página siguiente"
          disabled={pagina === pdf.numPages}
          onClick={() => setPagina((p) => p + 1)}
        >
          <ChevronRight />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
          Ajustar
        </Button>
        <span className="inline-flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label="Alejar PDF"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <ZoomOut />
          </Button>
          <output aria-label="Zoom del PDF" aria-live="polite">
            {Math.round(zoom * 100)}%
          </output>
          <Button
            size="icon"
            variant="outline"
            aria-label="Acercar PDF"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          >
            <ZoomIn />
          </Button>
        </span>
      </div>
      <PaginaPdf key={`${pagina}-${zoom}`} pdf={pdf} pagina={pagina} zoom={zoom} />
    </div>
  )
}
