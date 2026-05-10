import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeCodeForTokens,
  fetchAuthConfig,
  isTokenValid,
  logout,
  startLogin,
  type AuthConfig,
} from '../oauth'
import { loadPkceState, loadTokens, savePkceState } from '../storage'

const config: AuthConfig = {
  issuerUri: 'https://idp/issuer/',
  clientId: 'spa',
  scopes: ['openid', 'profile'],
}

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('fetchAuthConfig', () => {
  it('retorna JSON do BFF', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(config), { status: 200 })
    )
    const cfg = await fetchAuthConfig()
    expect(cfg).toEqual(config)
    expect(fetchSpy).toHaveBeenCalledWith('/bff/auth/config')
  })

  it('lança erro quando status não é OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    await expect(fetchAuthConfig()).rejects.toThrow(/500/)
  })
})

describe('startLogin', () => {
  it('persiste PKCE state e redireciona para /authorize com query string completa', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy, origin: 'http://app' },
    })

    await startLogin(config, 'http://app/auth/callback', '/return-here')

    const stored = loadPkceState()
    expect(stored).not.toBeNull()
    expect(stored?.codeVerifier).toBeTruthy()
    expect(stored?.state).toBeTruthy()
    expect(stored?.returnTo).toBe('/return-here')

    expect(assignSpy).toHaveBeenCalledOnce()
    const url: string = assignSpy.mock.calls[0][0]
    expect(url.startsWith('https://idp/issuer/authorize/?')).toBe(true)
    const qs = new URLSearchParams(url.split('?')[1])
    expect(qs.get('response_type')).toBe('code')
    expect(qs.get('client_id')).toBe('spa')
    expect(qs.get('scope')).toBe('openid profile')
    expect(qs.get('code_challenge_method')).toBe('S256')
    expect(qs.get('code_challenge')).toBeTruthy()
    expect(qs.get('state')).toBe(stored?.state)
  })

  it('issuer sem trailing slash funciona igual', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    })
    await startLogin({ ...config, issuerUri: 'https://idp/issuer' }, 'http://app/auth/callback')
    const url: string = assignSpy.mock.calls[0][0]
    expect(url.startsWith('https://idp/issuer/authorize/?')).toBe(true)
  })
})

describe('exchangeCodeForTokens', () => {
  it('faz POST no token endpoint, persiste tokens e limpa PKCE state', async () => {
    savePkceState({ codeVerifier: 'verifier-abc', state: 'st-1' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'AT', id_token: 'IT', refresh_token: 'RT', expires_in: 60 }),
        { status: 200 }
      )
    )

    const tokens = await exchangeCodeForTokens(
      config,
      'http://app/auth/callback',
      'authcode',
      'st-1'
    )

    expect(tokens.accessToken).toBe('AT')
    expect(tokens.idToken).toBe('IT')
    expect(tokens.refreshToken).toBe('RT')
    expect(tokens.expiresAt).toBeGreaterThan(Date.now())
    expect(loadTokens()).toEqual(tokens)
    expect(loadPkceState()).toBeNull()

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://idp/issuer/token/')
    expect((init as RequestInit).method).toBe('POST')
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('authcode')
    expect(body.get('code_verifier')).toBe('verifier-abc')
  })

  it('lança erro quando PKCE state ausente', async () => {
    await expect(
      exchangeCodeForTokens(config, 'http://app/cb', 'c', 's')
    ).rejects.toThrow(/PKCE/)
  })

  it('lança erro e limpa PKCE quando state diverge (CSRF)', async () => {
    savePkceState({ codeVerifier: 'v', state: 'esperado' })
    await expect(
      exchangeCodeForTokens(config, 'http://app/cb', 'c', 'invasor')
    ).rejects.toThrow(/CSRF/)
    expect(loadPkceState()).toBeNull()
  })

  it('lança erro e limpa PKCE quando token endpoint falha', async () => {
    savePkceState({ codeVerifier: 'v', state: 's' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 401 }))
    await expect(
      exchangeCodeForTokens(config, 'http://app/cb', 'c', 's')
    ).rejects.toThrow(/401/)
    expect(loadPkceState()).toBeNull()
  })
})

describe('logout', () => {
  it('redireciona para /end-session com post_logout_redirect_uri e id_token_hint', () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy, origin: 'http://app' },
    })
    logout(config, 'http://app/', 'id-token-1')
    const url: string = assignSpy.mock.calls[0][0]
    expect(url.startsWith('https://idp/issuer/end-session/?')).toBe(true)
    const qs = new URLSearchParams(url.split('?')[1])
    expect(qs.get('post_logout_redirect_uri')).toBe('http://app/')
    expect(qs.get('id_token_hint')).toBe('id-token-1')
  })

  it('omite id_token_hint quando não passado', () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    })
    logout(config, 'http://app/')
    const url: string = assignSpy.mock.calls[0][0]
    const qs = new URLSearchParams(url.split('?')[1])
    expect(qs.get('id_token_hint')).toBeNull()
  })
})

describe('isTokenValid', () => {
  it('false quando null', () => {
    expect(isTokenValid(null)).toBe(false)
  })
  it('false quando expira em menos do que skew', () => {
    expect(isTokenValid({ accessToken: 'a', expiresAt: Date.now() + 1000 }, 30_000)).toBe(false)
  })
  it('true quando expira além do skew', () => {
    expect(isTokenValid({ accessToken: 'a', expiresAt: Date.now() + 60_000 }, 30_000)).toBe(true)
  })
})
