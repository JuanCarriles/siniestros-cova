import { useState, type ReactNode, type FormEvent } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  Layers3,
  MousePointer2,
  Palette,
  PanelTop,
  Plus,
  Table2,
  Tags,
  TextCursorInput,
  Trash2,
} from 'lucide-react'
import { EstadoChip } from '@/components/estado-chip'
import { TableEmpty } from '@/components/table-empty'
import { TextField } from '@/components/text-field'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { estadosVisuales } from '@/lib/estados-visuales'

const navigation = [
  { id: 'fundamentos', label: 'Fundamentos', icon: Palette },
  { id: 'botones', label: 'Botones', icon: MousePointer2 },
  { id: 'campos', label: 'Campos y selección', icon: TextCursorInput },
  { id: 'ventanas', label: 'Ventanas modales', icon: PanelTop },
  { id: 'tablas', label: 'Tablas', icon: Table2 },
  { id: 'estados', label: 'Chips de estado', icon: Tags },
]
const swatches = [
  { name: 'Principal', token: 'primary', className: 'bg-primary' },
  { name: 'Acento de marca', token: 'brand-accent', className: 'bg-brand-accent' },
  { name: 'Fondo de página', token: 'background', className: 'bg-background' },
  { name: 'Superficie', token: 'card', className: 'bg-card' },
  { name: 'Texto', token: 'foreground', className: 'bg-foreground' },
  { name: 'Bordes', token: 'border', className: 'bg-border' },
]
const cases = [
  {
    numero: '2026-04871',
    asegurado: 'Alejandro Sosa',
    aseguradora: 'Litoral Seguros',
    estado: 'En negociación',
  },
  {
    numero: '2026-04312',
    asegurado: 'Verónica Luna',
    aseguradora: 'Seguros Cardinal',
    estado: 'En tratamiento',
  },
  {
    numero: '2026-04702',
    asegurado: 'Carlos Méndez',
    aseguradora: 'Protección Sur',
    estado: 'En pericia',
  },
  {
    numero: '2026-04511',
    asegurado: 'Laura Paz',
    aseguradora: 'Andina Seguros',
    estado: 'Cierre enviado',
  },
]

