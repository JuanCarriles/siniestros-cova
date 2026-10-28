import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Form, Link, NavLink, Outlet, useLocation, useNavigation } from 'react-router'
import { ArrowRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { sectionIcons } from './panel-icons'
import { canOpenSection, navigationFor, roleLabels, sections } from './panel-navigation'
import type { MenuLateral, PanelBase, PanelContext } from './panel-context'

function Brand({ contraido = false }: { contraido?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', contraido && 'justify-center')}>
      <span
        className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-accent font-bold text-foreground baja:size-10"
        aria-hidden="true"
      >
        EC
      </span>
      <div className={cn(contraido && 'sr-only')}>
        <p className="text-lg font-bold tracking-wide">ESTUDIO COVA</p>
        <p className="text-sm text-on-navy-muted muy-baja:hidden">Gestión de siniestros</p>
      </div>
    </div>
  )
}

// En el menú angosto solo se ven los íconos: el nombre aparece al pasar el mouse o al enfocar, y el lector de
// pantalla lo lee siempre (el texto queda oculto a la vista, no quitado)
function ConEtiqueta({
  contraido,
  etiqueta,
  children,
}: {
  contraido: boolean
  etiqueta: string
  children: ReactElement
}) {
  if (!contraido) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{etiqueta}</TooltipContent>
    </Tooltip>
  )
}

