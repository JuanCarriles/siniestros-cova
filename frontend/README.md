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

## Visibilidad (el cliente tiene baja visión)

Estas reglas son requisitos, no preferencias: cualquier pantalla nueva tiene que cumplirlas.

- **Tipografía Atkinson Hyperlegible** (Braille Institute), diseñada para baja visión: diferencia formas que en
  otras fuentes se confunden (I l 1, O 0, rn m). Se sirve localmente con Fontsource.
- **Ningún texto por debajo de 16 px.** En la escala de `tokens.css`, `text-xs` y `text-sm` valen 16 px a propósito;
  el texto general, los controles y las tablas son de 18 px (`text-base`). Todo en `rem`: respeta el tamaño de letra
  que la persona elija en el navegador. Un test falla si alguien agrega un tamaño menor.
- **Identificadores con la clase `dato`**: número de siniestro, póliza, DNI, patente, CUIT y fechas. Usa la versión
  mono de la fuente, cifras del mismo ancho y no se corta en el guion. Siempre en su propio elemento:
  `<span className="dato">2026-04871</span>`.
- **Contraste:** texto principal de 7:1 o más; texto secundario, estados y deshabilitados de 4,5:1 o más; bordes de
  controles, foco e íconos de 3:1 o más. Lo comprueba `test:design`.
- **Nada se comunica solo con color:** los estados llevan texto, los errores un ícono y borde grueso, lo obligatorio
  dice "(obligatorio)" y la fila seleccionada de una tabla tiene una barra a la izquierda además del fondo.
- **Deshabilitado con colores sólidos, nunca con opacidad** (la opacidad dejaba el texto en 2,8:1). Un botón
  cargando conserva su color y el foco.
- **Controles de 48 px de alto como mínimo** (también los tamaños `sm` e `icon-sm`); las etiquetas de botones pueden
  ocupar dos líneas.
- **Teclado:** foco visible de 3 px, ventanas con el foco contenido, Escape para cerrar y retorno al disparador.
  Respetar `prefers-reduced-motion`.

Estas comprobaciones no reemplazan probar con el cliente: antes de dar por terminada una pantalla, mostrársela y
pedirle que la use con su configuración habitual (zoom, tamaño de letra, lentes).

## Pantallas responsivas

El cliente va a usar zoom, así que **lo responsivo también es accesibilidad**: un monitor de 1280 px con zoom al
200 % muestra la página como si tuviera 640 px de ancho, y al 400 % como 320 px. Por eso se trabaja así desde ahora,
no al final:

**Ya resuelto en los componentes:** botones y campos se adaptan al ancho; las ventanas modales ocupan casi todo el
ancho en el celular, con los botones apilados y a lo ancho; las tablas se desplazan dentro de su propio espacio (y
solo entonces son enfocables para desplazarlas con el teclado); las palabras largas cortan línea en vez de desbordar.

**En cada pantalla nueva:**

1. Diseñarla de lo angosto a lo ancho (mobile first) con los cortes de Tailwind: `sm` 640 px, `md` 768 px,
   `lg` 1024 px, `xl` 1280 px.
2. Probarla en 320 px, 375 px, 768 px y 1280 px (en el navegador: herramientas de desarrollo → modo dispositivo), y
   con zoom al 200 % en una pantalla de escritorio. **La página nunca debe desplazarse en horizontal**; solo las
   tablas, dentro de su caja.
3. Grillas de datos (como la ficha del siniestro): 1 columna en el celular, 2 en tablet y escritorio. A 18 px no
   entran las 4 columnas del HTML de referencia.
4. Listados largos (siniestros, aseguradoras): en el celular conviene mostrar cada fila como una tarjeta con los 3 o
   4 datos principales, en lugar de una tabla que hay que desplazar.
5. El menú lateral de la aplicación (cuando se construya la estructura general) pasa a un botón de menú por debajo
   de `lg`.

## Componentes

Importar desde `@/components/ui/*`. La configuración de shadcn está en `components.json` y `cn` en `src/lib/utils.ts`.

| Componente                    | Uso                                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                      | Variantes default, secondary, outline, ghost, destructive y link. `type="button"` por defecto; indicar `type="submit"` para enviar. `loading` muestra el spinner, ignora los clics y conserva el color y el foco; `disabled` lo deshabilita. |
| `Input`, `Label`, `TextField` | Campo básico o composición con etiqueta, ayuda y error. `TextField` recibe `label`, `hint`, `error` y propiedades nativas del input.                                                                                                         |
| `Select`                      | Componer Trigger, Value, Content e Item; conectar Label mediante `htmlFor` e `id` del Trigger.                                                                                                                                               |
| `Dialog`                      | Modal con Title, Description, Content y Footer. Content acepta `size="default"` (600 px) o `size="wide"` (768 px), limitado por el viewport.                                                                                                 |
| `Table`                       | Componer cabecera, cuerpo y filas; dar nombres a acciones y columnas. Fila seleccionada: `<TableRow data-state="selected">`. `containerLabel` nombra la región cuando se desplaza. `TableEmpty` muestra ausencia de resultados.              |
| `Badge`, `EstadoChip`         | Etiquetas con variantes semánticas. `EstadoChip` centraliza el color del estado y conserva el texto recibido.                                                                                                                                |

```tsx
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/text-field'
import { EstadoChip } from '@/components/estado-chip'

<TextField label="Nombre" name="nombre" required hint="Nombre completo" />
<Button type="submit" loading={guardando}>Guardar</Button>
<EstadoChip estado="En tratamiento" />
<span className="dato">2026-04871</span>
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