function Section({
  id,
  number,
  title,
  description,
  children,
}: {
  id: string
  number: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-20 rounded-lg border bg-card shadow-card"
    >
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <span className="pt-0.5 text-base font-semibold text-muted-foreground">{number}</span>
        <div>
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-base text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function CasePreview({ item, onOpen }: { item: (typeof cases)[number]; onOpen: () => void }) {
  return (
    <Dialog onOpenChange={(open) => open && onOpen()}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Ver siniestro ${item.numero}`}>
          <ArrowUpRight aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Siniestro <span className="dato">{item.numero}</span>
          </DialogTitle>
          <DialogDescription>Vista de muestra del sistema de diseño.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 py-2">
          <div>
            <dt className="text-base text-muted-foreground">Asegurado</dt>
            <dd className="mt-1 font-medium">{item.asegurado}</dd>
          </div>
          <div>
            <dt className="text-base text-muted-foreground">Aseguradora</dt>
            <dd className="mt-1 font-medium">{item.aseguradora}</dd>
          </div>
          <div>
            <dt className="mb-1 text-base text-muted-foreground">Estado</dt>
            <dd>
              <EstadoChip estado={item.estado} />
            </dd>
          </div>
        </dl>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar detalle</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SistemaDiseno() {
  const [feedback, setFeedback] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('todos')
  const [selectedCase, setSelectedCase] = useState<string | null>(null)
  const filteredCases = cases.filter(
    (item) =>
      (stateFilter === 'todos' || item.estado === stateFilter) &&
      `${item.numero} ${item.asegurado} ${item.aseguradora}`
        .toLocaleLowerCase('es-AR')
        .includes(query.trim().toLocaleLowerCase('es-AR')),
  )
  function createExample(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!companyName.trim()) return
    setFeedback(
      `Ejemplo confirmado: ${companyName.trim()}. Los datos de esta página no se guardan.`,
    )
    setModalOpen(false)
  }

  return (
    <div className="min-h-screen xl:grid xl:grid-cols-[280px_minmax(0,1fr)]">
      <a
        href="#contenido"
        className="sr-only fixed top-2 left-2 z-50 rounded-md bg-surface p-3 text-primary focus:not-sr-only"
      >
        Saltar al contenido
      </a>
      <aside className="bg-sidebar text-sidebar-foreground xl:sticky xl:top-0 xl:flex xl:h-screen xl:flex-col xl:overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-accent text-base font-bold text-foreground">
            EC
          </span>
          <div>
            <p className="text-base font-bold tracking-wide">ESTUDIO COVA</p>
            <p className="text-base text-on-navy-muted">Sistema de diseño</p>
          </div>
        </div>
        <div className="hidden px-5 pb-3 text-base font-medium tracking-widest text-on-navy-muted xl:block">
          BIBLIOTECA DE COMPONENTES
        </div>
        <nav
          aria-label="Secciones del sistema de diseño"
          className="grid gap-1 px-2 pb-3 sm:grid-cols-2 xl:grid-cols-1"
        >
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className="flex min-h-12 items-center gap-2.5 rounded-md px-3 py-2 text-base text-on-navy-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-on-navy"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border px-5 py-5 xl:block">
          <p className="text-base font-medium">Una base compartida</p>
          <p className="mt-1 text-base leading-6 text-on-navy-muted">
            Los mismos componentes para todas las pantallas del equipo.
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-13 flex-wrap items-center justify-between gap-2 border-b bg-surface px-4 py-2 sm:px-7">
          <div className="flex items-center gap-2 text-base">
            <Layers3 className="size-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">Biblioteca visual</span>
            <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Componentes</span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              Volver al inicio
            </Link>
          </Button>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto max-w-7xl px-4 py-7 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring sm:px-7"
        >
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-base font-semibold tracking-widest text-muted-foreground">
                FUNDACIONES · ESTUDIO COVA
              </p>
              <h1 className="text-3xl font-bold tracking-tight">Componentes de Estudio Cova</h1>
              <p className="mt-2 max-w-2xl text-reading text-muted-foreground">
                Una referencia común para construir las pantallas. Probá los componentes, sus
                estados y sus interacciones.
              </p>
            </div>
            <Badge variant="info">Catálogo de desarrollo</Badge>
          </div>
          <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-callout-line bg-callout-bg px-4 py-3 text-base text-navy">
            {['6 componentes base', 'Paleta de los mockups', 'Ejemplos sin datos reales'].map(
              (item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check className="size-5" aria-hidden="true" />
                  {item}
                </span>
              ),
            )}
          </div>

          <div className="grid gap-5">
            <Section
              id="fundamentos"
              number="01"
              title="Fundamentos visuales"
              description="Colores, tipografía y superficies compartidos en toda la interfaz."
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
                {swatches.map((swatch) => (
                  <div key={swatch.token} className="overflow-hidden rounded-md border">
                    <div className={`h-14 border-b ${swatch.className}`} aria-hidden="true" />
                    <div className="px-3 py-2.5">
                      <p className="text-base font-medium">{swatch.name}</p>
                      <code className="mt-1 block text-base break-words text-muted-foreground">
                        {swatch.token}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
                <div>
                  <p className="mb-2 text-base tracking-wider text-muted-foreground uppercase">
                    Tipografía
                  </p>
                  <p className="text-lg font-semibold">Atkinson Hyperlegible</p>
                  <p className="mt-1 text-base text-muted-foreground">
                    Hecha para baja visión: <span className="text-foreground">Il1 O0 rn m</span>.
                    Texto y controles de 18 px; nada baja de 16 px.
                  </p>
                  <p className="mt-2 text-lg text-foreground">
                    <span className="dato">2026-04871</span> ·{' '}
                    <span className="dato">AB 123 CD</span>
                  </p>
                  <p className="mt-1 text-base text-muted-foreground">
                    Clase dato: mono y sin cortes para números de siniestro, pólizas, DNI, patentes
                    y fechas.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-base tracking-wider text-muted-foreground uppercase">
                    Espaciado
                  </p>
                  <div className="flex flex-wrap items-end gap-3 text-base text-muted-foreground">
                    {[1, 2, 3, 4, 6].map((step) => (
                      <span key={step}>{step * 4} px</span>
                    ))}
                  </div>
                  <p className="mt-2 text-base text-muted-foreground">
                    Separaciones basadas en múltiplos de 4.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-base tracking-wider text-muted-foreground uppercase">
                    Superficies
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-sm border px-3 py-1 text-base">4 px</span>
                    <span className="rounded-md border px-3 py-1 text-base">6 px</span>
                    <span className="rounded-lg border px-3 py-1 text-base shadow-card">8 px</span>
                  </div>
                </div>
              </div>
            </Section>

            <Section
              id="botones"
              number="02"
              title="Botones"
              description="Una acción principal por contexto. Las acciones secundarias acompañan sin competir."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setFeedback('Acción principal de ejemplo ejecutada.')}>
                  <Plus aria-hidden="true" />
                  Nuevo siniestro
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setFeedback('Acción secundaria de ejemplo ejecutada.')}
                >
                  <Download aria-hidden="true" />
                  Descargar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setFeedback('Filtros de ejemplo seleccionados.')}
                >
                  Ver filtros
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setFeedback('Acción cancelada en el ejemplo.')}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    setFeedback(
                      'Esta es una demostración: no se eliminó ningún archivo ni registro.',
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Eliminar
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
                <span className="mr-1 text-base text-muted-foreground">Otros estados</span>
                <Button size="sm">Compacto</Button>
                <Button disabled>Deshabilitado</Button>
                <Button loading>Guardando</Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Descarga de ejemplo"
                  onClick={() => setFeedback('Botón de icono activado.')}
                >
                  <Download aria-hidden="true" />
                </Button>
              </div>
              <p role="status" aria-live="polite" className="mt-4 min-h-5 text-base text-info-ink">
                {feedback}
              </p>
            </Section>

            <Section
              id="campos"
              number="03"
              title="Campos y selección"
              description="Cada campo tiene una etiqueta visible. Las ayudas y los errores están asociados al control."
            >
              <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                <TextField
                  label="Nombre de la aseguradora"
                  placeholder="Ej.: Federación Patronal"
                  hint="Usá el nombre completo de la compañía."
                  required
                />
                <div className="grid gap-1.5">
                  <Label htmlFor="example-state">Estado del siniestro</Label>
                  <Select defaultValue="En pericia">
                    <SelectTrigger id="example-state" aria-describedby="example-state-help">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(estadosVisuales).map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id="example-state-help" className="text-base text-muted-foreground">
                    Podés seleccionar usando el teclado.
                  </p>
                </div>
                <TextField
                  label="Correo electrónico"
                  type="email"
                  defaultValue="correo@"
                  error="Ingresá un correo electrónico válido."
                />
                <TextField
                  label="Número de siniestro"
                  defaultValue="2026-04871"
                  readOnly
                  hint="Solo lectura: el valor se puede seleccionar."
                />
                <TextField label="Campo deshabilitado" placeholder="No disponible" disabled />
                <div className="grid gap-1.5">
                  <Label htmlFor="disabled-select">Selección deshabilitada</Label>
                  <Select disabled>
                    <SelectTrigger id="disabled-select">
                      <SelectValue placeholder="No disponible" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ejemplo">Ejemplo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <Section
              id="ventanas"
              number="04"
              title="Ventanas modales"
              description="Un contexto acotado para confirmar una acción o completar unos pocos datos."
            >
              <div className="flex flex-wrap items-center justify-between gap-5 rounded-md border bg-muted px-4 py-4">
                <div className="flex items-center gap-3">
                  <PanelTop className="size-8 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Nueva aseguradora</p>
                    <p className="mt-1 text-base text-muted-foreground">
                      Ejemplo visual con campos amplios y etiquetas visibles.
                    </p>
                  </div>
                </div>
                <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setCompanyName('')}>
                      <Plus aria-hidden="true" />
                      Abrir ejemplo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nueva aseguradora</DialogTitle>
                      <DialogDescription>
                        Probá el formulario. En este catálogo los datos no se guardan.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createExample} className="grid gap-5">
                      <TextField
                        label="Nombre de la aseguradora"
                        placeholder="Ej.: Federación Patronal"
                        hint="Entre 3 y 60 caracteres."
                        value={companyName}
                        onChange={(event) => setCompanyName(event.target.value)}
                        required
                        minLength={3}
                        maxLength={60}
                      />
                      <DialogFooter className="border-t pt-4">
                        <DialogClose asChild>
                          <Button variant="outline">Cancelar</Button>
                        </DialogClose>
                        <Button type="submit">Confirmar ejemplo</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <p className="mt-3 text-base leading-6 text-muted-foreground">
                Al abrir, el foco entra en la ventana. Tab recorre sus controles, Escape la cierra y
                el foco vuelve al botón de origen.
              </p>
            </Section>

            <Section
              id="tablas"
              number="05"
              title="Tablas"
              description="Filas alternas, la fila seleccionada marcada con una barra y acciones con nombres accesibles. Abrí un siniestro para ver la selección."
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="case-search">Buscar siniestro de ejemplo</Label>
                  <Input
                    id="case-search"
                    placeholder="Número, nombre o compañía"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className="grid gap-2 sm:w-64">
                  <Label htmlFor="case-filter">Filtrar por estado</Label>
                  <Select value={stateFilter} onValueChange={setStateFilter}>
                    <SelectTrigger id="case-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los estados</SelectItem>
                      {Object.keys(estadosVisuales).map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-md border">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                  <p className="text-base font-semibold" role="status">
                    {filteredCases.length} {filteredCases.length === 1 ? 'siniestro' : 'siniestros'}
                  </p>
                  <span className="text-base text-muted-foreground">Datos de muestra</span>
                </div>
                <Table
                  className="min-w-[44rem]"
                  containerLabel="Siniestros de ejemplo; desplazamiento horizontal disponible"
                >
                  <TableCaption className="sr-only">
                    Siniestros de muestra del sistema de diseño
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Siniestro</TableHead>
                      <TableHead scope="col">Asegurado</TableHead>
                      <TableHead scope="col">Aseguradora</TableHead>
                      <TableHead scope="col">Estado</TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCases.map((item) => (
                      <TableRow
                        key={item.numero}
                        data-state={selectedCase === item.numero ? 'selected' : undefined}
                      >
                        <TableCell className="font-semibold text-primary">
                          <span className="dato">{item.numero}</span>
                        </TableCell>
                        <TableCell>{item.asegurado}</TableCell>
                        <TableCell>{item.aseguradora}</TableCell>
                        <TableCell>
                          <EstadoChip estado={item.estado} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CasePreview item={item} onOpen={() => setSelectedCase(item.numero)} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!filteredCases.length && (
                      <TableEmpty
                        colSpan={5}
                        title="No encontramos coincidencias"
                        description="Probá otro nombre o cambiá el estado seleccionado."
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setQuery('')
                            setStateFilter('todos')
                          }}
                        >
                          Limpiar filtros
                        </Button>
                      </TableEmpty>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Section>

            <Section
              id="estados"
              number="06"
              title="Chips de estado"
              description="El texto identifica el estado; el color lo acompaña. La apariencia se define en un único lugar."
            >
              <div className="flex flex-wrap gap-3">
                {Object.keys(estadosVisuales).map((name) => (
                  <EstadoChip key={name} estado={name} />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
                <span className="text-base text-muted-foreground">Otros usos y estados nuevos</span>
                <Badge variant="success">Activa</Badge>
                <Badge variant="danger">Dado de baja</Badge>
                <EstadoChip estado="Estado nuevo" />
                <EstadoChip />
              </div>
            </Section>
          </div>
          <footer className="mt-6 flex flex-wrap justify-between gap-3 border-t pt-4 text-base text-muted-foreground">
            <span>Estudio Cova · Sistema de diseño base</span>
            <span>Referencia: COVA Interfaces Finales HTML.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