function Sidebar({
  usuario,
  basePath,
  onNavigate,
  mobile = false,
  menuLateral,
}: PanelBase & { onNavigate?: () => void; mobile?: boolean; menuLateral?: MenuLateral }) {
  const contraido = menuLateral?.contraido ?? false
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'pb-7 baja:pb-4 muy-baja:pb-2',
          contraido ? 'px-3' : 'px-6',
          mobile ? 'pt-16' : 'pt-8 baja:pt-5 muy-baja:pt-3',
        )}
      >
        <Brand contraido={contraido} />
      </div>
      <div
        className={cn(
          'border-t border-sidebar-border pt-6 pb-3 text-sm font-medium tracking-wide text-on-navy-muted baja:pt-4 baja:pb-2 muy-baja:pt-2 muy-baja:pb-1',
          contraido ? 'mx-3' : 'mx-6',
        )}
      >
        <span className={cn(contraido && 'sr-only')}>ESPACIO DE TRABAJO</span>
      </div>
      {/* El desplazamiento queda solo como último recurso (pantallas muy bajas o con mucho zoom) */}
      <nav
        aria-label="Navegación principal"
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 baja:pb-3 muy-baja:pb-2"
      >
        <ul className="grid gap-2 baja:gap-1 muy-baja:gap-0.5">
          {navigationFor(usuario.tipo).map((section) => {
            const Icon = sectionIcons[section]
            return (
              <li key={section}>
                <ConEtiqueta contraido={contraido} etiqueta={sections[section].label}>
                  <NavLink
                    to={`${basePath}/${section}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex min-h-14 items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-3 text-base font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-offset-0 focus-visible:outline-on-navy baja:min-h-11 baja:py-2 muy-baja:min-h-10 muy-baja:py-1.5',
                        contraido && 'justify-center',
                        isActive
                          ? 'border-brand-accent bg-sidebar-accent font-bold text-on-navy'
                          : 'text-on-navy-muted',
                      )
                    }
                  >
                    <Icon className="size-6 shrink-0" aria-hidden="true" />
                    <span className={cn('min-w-0 flex-1', contraido && 'sr-only')}>
                      {sections[section].label}
                    </span>
                  </NavLink>
                </ConEtiqueta>
              </li>
            )
          })}
        </ul>
        {menuLateral && (
          <ConEtiqueta contraido={contraido} etiqueta="Agrandar el menú">
            <button
              type="button"
              onClick={menuLateral.alternar}
              aria-expanded={!contraido}
              className={cn(
                'mt-3 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-navy-muted transition-colors hover:bg-sidebar-accent hover:text-on-navy focus-visible:outline-offset-0 focus-visible:outline-on-navy',
                contraido && 'justify-center',
              )}
            >
              {contraido ? (
                <PanelLeftOpen className="size-6 shrink-0" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-6 shrink-0" aria-hidden="true" />
              )}
              <span className={cn(contraido && 'sr-only')}>
                {contraido ? 'Agrandar el menú' : 'Achicar el menú'}
              </span>
            </button>
          </ConEtiqueta>
        )}
      </nav>
      {/* Perfil y salida en una sola fila: el rol ya se ve arriba a la derecha, en el encabezado */}
      <div
        className={cn(
          'flex shrink-0 gap-1 border-t border-sidebar-border p-2',
          contraido ? 'flex-col items-center' : 'items-stretch',
        )}
      >
        <ConEtiqueta contraido={contraido} etiqueta="Mi perfil">
          <NavLink
            to={`${basePath}/perfil`}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-accent focus-visible:outline-offset-0 focus-visible:outline-on-navy',
                contraido && 'w-full flex-none justify-center',
                isActive && 'bg-sidebar-accent',
              )
            }
          >
            <UserRound className="size-6 shrink-0" aria-hidden="true" />
            <span className={cn('min-w-0 flex-1', contraido && 'sr-only')}>
              <span className="block leading-snug font-semibold break-words">{usuario.nombre}</span>
              <span className="block text-sm text-on-navy-muted">
                Mi perfil<span className="sr-only">, {roleLabels[usuario.tipo]}</span>
              </span>
            </span>
          </NavLink>
        </ConEtiqueta>
        <CerrarSesion />
      </div>
    </div>
  )
}

// Pide confirmación antes de salir: un toque de más (frecuente con la pantalla ampliada) no debe cerrar la sesión.
// Al confirmar, la action /salir (features/auth/sesion.ts) borra la sesión en el servidor y vuelve al login.
function CerrarSesion() {
  const navigation = useNavigation()
  const saliendo = navigation.state !== 'idle' && navigation.formAction === '/salir'
  const cancelar = useRef<HTMLButtonElement>(null)
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Ícono con el texto debajo: angosto para compartir fila con el perfil, sin depender solo del ícono */}
        <button
          type="button"
          className="flex w-18 max-w-full shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-sm leading-tight font-medium text-on-navy-muted transition-colors hover:bg-sidebar-accent hover:text-on-navy focus-visible:outline-offset-0 focus-visible:outline-on-navy"
        >
          <LogOut className="size-6 shrink-0" aria-hidden="true" />
          Salir
        </button>
      </DialogTrigger>
      <DialogContent
        // El foco arranca en "Cancelar", la opción que no cambia nada
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelar.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>¿Salir del sistema?</DialogTitle>
          <DialogDescription>
            Se cierra tu sesión. Para volver a entrar vas a necesitar tu email y tu contraseña.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button ref={cancelar} variant="outline" disabled={saliendo}>
              Cancelar
            </Button>
          </DialogClose>
          <Form method="post" action="/salir">
            <Button type="submit" loading={saliendo} className="w-full">
              <LogOut aria-hidden="true" />
              {saliendo ? 'Saliendo…' : 'Salir'}
            </Button>
          </Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Se remonta al navegar: también cierra el menú ante Atrás/Adelante del navegador.
function MobileNavigation(props: PanelBase) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 64rem)')
    const closeOnDesktop = () => {
      if (wide.matches) setOpen(false)
    }
    wide.addEventListener('change', closeOnDesktop)
    return () => wide.removeEventListener('change', closeOnDesktop)
  }, [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          ref={trigger}
          variant="outline"
          size="icon"
          className="shrink-0 lg:hidden"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="size-6" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 left-0 h-dvh max-h-dvh w-[min(22rem,100%)] max-w-full translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-sidebar p-0 text-sidebar-foreground data-[state=closed]:animate-none data-[state=open]:animate-none sm:max-w-full sm:p-0 [&>[data-slot=dialog-close]]:text-on-navy [&>[data-slot=dialog-close]]:hover:bg-sidebar-accent [&>[data-slot=dialog-close]]:focus-visible:outline-on-navy">
        <DialogHeader className="sr-only">
          <DialogTitle>Menú de navegación</DialogTitle>
          <DialogDescription>Elegí una sección de tu espacio de trabajo.</DialogDescription>
        </DialogHeader>
        <Sidebar {...props} mobile onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

const CLAVE_MENU = 'cova.menuLateralContraido'

// Preferencia de este navegador; sin almacenamiento disponible, el menú arranca abierto
function leerMenuContraido() {
  try {
    return localStorage.getItem(CLAVE_MENU) === '1'
  } catch {
    return false
  }
}

/** Recibe el usuario de la sesión (loader del panel en app/router.tsx). */
export function PanelLayout({ usuario, basePath }: PanelBase) {
  const [contraido, setContraido] = useState(leerMenuContraido)
  const menuLateral: MenuLateral = {
    contraido,
    alternar: () => {
      setContraido(!contraido)
      try {
        localStorage.setItem(CLAVE_MENU, contraido ? '0' : '1')
      } catch {
        // Sin almacenamiento, la elección dura hasta recargar
      }
    },
  }
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const section = pathname.slice(basePath.length + 1).split('/')[0]
  const dashboardAdministrativo = section === 'dashboard' && usuario.tipo !== 'GESTOR'
  // Una sección que el rol no puede abrir tampoco se nombra en el encabezado ni en el título de la pestaña
  const current = canOpenSection(usuario.tipo, section) ? sections[section] : null
  useEffect(() => {
    document.title = `${current?.label ?? 'Sección no disponible'} · Estudio Cova`
    if (previousPath.current !== pathname) main.current?.focus()
    previousPath.current = pathname
  }, [pathname, current])

  return (
    <div
      className={cn(
        'min-h-dvh lg:grid',
        contraido ? 'lg:grid-cols-[5rem_minmax(0,1fr)]' : 'lg:grid-cols-[18rem_minmax(0,1fr)]',
      )}
    >
      <a
        href="#panel-contenido"
        className="sr-only fixed top-3 left-3 z-50 rounded-md bg-surface p-4 font-semibold text-primary focus:not-sr-only"
      >
        Saltar al contenido
      </a>
      <aside aria-label="Panel lateral" className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar usuario={usuario} basePath={basePath} menuLateral={menuLateral} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex min-h-24 flex-wrap items-center justify-between gap-3 border-b bg-surface px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNavigation key={pathname} usuario={usuario} basePath={basePath} />
            <div>
              <p className="text-sm text-muted-foreground">
                Estudio Cova{' '}
                <span className="mx-1" aria-hidden="true">
                  /
                </span>{' '}
                {usuario.tipo === 'GESTOR' ? 'Mi espacio' : 'Administración'}
              </p>
              <p className="font-semibold text-primary">
                {current?.label ?? 'Sección no disponible'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="max-w-full border-input text-sm">
            {roleLabels[usuario.tipo]}
          </Badge>
        </header>
        <main
          ref={main}
          id="panel-contenido"
          tabIndex={-1}
          className={cn(
            'mx-auto w-full max-w-[90rem] flex-1 px-4 py-7 focus-visible:outline-offset-[-3px] sm:px-8 sm:py-10 lg:px-6',
            dashboardAdministrativo && 'py-4 sm:py-5',
          )}
        >
          <Outlet context={{ usuario, basePath, menuLateral } satisfies PanelContext} />
        </main>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-3 border-t py-5 text-sm text-muted-foreground sm:mx-8 lg:mx-6">
          <span>
            Estudio Cova <span aria-hidden="true">·</span> Gestión de siniestros
          </span>
          <Link
            to={`${basePath}/perfil`}
            className="inline-flex min-h-12 items-center gap-2 font-medium text-primary underline underline-offset-4"
          >
            Mi perfil <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  )
}
