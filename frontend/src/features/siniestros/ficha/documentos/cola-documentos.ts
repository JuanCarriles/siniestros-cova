import { errorArchivoDocumento } from '@cova/shared/schemas/documentos'
import { ApiError } from '../../../../lib/api.ts'
import type { ArchivoPreparado } from './transporte'

export type EstadoCarga =
  'pendiente' | 'comprimiendo' | 'subiendo' | 'guardando' | 'completo' | 'error'
export type CargaDocumento = {
  id: string
  archivo: File
  estado: EstadoCarga
  progreso: number
  error?: string
  reintentable?: boolean
  preparado?: ArchivoPreparado
}
type Dependencias = {
  preparar: (archivo: File, signal: AbortSignal) => Promise<ArchivoPreparado>
  enviar: (
    carga: CargaDocumento,
    preparado: ArchivoPreparado,
    progreso: (valor: number) => void,
    guardando: () => void,
    signal: AbortSignal,
  ) => Promise<number>
  guardado: () => void
}
// Una sola operación por cola. Los errores no borran las filas completas ni detienen las siguientes.
export class ColaDocumentos {
  private filas: CargaDocumento[] = []
  private oyentes = new Set<() => void>()
  private ocupada = false
  private activa = true
  private controlador?: AbortController
  private deps: Dependencias
  constructor(deps: Dependencias) {
    this.deps = deps
  }
  instantanea = () => this.filas
  suscribir = (oyente: () => void) => {
    this.oyentes.add(oyente)
    return () => {
      this.oyentes.delete(oyente)
    }
  }
  private publicar(filas: CargaDocumento[]) {
    this.filas = filas
    this.oyentes.forEach((o) => o())
  }
  private cambiar(id: string, cambio: Partial<CargaDocumento>) {
    this.publicar(this.filas.map((f) => (f.id === id ? { ...f, ...cambio } : f)))
  }
  agregar(archivos: File[]) {
    this.publicar([
      ...this.filas,
      ...archivos.map((archivo) => {
        const error = errorArchivoDocumento(archivo)
        return {
          id: crypto.randomUUID(),
          archivo,
          estado: error ? ('error' as const) : ('pendiente' as const),
          progreso: 0,
          ...(error ? { error, reintentable: false } : {}),
        }
      }),
    ])
    void this.procesar()
  }
  reintentar(id: string) {
    const fila = this.filas.find((f) => f.id === id)
    if (fila?.estado !== 'error' || !fila.reintentable) return
    this.cambiar(id, { estado: 'pendiente', progreso: 0, error: undefined })
    void this.procesar()
  }
  quitar(id: string) {
    this.publicar(
      this.filas.filter(
        (f) => f.id !== id || ['comprimiendo', 'subiendo', 'guardando'].includes(f.estado),
      ),
    )
  }
  activar() {
    this.activa = true
    void this.procesar()
  }
  cerrar() {
    this.activa = false
    this.controlador?.abort()
  }
  private async procesar() {
    if (this.ocupada || !this.activa) return
    this.ocupada = true
    try {
      let siguiente: CargaDocumento | undefined
      while (this.activa && (siguiente = this.filas.find((f) => f.estado === 'pendiente'))) {
        const fila = siguiente
        const controlador = new AbortController()
        this.controlador = controlador
        try {
          this.cambiar(fila.id, { estado: 'comprimiendo' })
          const preparado =
            fila.preparado ?? (await this.deps.preparar(fila.archivo, controlador.signal))
          if (!this.activa) break
          this.cambiar(fila.id, { estado: 'subiendo', preparado })
          await this.deps.enviar(
            fila,
            preparado,
            (valor) => this.cambiar(fila.id, { progreso: valor }),
            () => this.cambiar(fila.id, { estado: 'guardando' }),
            controlador.signal,
          )
          if (!this.activa) break
          this.cambiar(fila.id, { estado: 'completo', progreso: 100, preparado: undefined })
          this.deps.guardado()
        } catch (error) {
          if (!this.activa) break
          this.cambiar(fila.id, {
            estado: 'error',
            error: error instanceof Error ? error.message : 'No se pudo cargar el archivo.',
            reintentable:
              !(error instanceof ApiError) ||
              error.status === 0 ||
              [408, 409, 429].includes(error.status) ||
              error.status >= 500,
          })
        }
      }
    } finally {
      this.controlador = undefined
      this.ocupada = false
    }
  }
}
