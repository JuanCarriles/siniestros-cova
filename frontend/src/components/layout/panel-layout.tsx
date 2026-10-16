import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ArrowRight, ChevronRight, Menu, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { sectionIcons } from './panel-icons'
import { navigationFor, roleLabels, sections } from './panel-navigation'
import type { PanelContext } from './panel-context'

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-accent font-bold text-foreground"
        aria-hidden="true"
      >
        EC
      </span>
      <div>
        <p className="text-lg font-bold tracking-wide">ESTUDIO COVA</p>
        <p className="text-sm text-on-navy-muted">Gestión de siniestros</p>
      </div>
    </div>
  )
}

function Sidebar({
  usuario,
  basePath,
  onNavigate,
  mobile = false,
}: PanelContext & { onNavigate?: () => void; mobile?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('px-6 pb-7', mobile ? 'pt-16' : 'pt-8')}>
        <Brand />
      </div>
      <div className="mx-6 border-t border-sidebar-border pt-6 pb-3 text-sm font-medium tracking-wide text-on-navy-muted">
        ESPACIO DE TRABAJO
      </div>
      <nav aria-label="Navegación principal" className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <ul className="grid gap-2">
          {navigationFor(usuario.tipo).map((section) => {
            const Icon = sectionIcons[section]
            return (
              <li key={section}>
                <NavLink
                  to={`${basePath}/${section}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex min-h-14 items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-3 text-base font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-offset-0 focus-visible:outline-on-navy',
                      isActive
                        ? 'border-brand-accent bg-sidebar-accent font-bold text-on-navy'
                        : 'text-on-navy-muted',
                    )
                  }
                >
                  <Icon className="size-6 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{sections[section].label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <NavLink
          to={`${basePath}/perfil`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex min-h-20 items-center gap-3 rounded-lg p-3 transition-colors hover:bg-sidebar-accent focus-visible:outline-offset-0 focus-visible:outline-on-navy',
              isActive && 'bg-sidebar-accent',
            )
          }
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full border border-on-navy-muted bg-sidebar-accent">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Mi perfil</span>
            <span className="block text-sm break-words text-on-navy-muted">
              {roleLabels[usuario.tipo]}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
        </NavLink>
      </div>
    </div>
  )
}

// Se remonta al navegar: también cierra el menú ante Atrás/Adelante del navegador.
function MobileNavigation(props: PanelContext) {
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

/** Recibe el usuario desde una sesión confiable. El selector de roles existe sólo en la vista previa DEV. */
export function PanelLayout({ usuario, basePath }: PanelContext) {
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const section = pathname.slice(basePath.length + 1).split('/')[0]
  const current = Object.hasOwn(sections, section)
    ? sections[section as keyof typeof sections]
    : null
  useEffect(() => {
    document.title = `${current?.label ?? 'Sección no disponible'} · Estudio Cova`
    if (previousPath.current !== pathname) main.current?.focus()
    previousPath.current = pathname
  }, [pathname, current])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <a
        href="#panel-contenido"
        className="sr-only fixed top-3 left-3 z-50 rounded-md bg-surface p-4 font-semibold text-primary focus:not-sr-only"
      >
        Saltar al contenido
      </a>
      <aside aria-label="Panel lateral" className="sticky top-0 hidden h-dvh lg:block">
        <Sidebar usuario={usuario} basePath={basePath} />
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
          className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-7 focus-visible:outline-offset-[-3px] sm:px-8 sm:py-10 xl:px-12"
        >
          <Outlet context={{ usuario, basePath } satisfies PanelContext} />
        </main>
        <footer className="mx-4 flex flex-wrap items-center justify-between gap-3 border-t py-5 text-sm text-muted-foreground sm:mx-8 xl:mx-12">
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
