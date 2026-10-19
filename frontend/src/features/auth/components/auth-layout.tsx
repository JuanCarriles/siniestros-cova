import type { ReactNode } from 'react'

// Marco de las pantallas de acceso (login y los tres pasos de recuperar contraseña): marca del
// estudio, una tarjeta con el formulario y el pie. En celular la tarjeta ocupa todo el ancho con 16 px de margen.
export function AuthLayout({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
      <title>{`${titulo} · Estudio Cova`}</title>
      <header className="mb-8 flex flex-col items-center text-center">
        <span
          className="grid size-16 place-items-center rounded-xl bg-brand-accent text-2xl font-bold text-foreground shadow-card"
          aria-hidden="true"
        >
          EC
        </span>
        <p className="mt-4 text-2xl font-bold tracking-[0.18em] text-navy">ESTUDIO COVA</p>
        <p className="mt-1 text-muted-foreground">Liquidación de siniestros · Sistema de gestión</p>
      </header>

      <main className="w-full max-w-[30rem] rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
        {children}
      </main>

      <footer className="mt-8 max-w-[30rem] text-center text-muted-foreground">
        <p>¿No tenés usuario? Las cuentas las crea un administrador del estudio.</p>
        <p className="mt-1 font-semibold text-ink-2">Estudio Cova S.R.T.</p>
      </footer>
    </div>
  )
}
