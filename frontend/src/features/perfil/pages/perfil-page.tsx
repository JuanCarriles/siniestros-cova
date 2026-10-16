import { ShieldCheck, UserRound } from 'lucide-react'
import { usePanel } from '@/components/layout/panel-context'
import { roleLabels } from '@/components/layout/panel-navigation'
import { SectionHeading } from '@/components/layout/section-heading'

// Provisoria: muestra quién tiene la sesión. CU-07 (modificar perfil) la completa.
export function PerfilPage() {
  const { usuario } = usePanel()
  return (
    <>
      <SectionHeading section="perfil" />
      <section
        className="max-w-3xl overflow-hidden rounded-xl border bg-card shadow-card"
        aria-labelledby="profile-name"
      >
        <div className="flex flex-wrap items-center gap-5 border-b p-6 sm:p-8">
          <span className="grid size-20 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <UserRound className="size-9" aria-hidden="true" />
          </span>
          <div>
            <h2 id="profile-name" className="text-2xl font-semibold text-primary">
              {usuario.nombre}
            </h2>
            <p className="mt-2 text-muted-foreground">{roleLabels[usuario.tipo]}</p>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
            Tu espacio de trabajo
          </h3>
          <p className="mt-3 text-muted-foreground">
            {usuario.tipo === 'GESTOR'
              ? 'Seguimiento de tus siniestros asignados y consulta de plantillas para descargar.'
              : 'Acceso al dashboard, siniestros, aseguradoras, ajustadores, usuarios, plantillas e informes.'}
          </p>
          <p className="mt-5 border-t pt-5 text-sm text-muted-foreground">
            El rol determina las secciones disponibles. Los cambios de permisos se realizan a través
            de la administración del estudio.
          </p>
        </div>
      </section>
    </>
  )
}
