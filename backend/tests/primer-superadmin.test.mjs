import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPassword } from '../src/lib/password.ts'
import { crearPrimerSuperadmin } from '../src/modules/usuarios/primer-superadmin.service.ts'

const DATOS = {
  email: 'Ana@Estudio.TEST',
  nombres: 'Ana',
  apellidos: 'Pérez',
  contrasena: 'x1Y2z3',
}

// Base falsa con lo que usa el servicio
function baseFalsa(usuarios = []) {
  return {
    usuarios,
    usuario: {
      async findFirst({ where }) {
        const [superActivo, mismoEmail] = where.OR
        const u = usuarios.find(
          (x) =>
            (x.tipoUsuario === superActivo.tipoUsuario && x.eliminado === superActivo.eliminado) ||
            x.email.toLowerCase() === mismoEmail.email.equals,
        )
        return u ? { email: u.email } : null
      },
      async create({ data }) {
        usuarios.push({ eliminado: false, ...data })
        return { email: data.email }
      },
    },
    direccion: {
      async create() {
        return { id: 1 }
      },
    },
  }
}

test('crea el superadministrador: email en minúsculas, contraseña hasheada, datos pendientes', async () => {
  const db = baseFalsa()
  assert.deepEqual(await crearPrimerSuperadmin(db, DATOS), { email: 'ana@estudio.test' })
  const [u] = db.usuarios
  assert.equal(u.tipoUsuario, 'SUPER_ADMINISTRADOR')
  assert.equal(u.documento, 'PENDIENTE')
  assert.ok(await verifyPassword(u.contrasena, DATOS.contrasena))
})

test('no hace nada si ya hay un superadministrador activo o si el email existe', async () => {
  const otro = { email: 'jefa@x.test', tipoUsuario: 'SUPER_ADMINISTRADOR', eliminado: false }
  await assert.rejects(crearPrimerSuperadmin(baseFalsa([otro]), DATOS), /jefa@x\.test/)
  const gestor = { email: 'ana@estudio.test', tipoUsuario: 'GESTOR', eliminado: false }
  await assert.rejects(crearPrimerSuperadmin(baseFalsa([gestor]), DATOS), /ana@estudio\.test/)
})
