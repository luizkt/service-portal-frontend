import { describe, expect, it } from 'vitest'
import { decodeJwtPayload } from '../jwt'

function makeJwt(payload: object): string {
  const json = JSON.stringify(payload)
  const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${base64}.assinatura`
}

describe('decodeJwtPayload', () => {
  it('extrai todos os claims de um JWT válido com groups', () => {
    const token = makeJwt({
      sub: 'uid-123',
      name: 'IT Admin',
      preferred_username: 'it',
      email: 'it@sp.local',
      groups: ['ADMIN'],
      exp: 9999999999,
    })
    const claims = decodeJwtPayload(token)
    expect(claims.sub).toBe('uid-123')
    expect(claims.name).toBe('IT Admin')
    expect(claims.preferred_username).toBe('it')
    expect(claims.email).toBe('it@sp.local')
    expect(claims.groups).toEqual(['ADMIN'])
    expect(claims.exp).toBe(9999999999)
  })

  it('extrai múltiplos grupos', () => {
    const token = makeJwt({ sub: 'u1', groups: ['ADMIN', 'WORKFLOWS'] })
    expect(decodeJwtPayload(token).groups).toEqual(['ADMIN', 'WORKFLOWS'])
  })

  it('retorna {} quando token tem menos de 3 partes', () => {
    expect(decodeJwtPayload('apenas.duas')).toEqual({})
    expect(decodeJwtPayload('souma')).toEqual({})
  })

  it('retorna {} quando token tem mais de 3 partes', () => {
    expect(decodeJwtPayload('a.b.c.d')).toEqual({})
  })

  it('retorna {} para string vazia', () => {
    expect(decodeJwtPayload('')).toEqual({})
  })

  it('retorna {} quando payload não é JSON válido', () => {
    expect(decodeJwtPayload('header.!!!naoehbase64!!!.sig')).toEqual({})
  })

  it('retorna objeto sem groups quando claim não está presente', () => {
    const token = makeJwt({ sub: 'u2', name: 'Test User' })
    const claims = decodeJwtPayload(token)
    expect(claims.name).toBe('Test User')
    expect(claims.groups).toBeUndefined()
  })

  it('suporta payload com padding irregular (% 4 != 0)', () => {
    // Payload de tamanho que exige padding explícito
    const token = makeJwt({ sub: 'x' })
    expect(decodeJwtPayload(token).sub).toBe('x')
  })
})
