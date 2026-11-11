import { MessagesSquare } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { useSalaSiniestro } from '@/lib/tiempo-real'
import { EstadoConexionChat } from '../components/estado-conexion-chat'
import { PestanaFicha, PestanaVacia } from '../components/pestana-ficha'
import { useFicha } from '../hooks/use-ficha'

// Pestaña "Chat" (CU-10 1.h). E7-01: al entrar se conecta en tiempo real a la sala del siniestro (el servidor
// controla el acceso antes de unir) y muestra el estado de la conexión. Los mensajes llegan con E7-02.
export function PestanaChat() {
  const { usuario } = usePanel()
  const ficha = useFicha()
  const { conexion, sala } = useSalaSiniestro(ficha.id)
  return (
    <PestanaFicha titulo={usuario.tipo === 'GESTOR' ? 'Chat' : 'Chat con el gestor'}>
      <div className="grid gap-4">
        <EstadoConexionChat conexion={conexion} sala={sala} />
        <PestanaVacia icono={MessagesSquare}>
          Todavía no se pueden enviar mensajes desde acá. Mientras tanto, las novedades del caso
          quedan en la pestaña Novedades.
        </PestanaVacia>
      </div>
    </PestanaFicha>
  )
}
