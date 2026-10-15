# Sistema de diseño de Estudio Cova

Base compartida de React, Tailwind CSS 4 y componentes shadcn/ui adaptados a la paleta de Cova. Referencia visual: `../docs/referencia-ui/cova-interfaces-finales.html`. La referencia conserva el prototipo original; la aplicación amplía tamaños y contraste para facilitar la lectura.

## Probar el catálogo

Desde la raíz del repositorio:

```powershell
npm install
npm run dev:front
```

Abrir `/sistema-diseno` en la dirección que muestra Vite (habitualmente http://localhost:5173/sistema-diseno). También hay un enlace desde el inicio durante desarrollo. El catálogo usa datos ficticios en memoria: no realiza altas, bajas ni llamadas al backend. Su ruta e importación están limitadas por `import.meta.env.DEV`; no se incluyen en el JavaScript de producción.

## Tokens y reglas visuales

`src/styles/tokens.css` es la fuente única de colores, radios, sombras y tipografía. Tailwind 4 define los tokens con `@theme` en CSS; este proyecto no necesita `tailwind.config.js`. Esto implementa el criterio de tokens del mockup con el mecanismo de la versión instalada.

| Uso                      | Clases recomendadas                                      |
| ------------------------ | -------------------------------------------------------- |
| Página y texto           | `bg-background text-foreground`                          |
| Tarjetas                 | `bg-card text-card-foreground border-border shadow-card` |
| Acción principal         | `bg-primary text-primary-foreground`                     |
| Texto secundario         | `text-muted-foreground`                                  |
| Naranja de marca         | `bg-brand-accent text-foreground`                        |
| Foco y borde del control | `outline-ring border-input`                              |
| Estados                  | `EstadoChip` o variantes de `Badge`                      |

`accent` es la superficie interactiva de shadcn; el naranja se llama `brand-accent`. `muted` es una superficie, y `muted-foreground` es texto. Los tokens de secciones del HTML (documentos, chat, daños, lesionados y propietario) están disponibles para las futuras pantallas.

No usar hex, RGB/HSL ni colores de la paleta genérica de Tailwind dentro de componentes o pantallas. Crear un token semántico cuando haga falta. `check:tokens` revisa `src` e `index.html`, excluye únicamente el archivo central de tokens y se ejecuta antes de compilar y en el lint del frontend. Es una comprobación estática de patrones, no un parser completo de CSS; la revisión de código sigue siendo necesaria. Los SVG de marca y el HTML de referencia no son pantallas de la aplicación.

## Visibilidad y uso del teclado

- Texto general de 18 px (`1.125rem`), controles y tablas de 16 px; Inter se sirve localmente.
- Botones y campos con una altura de al menos 48 px en la escala normal; las etiquetas de botones pueden envolver. `sm` reduce el espacio horizontal, conserva el alto.
- Texto principal con contraste superior a 7:1 en los fondos probados. Texto secundario y estados al menos 4,5:1; bordes de controles y foco al menos 3:1 en las combinaciones probadas.
- Etiquetas visibles, errores escritos y asociados con `aria-describedby`, estado inválido anunciado. El placeholder acompaña a la etiqueta.
- Foco visible, ventanas con Tab contenido dentro del modal, Escape para cerrar y retorno al disparador. Respetar `prefers-reduced-motion`.
- Unidades relativas, diseños que se reorganizan y tablas con desplazamiento dentro de su propia región. No bloquear el zoom del navegador ni reducir el tamaño raíz de fuente.
- El estado siempre tiene texto: su significado no depende del color.

Estas comprobaciones no constituyen una auditoría completa de accesibilidad ni garantizan la legibilidad para todas las personas. Cada pantalla futura debe probarse con teclado, zoom y usuarios reales.

## Componentes

Importar desde `@/components/ui/*`. La configuración de shadcn está en `components.json` y `cn` en `src/lib/utils.ts`.

| Componente                    | Uso                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                      | Variantes default, secondary, outline, ghost, destructive y link; `loading` y `disabled` en botones nativos. `type="button"` por defecto; indicar `type="submit"` para enviar. |
| `Input`, `Label`, `TextField` | Campo básico o composición con etiqueta, ayuda y error. `TextField` recibe `label`, `hint`, `error` y propiedades nativas del input.                                           |
| `Select`                      | Componer Trigger, Value, Content e Item; conectar Label mediante `htmlFor` e `id` del Trigger.                                                                                 |
| `Dialog`                      | Modal con Title, Description, Content y Footer. Content acepta `size="default"` (600 px) o `size="wide"` (768 px), limitado por el viewport.                                   |
| `Table`                       | Componer cabecera, cuerpo y filas; dar nombres a acciones y columnas. `containerLabel` nombra la región desplazable y enfocable. `TableEmpty` muestra ausencia de resultados.  |
| `Badge`, `EstadoChip`         | Etiquetas con variantes semánticas. `EstadoChip` centraliza el color del estado y conserva el texto recibido.                                                                  |

```tsx
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/text-field'
import { EstadoChip } from '@/components/estado-chip'

<TextField label="Nombre" name="nombre" required hint="Nombre completo" />
<Button type="submit" loading={guardando}>Guardar</Button>
<EstadoChip estado="En tratamiento" />
```

`Button asChild` sirve para enlaces activos. No admite `disabled` ni `loading`, porque un enlace no implementa la deshabilitación nativa de un botón. Para botones que solo contienen un icono, proporcionar `aria-label`.

`src/lib/estados-visuales.ts` contempla los nombres del seed actual de Prisma. Un estado desconocido usa un estilo neutral; no se cambian IDs, reglas de negocio ni catálogos de la base. El HTML tiene nombres adicionales o distintos y no define por sí solo el catálogo real.

## Verificación

```powershell
npm run build -w frontend
npm run lint -w frontend
npm run test:design -w frontend
```

Las pruebas cubren detección de colores directos y ratios de contraste de las combinaciones principales. La galería permite revisar manualmente selección, botones deshabilitados, errores, búsquedas, tabla vacía y foco de modales. Al incorporar otro componente con shadcn, revisar sus colores y tamaños antes de aceptarlo para conservar estas adaptaciones.
