import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cambiarSonido, sonarMensaje, useSonidoActivado } from '@/lib/sonido-mensajes'

// Activa o silencia el sonido de los mensajes nuevos del chat (en toda la ficha). El texto dice el estado actual, no
// solo el ícono; el título dice qué pasa al tocarlo. Al activarlo suena una vez, para saber cómo es y a qué volumen.
export function BotonSonidoChat() {
  const activado = useSonidoActivado()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      title={activado ? 'Tocá para silenciar' : 'Tocá para activar'}
      onClick={() => {
        cambiarSonido(!activado)
        if (!activado) sonarMensaje({ forzar: true })
      }}
    >
      {activado ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      {activado ? 'Sonido de mensajes: activado' : 'Sonido de mensajes: desactivado'}
    </Button>
  )
}
