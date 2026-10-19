import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function RecuperacionHeader({ paso, volver }: { paso: 1 | 2 | 3; volver?: () => void }) {
  return (
    <>
      {volver ? (
        <Button variant="link" onClick={volver} className="mb-4 px-0">
          <ChevronLeft aria-hidden="true" /> Cambiar email
        </Button>
      ) : (
        <Button asChild variant="link" className="mb-4 px-0">
          <Link to="/login">
            <ChevronLeft aria-hidden="true" /> Volver a ingresar
          </Link>
        </Button>
      )}
      <div className="mb-5 flex items-center gap-4" aria-label={`Paso ${paso} de 3`}>
        <div className="grid w-28 grid-cols-3 gap-2" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn('h-1 rounded-full', n <= paso ? 'bg-primary' : 'bg-line')}
            />
          ))}
        </div>
        <span className="text-sm font-semibold text-muted-foreground">Paso {paso} de 3</span>
      </div>
    </>
  )
}
