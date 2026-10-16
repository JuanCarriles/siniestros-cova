import { useEffect, useRef, useState, type FormEvent } from 'react'
import { aseguradoraSchema } from '@cova/shared/schemas/aseguradoras'
import { Building2, Plus, Search } from 'lucide-react'
import { EstadoChip } from '@/components/estado-chip'
import { TableEmpty } from '@/components/table-empty'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Aseguradora = {
  id: number
  nombre: string
  eliminado: boolean
  fechaBaja: string | null
  cantidadAjustadores: number
}
type Edicion = { tipo: 'crear' } | { tipo: 'editar'; aseguradora: Aseguradora }

async function api(path: string, init?: RequestInit): Promise<unknown> {
  let respuesta: Response
  const base =
    import.meta.env.DEV && window.location.pathname.startsWith('/vista-previa/')
      ? '/api/vista-previa/aseguradoras'
      : '/api/aseguradoras'
  try {
    respuesta = await fetch(`${base}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new Error('No se pudo conectar con la API. Comprobá que el servidor esté en marcha.')
  }
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error || 'No se pudo completar la operación. Intentá nuevamente.')
  }
  return respuesta.status === 204 ? null : respuesta.json()
}

export function AseguradorasPage() {
  const [filas, setFilas] = useState<Aseguradora[]>([])
  const [incluirBajas, setIncluirBajas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [baja, setBaja] = useState<Aseguradora | null>(null)
  const [nombre, setNombre] = useState('')
  const [errorNombre, setErrorNombre] = useState('')
  const [errorCarga, setErrorCarga] = useState('')
  const [errorOperacion, setErrorOperacion] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [revision, setRevision] = useState(0)
  const envioEnCurso = useRef(false)

  useEffect(() => {
    let vigente = true
    api(`?incluirBajas=${incluirBajas}`)
      .then((datos) => {
        if (vigente) {
          setFilas(datos as Aseguradora[])
          setErrorCarga('')
        }
      })
      .catch((fallo: unknown) => {
        if (vigente)
          setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudo cargar el listado.')
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [incluirBajas, revision])

  function abrirEdicion(valor: Edicion) {
    setEdicion(valor)
    setNombre(valor.tipo === 'editar' ? valor.aseguradora.nombre : '')
    setErrorNombre('')
    setErrorOperacion('')
    setMensaje('')
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!edicion || envioEnCurso.current) return
    const validacion = aseguradoraSchema.safeParse({ nombre })
    if (!validacion.success) {
      setErrorNombre(validacion.error.issues[0]?.message || 'Ingresá un nombre válido.')
      return
    }
    envioEnCurso.current = true
    setEnviando(true)
    setErrorOperacion('')
    try {
      await api(edicion.tipo === 'crear' ? '' : `/${edicion.aseguradora.id}`, {
        method: edicion.tipo === 'crear' ? 'POST' : 'PATCH',
        body: JSON.stringify(validacion.data),
      })
      setMensaje(edicion.tipo === 'crear' ? 'Aseguradora creada.' : 'Cambios guardados.')
      setEdicion(null)
      setCargando(true)
      setRevision((actual) => actual + 1)
    } catch (fallo) {
      setErrorOperacion(
        fallo instanceof Error ? fallo.message : 'No se pudo guardar la aseguradora.',
      )
    } finally {
      envioEnCurso.current = false
      setEnviando(false)
    }
  }

  async function cambiarEstado(aseguradora: Aseguradora) {
    if (envioEnCurso.current) return
    envioEnCurso.current = true
    setEnviando(true)
    setErrorOperacion('')
    try {
      await api(`/${aseguradora.id}/${aseguradora.eliminado ? 'reactivacion' : 'baja'}`, {
        method: 'PATCH',
      })
      setMensaje(aseguradora.eliminado ? 'Aseguradora reactivada.' : 'Aseguradora dada de baja.')
      setBaja(null)
      setCargando(true)
      setRevision((actual) => actual + 1)
    } catch (fallo) {
      setErrorOperacion(fallo instanceof Error ? fallo.message : 'No se pudo cambiar el estado.')
    } finally {
      envioEnCurso.current = false
      setEnviando(false)
    }
  }

  const visibles = filas.filter((fila) =>
    fila.nombre.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')),
  )

  return (
    <>
      <div className="mb-8 max-w-3xl">
        <div className="mb-4 h-1 w-12 rounded-full bg-brand-accent" aria-hidden="true" />
        <h1 className="text-3xl font-bold tracking-tight text-primary">Aseguradoras</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Las compañías con las que trabaja el estudio.
        </p>
      </div>

      <section
        aria-label="Administrar aseguradoras"
        className="overflow-hidden rounded-xl border bg-card shadow-card"
      >
        <div className="grid gap-4 border-b p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="buscar-aseguradora">Buscar por nombre</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="buscar-aseguradora"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                className="pl-11"
              />
            </div>
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-input px-4 py-2 font-medium focus-within:outline-3 focus-within:outline-ring">
            <Checkbox
              checked={incluirBajas}
              onChange={(evento) => {
                setIncluirBajas(evento.target.checked)
                setCargando(true)
                setMensaje('')
              }}
            />
            Incluir dadas de baja
          </label>
          <Button onClick={() => abrirEdicion({ tipo: 'crear' })} className="w-full lg:w-auto">
            <Plus aria-hidden="true" /> Nueva aseguradora
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-4 sm:px-6">
          <h2 className="font-semibold">
            {cargando
              ? 'Cargando listado…'
              : errorCarga && filas.length === 0
                ? 'Listado no disponible'
                : `${visibles.length} ${visibles.length === 1 ? 'aseguradora' : 'aseguradoras'}`}
          </h2>
          <p className="text-sm text-muted-foreground">Se cuentan sólo los ajustadores activos.</p>
        </div>
        {mensaje && (
          <p
            role="status"
            className="border-b bg-ok-bg px-4 py-3 font-semibold text-ok-ink sm:px-6"
          >
            {mensaje}
          </p>
        )}
        {errorCarga && (
          <p
            role="alert"
            className="border-b bg-danger-bg px-4 py-3 font-semibold text-danger-ink sm:px-6"
          >
            {errorCarga}
          </p>
        )}
        {errorOperacion && errorOperacion !== errorCarga && !edicion && !baja && (
          <p
            role="alert"
            className="border-b bg-danger-bg px-4 py-3 font-semibold text-danger-ink sm:px-6"
          >
            {errorOperacion}
          </p>
        )}

        <Table containerLabel="Listado de aseguradoras">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Aseguradora</TableHead>
              <TableHead scope="col" className="text-right">
                Ajustadores activos
              </TableHead>
              <TableHead scope="col">Estado</TableHead>
              <TableHead scope="col">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargando ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center" role="status">
                  Cargando aseguradoras…
                </TableCell>
              </TableRow>
            ) : errorCarga && filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
                  <p className="font-semibold">No se pudo cargar el listado.</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setCargando(true)
                      setRevision((actual) => actual + 1)
                    }}
                  >
                    Reintentar
                  </Button>
                </TableCell>
              </TableRow>
            ) : visibles.length === 0 ? (
              <TableEmpty
                colSpan={4}
                title={busqueda ? 'No hay resultados' : 'Todavía no hay aseguradoras'}
                description={
                  busqueda
                    ? 'Probá con otro nombre.'
                    : incluirBajas
                      ? 'Podés crear una aseguradora nueva.'
                      : 'Podés crear una nueva o incluir las dadas de baja.'
                }
              />
            ) : (
              visibles.map((fila) => (
                <TableRow key={fila.id}>
                  <TableCell className="min-w-48 font-semibold">{fila.nombre}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {fila.cantidadAjustadores}
                  </TableCell>
                  <TableCell>
                    <EstadoChip estado={fila.eliminado ? 'Dada de baja' : 'Activa'} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {!fila.eliminado && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirEdicion({ tipo: 'editar', aseguradora: fila })}
                        >
                          Editar {fila.nombre}
                        </Button>
                      )}
                      {fila.eliminado ? (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={enviando}
                          onClick={() => void cambiarEstado(fila)}
                        >
                          Reactivar {fila.nombre}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setBaja(fila)
                            setErrorOperacion('')
                            setMensaje('')
                          }}
                        >
                          Dar de baja {fila.nombre}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <p className="flex items-start gap-2 border-t px-4 py-4 text-sm text-muted-foreground sm:px-6">
          <Building2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          La baja conserva los ajustadores, vehículos y siniestros asociados.
        </p>
      </section>

      <Dialog
        open={edicion !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !enviando) setEdicion(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edicion?.tipo === 'editar' ? 'Editar aseguradora' : 'Nueva aseguradora'}
            </DialogTitle>
            <DialogDescription>Ingresá el nombre de la compañía.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(evento) => void guardar(evento)} className="grid gap-5">
            <TextField
              label="Nombre de la aseguradora"
              value={nombre}
              onChange={(evento) => {
                setNombre(evento.target.value)
                setErrorNombre('')
              }}
              required
              maxLength={100}
              error={errorNombre}
              autoFocus
            />
            {errorOperacion && (
              <p role="alert" className="font-semibold text-destructive">
                {errorOperacion}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdicion(null)} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" loading={enviando}>
                {edicion?.tipo === 'editar' ? 'Guardar cambios' : 'Crear aseguradora'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={baja !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !enviando) setBaja(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar de baja aseguradora</DialogTitle>
            <DialogDescription>
              ¿Querés dar de baja a {baja?.nombre}? Sus registros asociados se conservarán.
            </DialogDescription>
          </DialogHeader>
          {errorOperacion && (
            <p role="alert" className="font-semibold text-destructive">
              {errorOperacion}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaja(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={enviando}
              onClick={() => {
                if (baja) void cambiarEstado(baja)
              }}
            >
              Confirmar baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
