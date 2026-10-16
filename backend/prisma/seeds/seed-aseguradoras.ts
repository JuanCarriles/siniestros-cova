import { disconnectPrisma, getPrisma } from '../../src/lib/prisma.ts'

// Datos de prueba del módulo; no se crean usuarios, siniestros ni otros maestros.
const aseguradoras = [
  {
    nombre: 'Litoral Seguros',
    ajustadores: [
      { nombres: 'Ricardo', apellidos: 'Bengoechea', telefono: '341 555-0201' },
      { nombres: 'Carla', apellidos: 'Méndez', telefono: '341 555-0202' },
      { nombres: 'Hernán', apellidos: 'Sosa', telefono: '341 555-0203', baja: true },
    ],
  },
  {
    nombre: 'Sancor Seguros',
    ajustadores: [
      { nombres: 'Diego', apellidos: 'Ruiz', telefono: '3493 555-0204' },
      { nombres: 'Andrea', apellidos: 'Paz', telefono: '3493 555-0205' },
    ],
  },
  {
    nombre: 'La Segunda',
    ajustadores: [{ nombres: 'Silvina', apellidos: 'Ortega', telefono: '341 555-0206' }],
  },
  {
    nombre: 'Federación Patronal',
    ajustadores: [{ nombres: 'Paula', apellidos: 'Ríos', telefono: '221 555-0207' }],
  },
  { nombre: 'Seguros del Plata', baja: true, ajustadores: [] },
] as const

const prisma = getPrisma()
try {
  const creadas = await prisma.$transaction(async (tx) => {
    const nombres: string[] = []
    for (const dato of aseguradoras) {
      // El seed es repetible y conserva cualquier aseguradora que ya exista.
      if (
        await tx.aseguradora.findFirst({ where: { nombre: dato.nombre }, select: { id: true } })
      ) {
        continue
      }
      const baja = 'baja' in dato && dato.baja
      const aseguradora = await tx.aseguradora.create({
        data: {
          nombre: dato.nombre,
          eliminado: baja,
          fechaBaja: baja ? new Date() : null,
        },
      })
      for (const ajustador of dato.ajustadores) {
        const bajaAjustador = 'baja' in ajustador && ajustador.baja
        const email = `${ajustador.nombres}.${ajustador.apellidos}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
        await tx.ajustador.create({
          data: {
            nombres: ajustador.nombres,
            apellidos: ajustador.apellidos,
            telefono: ajustador.telefono,
            email: `${email}@ajustadores.test`,
            idAseguradora: aseguradora.id,
            eliminado: bajaAjustador,
            fechaBaja: bajaAjustador ? new Date() : null,
          },
        })
      }
      nombres.push(dato.nombre)
    }
    return nombres
  })
  console.log(
    `Aseguradoras de prueba creadas: ${creadas.length}${creadas.length ? ` (${creadas.join(', ')})` : ''}`,
  )
} finally {
  await disconnectPrisma()
}
