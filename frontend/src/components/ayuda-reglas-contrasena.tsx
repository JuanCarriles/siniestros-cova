import { useEffect, useRef, useState } from 'react'
import { Info, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { reglasContrasena } from '@cova/shared/schemas/auth'
import { Button } from '@/components/ui/button'
import { ReglasContrasena } from '@/components/reglas-contrasena'

// Ayuda compacta: hover para mouse, Enter/Espacio para teclado y clic para pantallas táctiles.
export function AyudaReglasContrasena({ id, valor }: { id: string; valor: string }) {
  const [abierta, setAbierta] = useState(false)
  const disparador = useRef<HTMLButtonElement>(null)
  const devolverFoco = useRef(false)
  const cierre = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function cancelarCierre() {
    clearTimeout(cierre.current)
  }
  function abrir() {
    cancelarCierre()
    setAbierta(true)
  }
  function programarCierre() {
    cancelarCierre()
    cierre.current = setTimeout(() => setAbierta(false), 180)
  }
  useEffect(() => () => clearTimeout(cierre.current), [])

  return (
    <div>
      <span id={id} className="sr-only">
        {reglasContrasena.map((regla) => regla.texto).join('. ')}.
      </span>
      <Popover.Root
        open={abierta}
        onOpenChange={(valor) => {
          cancelarCierre()
          setAbierta(valor)
        }}
      >
        <Popover.Trigger asChild>
          <Button
            ref={disparador}
            type="button"
            variant="link"
            className="justify-start px-0 text-left"
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                cancelarCierre()
                cierre.current = setTimeout(abrir, 150)
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse' && !disparador.current?.matches(':focus-visible'))
                programarCierre()
            }}
            onFocus={cancelarCierre}
            onBlur={programarCierre}
          >
            <Info aria-hidden="true" />
            Requisitos de contraseña
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="z-[60] w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-surface p-4 text-base text-foreground shadow-pop"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (devolverFoco.current) {
                devolverFoco.current = false
                disparador.current?.focus()
              }
            }}
            onEscapeKeyDown={() => {
              devolverFoco.current = !!document.activeElement?.closest(
                '[data-requisitos-contrasena]',
              )
            }}
            data-requisitos-contrasena
            onPointerEnter={cancelarCierre}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') programarCierre()
            }}
            onFocusCapture={cancelarCierre}
            onBlurCapture={programarCierre}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <Popover.Title className="font-semibold">Requisitos de contraseña</Popover.Title>
              <Popover.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar requisitos"
                  onClick={() => {
                    devolverFoco.current = true
                  }}
                >
                  <X aria-hidden="true" />
                </Button>
              </Popover.Close>
            </div>
            <Popover.Description className="sr-only">
              Se actualizan mientras escribís.
            </Popover.Description>
            <ReglasContrasena id={`${id}-lista`} valor={valor} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
