import assert from 'node:assert/strict'
import test from 'node:test'
import { leerCookie, origenPermitido } from '../src/modules/chat/tiempo-real.ts'

test('E7-01: cookie de sesión del handshake', () => {
  assert.equal(leerCookie('cova_sesion=abc', 'cova_sesion'), 'abc')
  assert.equal(leerCookie('otra=1; cova_sesion=a%2Bb;x=2', 'cova_sesion'), 'a+b')
  assert.equal(leerCookie('xcova_sesion=abc', 'cova_sesion'), undefined)
  assert.equal(leerCookie('cova_sesion=', 'cova_sesion'), undefined)
  assert.equal(leerCookie('cova_sesion=%E0%A4%A', 'cova_sesion'), undefined)
  assert.equal(leerCookie(undefined, 'cova_sesion'), undefined)
})

test('E7-01: solo se acepta el handshake del mismo sitio', () => {
  // Sin Origin: no es un navegador (igual necesita una sesión válida)
  assert.equal(origenPermitido(undefined, 'cova.example.com'), true)
  // Nginx manda Host sin el puerto; el navegador, el Origin con el puerto
  assert.equal(origenPermitido('https://cova.example.com', 'cova.example.com'), true)
  assert.equal(origenPermitido('http://localhost:8080', 'localhost'), true)
  assert.equal(origenPermitido('http://localhost:5173', 'localhost:5173'), true)
  assert.equal(origenPermitido('https://otro.example.com', 'cova.example.com'), false)
  assert.equal(origenPermitido('https://cova.example.com.otro.net', 'cova.example.com'), false)
  assert.equal(origenPermitido('null', 'cova.example.com'), false)
  assert.equal(origenPermitido('https://cova.example.com', undefined), false)
})
