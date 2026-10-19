import { Badge } from '@/components/ui/badge'

// Año con 4 cifras: "18/10/26" se presta a confusión
const fecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// Estado de un registro con baja lógica: "Activa" / "Dada de baja desde 15/08/2026". El punto relleno o hueco
// distingue los estados aunque no se perciba el color.
export function EstadoRegistro({
  eliminado,
  fechaBaja,
  genero = 'femenino',
}: {
  eliminado: boolean
  fechaBaja?: string | null
  /** "Activa / Dada de baja" (aseguradora) o "Activo / Dado de baja" (ajustador, usuario) */
  genero?: 'femenino' | 'masculino'
}) {
  const a = genero === 'femenino' ? 'a' : 'o'
  if (!eliminado) {
    return (
      <Badge variant="success" className="whitespace-nowrap">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-current" />
        Activ{a}
      </Badge>
    )
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge variant="neutral" className="whitespace-nowrap">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border-2 border-current"
        />
        Dad{a} de baja
      </Badge>
      {fechaBaja && (
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          desde <span className="dato">{fecha.format(new Date(fechaBaja))}</span>
        </span>
      )}
    </span>
  )
}
