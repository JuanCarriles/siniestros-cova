import argon2 from 'argon2'

// RNF-06: contraseñas solo como hash Argon2id (nunca en texto plano ni reversibles).
// Los parámetros por defecto de la librería (m=64 MiB, t=3, p=4) siguen la recomendación de OWASP.
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain)
}
