// El dominio como se ve en la chapa: se reconoce de un vistazo entre varios vehículos
export function Patente({ dominio }: { dominio: string }) {
  return (
    <span className="grid w-fit min-w-32 overflow-hidden rounded-md border-2 border-ink bg-surface text-center text-ink shadow-card">
      <span
        className="bg-navy px-2 text-[0.625rem] font-bold tracking-[0.2em] text-on-navy"
        aria-hidden="true"
      >
        ARGENTINA
      </span>
      <span className="px-3 py-1 dato text-xl font-bold tracking-wider">
        <span className="sr-only">Dominio </span>
        {dominio}
      </span>
    </span>
  )
}
