import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeCodeForTokens,
  fetchAuthConfig,
  isTokenValid,
  loginWithPassword,
  logout,
  refreshTokens,
  startLogin,
  type AuthConfig,
} from '../oauth'
import { loadPkceState, loadTokens, savePkceState, saveTokens } from '../storage'

const config: AuthConfig = {
  issuerUri: 'https://idp/issuer/',
  clientId: 'spa',
  scopes: ['openid', 'profile'],
}

const configWithEndpoints: AuthConfig = {
  issuerUri: 'https://idp/issuer/',
  clientId: 'spa',
  scopes: ['openid', 'profile'],
  endpoints: {
    authorize: 'https://idp/authorize/',
    token: 'https://idp/token/',
    endSession: 'https://idp/issuer/end-session/',
  },
}

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('fetchAuthConfig', () => {
  it('busca BFF config e popula endpoints via OIDC discovery', async () => {
    const bffConfig = { issuerUri: 'https://idp/issuer/', clientId: 'spa', scopes: ['openid'] }
    const discovery = {
      authorization_endpoint: 'https://idp/authorize/',
      token_endpoint: 'https://idp/token/',
      end_session_endpoint: 'https://idp/issuer/end-session/',
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(bffConfig), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(discovery), { status: 200 }))

    const cfg = await fetchAuthConfig()

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/bff/auth/config')
    expect(fetchSpy).toHaveBeenNthCalledWith(2, 'https://idp/issuer/.well-known/openid-configuration')
    expect(cfg.issuerUri).toBe('https://idp/issuer/')
    expect(cfg.endpoints?.authorize).toBe('https://idp/authorize/')
    expect(cfg.endpoints?.token).toBe('https://idp/token/')
    expect(cfg.endpoints?.endSession).toBe('https://idp/issuer/end-session/')
  })

  it('retorna config sem endpoints quando discovery falha (404)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(config), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
    const cfg = await fetchAuthConfig()
    expect(cfg.endpoints).toBeUndefined()
    expect(cfg.issuerUri).toBe(config.issuerUri)
  })

  it('retorna config sem endpoints quando discovery lança erro de rede', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(config), { status: 200 }))
      .mockRejectedValueOnce(new Error('Network error'))
    const cfg = await fetchAuthConfig()
    expect(cfg.endpoints).toBeUndefined()
  })

  it('lança erro quando BFF retorna status não OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 500 }))
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

  it('usa endpoints.authorize quando disponível (OIDC discovery)', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    })
    await startLogin(configWithEndpoints, 'http://app/auth/callback')
    const url: string = assignSpy.mock.calls[0][0]
    expect(url.startsWith('https://idp/authorize/?')).toBe(true)
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

describe('loginWithPassword', () => {
  it('faz POST no token endpoint com grant_type=password, persiste tokens e retorna', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'AT', id_token: 'IT', refresh_token: 'RT', expires_in: 3600 }),
        { status: 200 }
      )
    )

    const tokens = await loginWithPassword(configWithEndpoints, 'it', 'itadmin')

    expect(tokens.accessToken).toBe('AT')
    expect(tokens.idToken).toBe('IT')
    expect(tokens.refreshToken).toBe('RT')
    expect(tokens.expiresAt).toBeGreaterThan(Date.now())
    expect(loadTokens()).toEqual(tokens)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://idp/token/')
    expect((init as RequestInit).method).toBe('POST')
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('grant_type')).toBe('password')
    expect(body.get('username')).toBe('it')
    expect(body.get('password')).toBe('itadmin')
    expect(body.get('client_id')).toBe('spa')
    expect(body.get('scope')).toBe('openid profile')
  })

  it('usa fallback de URL quando config não tem endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'AT', expires_in: 3600 }),
        { status: 200 }
      )
    )
    await loginWithPassword(config, 'workop', 'workoppass')
    expect(fetchSpy.mock.calls[0][0]).toBe('https://idp/issuer/token/')
  })

  it('lança erro quando o endpoint retorna status não OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 401 })
    )
    await expect(loginWithPassword(config, 'user', 'wrongpass')).rejects.toThrow('Usuário ou senha inválidos')
  })

  it('lança erro para qualquer status não-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad', { status: 400 })
    )
    await expect(loginWithPassword(config, 'u', 'p')).rejects.toThrow('Usuário ou senha inválidos')
  })
})

describe('refreshTokens', () => {
  it('retorna null quando não há refreshToken armazenado', async () => {
    saveTokens({ accessToken: 'AT', expiresAt: Date.now() + 60_000 })
    const result = await refreshTokens(config)
    expect(result).toBeNull()
  })

  it('retorna null quando sessionStorage está vazio', async () => {
    const result = await refreshTokens(config)
    expect(result).toBeNull()
  })

  it('faz POST no token endpoint, persiste novos tokens e retorna', async () => {
    saveTokens({ accessToken: 'OLD', refreshToken: 'RT-1', idToken: 'IT-old', expiresAt: Date.now() + 60_000 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'NEW', id_token: 'IT-new', refresh_token: 'RT-2', expires_in: 3600 }),
        { status: 200 }
      )
    )

    const result = await refreshTokens(config)

    expect(result).not.toBeNull()
    expect(result?.accessToken).toBe('NEW')
    expect(result?.idToken).toBe('IT-new')
    expect(result?.refreshToken).toBe('RT-2')
    expect(result?.expiresAt).toBeGreaterThan(Date.now())
    expect(loadTokens()).toEqual(result)

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://idp/issuer/token/')
    expect((init as RequestInit).method).toBe('POST')
    const body = new URLSearchParams((init as RequestInit).body as string)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('RT-1')
    expect(body.get('client_id')).toBe('spa')
  })

  it('mantém idToken e refreshToken antigos quando o endpoint não os retorna', async () => {
    saveTokens({ accessToken: 'OLD', refreshToken: 'RT-original', idToken: 'IT-original', expiresAt: Date.now() + 60_000 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'NEW', expires_in: 3600 }),
        { status: 200 }
      )
    )

    const result = await refreshTokens(config)
    expect(result?.idToken).toBe('IT-original')
    expect(result?.refreshToken).toBe('RT-original')
  })

  it('retorna null sem lançar quando o endpoint retorna erro', async () => {
    saveTokens({ accessToken: 'OLD', refreshToken: 'RT-1', expiresAt: Date.now() + 60_000 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid_grant', { status: 400 }))

    const result = await refreshTokens(config)
    expect(result).toBeNull()
  })

  it('retorna null sem lançar quando fetch falha com erro de rede', async () => {
    saveTokens({ accessToken: 'OLD', refreshToken: 'RT-1', expiresAt: Date.now() + 60_000 })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const result = await refreshTokens(config)
    expect(result).toBeNull()
  })
})
