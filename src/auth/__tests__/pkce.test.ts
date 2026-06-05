import { describe, expect, it } from 'vitest'
import { base64UrlEncode, generateCodeChallenge, generateCodeVerifier, generateRandomString } from '../pkce'

describe('base64UrlEncode', () => {
  it('codifica bytes sem padding e com alfabeto URL-safe', () => {
    expect(base64UrlEncode(new Uint8Array([0]))).toBe('AA')
    expect(base64UrlEncode(new Uint8Array([255, 255, 255]))).toBe('____')
    expect(base64UrlEncode(new Uint8Array([62, 63]))).toBe('Pj8')
  })

  it('vazio retorna string vazia', () => {
    expect(base64UrlEncode(new Uint8Array(0))).toBe('')
  })
})

describe('generateCodeVerifier', () => {
  it('produz string com tamanho default 64 e somente caracteres unreserved', () => {
    const v = generateCodeVerifier()
    expect(v).toHaveLength(64)
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('respeita o tamanho explícito', () => {
    expect(generateCodeVerifier(43)).toHaveLength(43)
    expect(generateCodeVerifier(128)).toHaveLength(128)
  })

  it('rejeita tamanhos fora de [43, 128]', () => {
    expect(() => generateCodeVerifier(42)).toThrow()
    expect(() => generateCodeVerifier(129)).toThrow()
  })

  it('chamadas sucessivas geram valores diferentes', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier())
  })
})

describe('generateCodeChallenge', () => {
  it('S256 do verifier "abc" produz challenge conhecido', async () => {
    // Vetor: SHA-256("abc") = ba7816bf... → base64url
    const challenge = await generateCodeChallenge('abc')
    expect(challenge).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })
})

describe('generateRandomString', () => {
  it('retorna string base64url não vazia', () => {
    const s = generateRandomString()
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s.length).toBeGreaterThan(0)
  })

  it('respeita byteLength customizado', () => {
    const a = generateRandomString(8)
    const b = generateRandomString(8)
    expect(a).not.toBe(b)
  })
})
