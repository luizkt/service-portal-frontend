import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPkceState,
  clearTokens,
  loadPkceState,
  loadTokens,
  savePkceState,
  saveTokens,
} from '../storage'

afterEach(() => {
  sessionStorage.clear()
})

describe('tokens', () => {
  it('round-trip: save/load retornam o mesmo objeto', () => {
    const t = { accessToken: 'a', idToken: 'i', refreshToken: 'r', expiresAt: 123 }
    saveTokens(t)
    expect(loadTokens()).toEqual(t)
  })

  it('loadTokens retorna null quando vazio', () => {
    expect(loadTokens()).toBeNull()
  })

  it('loadTokens retorna null quando JSON inválido', () => {
    sessionStorage.setItem('sp.auth.tokens', '{invalido')
    expect(loadTokens()).toBeNull()
  })

  it('clearTokens remove a chave', () => {
    saveTokens({ accessToken: 'x', expiresAt: 0 })
    clearTokens()
    expect(loadTokens()).toBeNull()
  })
})

describe('pkce state', () => {
  it('round-trip: save/load retornam o mesmo objeto', () => {
    const s = { codeVerifier: 'v', state: 's', returnTo: '/foo' }
    savePkceState(s)
    expect(loadPkceState()).toEqual(s)
  })

  it('loadPkceState retorna null quando vazio', () => {
    expect(loadPkceState()).toBeNull()
  })

  it('loadPkceState retorna null quando JSON inválido', () => {
    sessionStorage.setItem('sp.auth.pkce', '{invalido')
    expect(loadPkceState()).toBeNull()
  })

  it('clearPkceState remove a chave', () => {
    savePkceState({ codeVerifier: 'v', state: 's' })
    clearPkceState()
    expect(loadPkceState()).toBeNull()
  })
})
