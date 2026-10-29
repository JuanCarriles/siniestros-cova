// Email y teléfono como enlaces (escribir, llamar). Sin valor devuelven null: Dato muestra "Sin dato".

export const email = (valor: string | null) =>
  valor ? (
    <a href={`mailto:${valor}`} className="text-primary underline underline-offset-4">
      {valor}
    </a>
  ) : null

export const telefono = (valor: string | null) =>
  valor ? (
    <a
      href={`tel:${valor.replace(/[^\d+]/g, '')}`}
      className="dato text-primary underline underline-offset-4"
    >
      {valor}
    </a>
  ) : null
