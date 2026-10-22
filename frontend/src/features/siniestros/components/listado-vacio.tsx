import { Archive, SearchX } from 'lucide-react'
import type { FiltroActivo } from '@/components/abm/filtros-activos'
import { Button } from '@/components/ui/button'

// Estado vacío del listado (CU-09 2.a y 2.b, E4-02): dice qué se buscó, por qué puede no haber resultados y qué
// probar. Si lo único que coincide está dado de baja, lo avisa y ofrece mostrarlos.
export function ListadoVacio({
  esGestor,
  filtros,
  bajasQueCoinciden,
  onMostrarBajas,
  onQuitarTodos,
}: {
  esGestor: boolean
  /** Filtros y búsqueda aplicados (los mismos que muestra FiltrosActivos) */
  filtros: FiltroActivo[]
  /** Dados de baja que coinciden y no se están mostrando (0 si ya se muestran o si es gestor) */
  bajasQueCoinciden: number
  onMostrarBajas: () => void
  onQuitarTodos: () => void
}) {
  const busqueda = filtros.find((f) => f.clave === 'q')
  const otros = filtros.filter((f) => f.clave !== 'q')
  const bajas =
    bajasQueCoinciden === 1 ? 'Hay 1 dado de baja' : `Hay ${bajasQueCoinciden} dados de baja`

  // Sin búsqueda ni filtros (CU-09 2.b). El alta llega en su propia historia.
  if (filtros.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 px-6 py-12 text-center">
        <Archive className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-lg font-semibold">
          {esGestor
            ? 'Todavía no tenés siniestros asignados.'
            : 'Todavía no hay siniestros activos.'}
        </p>
        {bajasQueCoinciden > 0 && (
          <>
            <p className="text-muted-foreground">{bajas}.</p>
            <Button variant="outline" onClick={onMostrarBajas}>
              Mostrar dados de baja
            </Button>
          </>
        )}
      </div>
    )
  }

  const describir = (f: FiltroActivo) => `${f.etiqueta.toLowerCase()} ${f.valor}`
  return (
    <div className="mx-auto grid max-w-2xl gap-4 px-6 py-12" role="status">
      <SearchX className="size-8 justify-self-center text-muted-foreground" aria-hidden="true" />
      <div className="text-center">
        <p className="text-lg font-semibold">
          {busqueda
            ? `No hay siniestros que coincidan con ${busqueda.valor}`
            : 'No hay siniestros con estos filtros'}
          {busqueda && otros.length > 0 && ' con estos filtros'}.
        </p>
        {otros.length > 0 && (
          <p className="mt-1 text-muted-foreground">Filtros: {otros.map(describir).join(', ')}.</p>
        )}
      </div>

      {bajasQueCoinciden > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border-2 border-line-strong bg-surface-subtle px-4 py-3">
          <span className="font-semibold">
            {bajas} que {bajasQueCoinciden === 1 ? 'coincide' : 'coinciden'}.
          </span>
          <Button variant="outline" onClick={onMostrarBajas}>
            Mostrar dados de baja
          </Button>
        </div>
      )}

      <div>
        <p className="font-semibold">Podés probar:</p>
        <ul className="mt-2 grid list-disc gap-1.5 pl-6 text-muted-foreground">
          {busqueda && (
            <>
              <li>Buscar solo el apellido, o una parte del número de siniestro o de póliza.</li>
              <li>
                Las patentes se encuentran con o sin espacios y guiones (AE 123 CD o AE123CD).
              </li>
            </>
          )}
          {otros.length > 0 && <li>Quitar algún filtro para ampliar la búsqueda.</li>}
        </ul>
      </div>

      <Button variant="outline" className="justify-self-center" onClick={onQuitarTodos}>
        Quitar búsqueda y filtros
      </Button>
    </div>
  )
}
