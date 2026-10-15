import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'

export function TableEmpty({
  colSpan,
  title = 'Todavía no hay registros',
  description,
  children,
}: {
  colSpan: number
  title?: string
  description?: string
  children?: ReactNode
}) {
  return (
    <TableRow className="hover:bg-surface">
      <TableCell colSpan={colSpan} className="py-12 text-center whitespace-normal">
        <FolderOpen className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" />
        <p className="font-semibold">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
      </TableCell>
    </TableRow>
  )
}
