import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OpcionSelect } from '@/components/select-field'

const TODAS = 'todas'

// Lista desplegable para la BarraAbm (p. ej. "Todas las aseguradoras"). Misma altura y sombra que el buscador.
export function FiltroAbm({
  etiqueta,
  textoTodas,
  valor,
  onCambio,
  opciones,
}: {
  /** Qué filtra, para el lector de pantalla: "Filtrar por aseguradora" */
  etiqueta: string
  /** Primera opción, sin filtro: "Todas las aseguradoras" */
  textoTodas: string
  /** null = sin filtro */
  valor: string | null
  onCambio: (valor: string | null) => void
  opciones: OpcionSelect[]
}) {
  return (
    <Select value={valor ?? TODAS} onValueChange={(v) => onCambio(v === TODAS ? null : v)}>
      <SelectTrigger
        aria-label={etiqueta}
        className="min-h-13 flex-1 bg-surface font-medium shadow-card sm:w-72 sm:flex-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS}>{textoTodas}</SelectItem>
        {opciones.map((opcion) => (
          <SelectItem key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
