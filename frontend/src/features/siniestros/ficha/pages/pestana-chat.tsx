import { MessagesSquare } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'

// Pestaña "Chat" (CU-10 1.h). La conversación en tiempo real llega con su propia historia.
export function PestanaChat() {
  const { usuario } = usePanel()
  return (
    <PestanaFicha titulo={usuario.tipo === 'GESTOR' ? 'Chat' : 'Chat con el gestor'}>
      <PestanaVacia icono={MessagesSquare}>
        El chat del siniestro todavía no está disponible. Mientras tanto, las novedades del caso
        quedan en la pestaña Novedades.
      </PestanaVacia>
    </PestanaFicha>
  )
}
