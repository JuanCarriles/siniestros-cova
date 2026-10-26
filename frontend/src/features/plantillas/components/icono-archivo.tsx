import { FileImage, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

// Marcas de formato en SVG local: visibles con zoom, sin imágenes remotas ni colores literales.
export function IconoArchivo({ extension, className }: { extension: string; className?: string }) {
  const formato = extension.toLowerCase()
  const esImagen = ['jpg', 'jpeg', 'png'].includes(formato)
  const esExcel = ['xlsx', 'xls'].includes(formato)
  const esWord = ['docx', 'doc'].includes(formato)
  const etiqueta =
    formato === 'pdf'
      ? 'Documento PDF'
      : esExcel
        ? 'Planilla de Excel'
        : esWord
          ? 'Documento de Word'
          : esImagen
            ? `Imagen ${formato.toUpperCase()}`
            : 'Documento'
  const color =
    formato === 'pdf'
      ? 'bg-danger-bg text-danger-ink'
      : esExcel
        ? 'bg-ok-bg text-ok-ink'
        : 'bg-info-bg text-info-ink'
  return (
    <span
      role="img"
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center rounded-lg',
        color,
        className,
      )}
    >
      {formato === 'pdf' ? (
        <svg viewBox="0 0 40 48" fill="none" className="h-11 w-10" aria-hidden="true">
          <path
            d="M8 2h17l9 9v31a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M25 2v9h9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path
            d="M12 36c5-6 13-19 11-22-2-3-4 1-2 7 2 6 6 10 10 11 4 1 3-3-1-3-6-1-17 3-20 6-3 3-1 5 2 1Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : esExcel || esWord ? (
        <svg viewBox="0 0 48 48" fill="none" className="size-11" aria-hidden="true">
          <rect x="18" y="5" width="26" height="38" rx="3" stroke="currentColor" strokeWidth="2" />
          {esExcel ? (
            <path d="M25 14h12M25 22h12M25 30h12M31 14v22" stroke="currentColor" strokeWidth="2" />
          ) : (
            <path d="M25 14h12M25 21h12M25 28h12M25 35h9" stroke="currentColor" strokeWidth="2" />
          )}
          <rect x="3" y="11" width="26" height="26" rx="3" fill="currentColor" />
          {esExcel ? (
            <path
              d="m11 18 10 12m0-12L11 30"
              className="stroke-primary-foreground"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="m8 18 4 12 4-9 4 9 4-12"
              className="stroke-primary-foreground"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
        </svg>
      ) : esImagen ? (
        <FileImage className="size-10" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <FileText className="size-10" aria-hidden="true" />
      )}
    </span>
  )
}
