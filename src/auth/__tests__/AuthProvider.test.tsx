import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthProvider'
import { loadPkceState, loadTokens, savePkceState, saveTokens } from '../storage'
import * as oauth from '../oauth'
import * as bff from '../../api/bff'

// startLogin e logout fazem window.location.assign (não suportado no jsdom): só eles são trocados.
vi.mock('../oauth', async importOriginal => {
  const actual = await importOriginal<typeof import('../oauth')>()
  return { ...actual, startLogin: vi.fn(), logout: vi.fn() }
})

const cfg = { issuerUri: 'https://idp/issuer/', clientId: 'spa', scopes: ['openid'] }

function b64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function jwt(claims: object): string {
  return `${b64url({ alg: 'none' })}.${b64url(claims)}.sig`
}

let auth: ReturnType<typeof useAuth>
function Consumer() {
  auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="error">{auth.error ?? ''}</span>
      <span data-testid="name">{auth.displayName ?? ''}</span>
      <span data-testid="groups">{auth.groups.join(',')}</span>
      <span data-testid="token">{auth.accessToken ?? ''}</span>
    </div>
  )
}

function mountProvider() {
  return render(<AuthProvider><Consumer /></AuthProvider>)
}
const status = () => screen.getByTestId('status').textContent

/** fetch falso: /bff/auth/config, discovery (falha) e token endpoint configuráveis. */
function mockFetch(opts: { token?: Response | (() => Response); config?: Response; login?: Response } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input)
    if (url === '/bff/auth/config') return opts.config ?? new Response(JSON.stringify(cfg), { status: 200 })
    if (url.endsWith('.well-known/openid-configuration')) return new Response('{}', { status: 404 })
    if (url === '/bff/auth/login' && opts.login) return opts.login
    if (url.endsWith('/token/')) {
      const t = opts.token
      return typeof t === 'function' ? t() : (t ?? new Response('', { status: 400 }))
    }
    throw new Error('fetch inesperado: ' + url)
  })
}
const tokenResponse = (extra: object = {}) =>
  new Response(JSON.stringify({ access_token: 'AT', id_token: 'IT', refresh_token: 'RT', expires_in: 3600, ...extra }), { status: 200 })

function validTokens(access = 'AT') {
  return { accessToken: access, idToken: 'IT', refreshToken: 'RT', expiresAt: Date.now() + 3600_000 }
}

beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('AuthProvider: estado inicial', () => {
  it('começa em loading e vira unauthenticated sem tokens', async () => {
    mockFetch()
    mountProvider()
    expect(status()).toBe('loading')
    await waitFor(() => expect(status()).toBe('unauthenticated'))
    expect(screen.getByTestId('token').textContent).toBe('')
    expect(screen.getByTestId('name').textContent).toBe('')
  })

  it('token válido em sessionStorage vira authenticated', async () => {
    saveTokens(validTokens())
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(screen.getByTestId('token').textContent).toBe('AT')
  })

  it('token expirado na inicialização vira unauthenticated', async () => {
    saveTokens({ accessToken: 'old', expiresAt: Date.now() - 1000 })
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
  })

  it('token dentro da folga de 30s conta como expirado', async () => {
    saveTokens({ accessToken: 'soon', expiresAt: Date.now() + 10_000 })
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
  })

  it('falha ao carregar config vira error', async () => {
    mockFetch({ config: new Response('', { status: 500 }) })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toContain('500')
  })

  it('injeta a config no bff.ts ao carregar', async () => {
    const spy = vi.spyOn(bff, 'setAuthConfig')
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'spa' }))
  })

  it('useAuth fora do provider lança erro', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Consumer />)).toThrow(/AuthProvider/)
    err.mockRestore()
  })
})

describe('AuthProvider: desmontagem e erros não-Error', () => {
  it('desmontar antes da config chegar não grava estado nem config no bff', async () => {
    const setCfg = vi.spyOn(bff, 'setAuthConfig')
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await gate
      return new Response(JSON.stringify(cfg), { status: 200 })
    })
    const { unmount } = mountProvider()
    unmount()
    release()
    await new Promise(r => setTimeout(r, 10))
    expect(setCfg).not.toHaveBeenCalled()
  })

  it('desmontar durante a troca de code descarta o resultado', async () => {
    savePkceState({ codeVerifier: 'ver', state: 'S1', returnTo: '/flows' })
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=S1')
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url === '/bff/auth/config') return new Response(JSON.stringify(cfg), { status: 200 })
      if (url.endsWith('.well-known/openid-configuration')) return new Response('{}', { status: 404 })
      await gate
      return tokenResponse()
    })
    const { unmount } = mountProvider()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3))
    unmount()
    release()
    await new Promise(r => setTimeout(r, 10))
    expect(window.location.pathname).toBe('/auth/callback') // URL não foi reescrita
  })

  it('rejeição que não é Error usa mensagem padrão', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue('boom')
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toBe('Falha ao carregar config')
  })
})

describe('AuthProvider: claims do JWT', () => {
  it('displayName e groups vêm do access token, com acentos em UTF-8', async () => {
    saveTokens(validTokens(jwt({ name: 'José Antônio Çelik', preferred_username: 'jose', groups: ['admins', 'devs'] })))
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(screen.getByTestId('name').textContent).toBe('José Antônio Çelik')
    expect(screen.getByTestId('groups').textContent).toBe('admins,devs')
  })

  it('sem name usa preferred_username; token opaco não gera nome nem grupos', async () => {
    saveTokens(validTokens(jwt({ preferred_username: 'maria' })))
    mockFetch()
    const { unmount } = mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(screen.getByTestId('name').textContent).toBe('maria')
    expect(screen.getByTestId('groups').textContent).toBe('')
    unmount()

    saveTokens(validTokens('opaco'))
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(screen.getByTestId('name').textContent).toBe('')
  })
})

describe('AuthProvider: callback OIDC', () => {
  function arrive(search: string) {
    window.history.replaceState({}, '', '/auth/callback' + search)
  }

  it('state válido: troca code, guarda tokens, autentica e aplica returnTo seguro', async () => {
    savePkceState({ codeVerifier: 'ver', state: 'S1', returnTo: '/flows?x=1' })
    arrive('?code=abc&state=S1')
    const f = mockFetch({ token: tokenResponse() })
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(loadTokens()?.accessToken).toBe('AT')
    expect(loadPkceState()).toBeNull()
    expect(window.location.pathname + window.location.search).toBe('/flows?x=1')
    const call = f.mock.calls.find(c => String(c[0]).endsWith('/token/'))!
    expect(String((call[1] as RequestInit).body)).toContain('code=abc')
    expect(String((call[1] as RequestInit).body)).toContain('code_verifier=ver')
  })

  it.each(['https://evil.example/x', '//evil.example', '/\\evil', 'javascript:alert(1)'])(
    'returnTo inseguro (%s) vira "/"',
    async bad => {
      savePkceState({ codeVerifier: 'ver', state: 'S1', returnTo: bad })
      arrive('?code=abc&state=S1')
      mockFetch({ token: tokenResponse() })
      mountProvider()
      await waitFor(() => expect(status()).toBe('authenticated'))
      expect(window.location.pathname).toBe('/')
      expect(window.location.hostname).toBe('localhost')
    }
  )

  it('sem returnTo salvo volta para "/"', async () => {
    savePkceState({ codeVerifier: 'ver', state: 'S1' })
    arrive('?code=abc&state=S1')
    mockFetch({ token: tokenResponse() })
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(window.location.pathname).toBe('/')
  })

  it('state diferente do salvo: erro, sem tokens, PKCE descartado, sem chamar token endpoint', async () => {
    savePkceState({ codeVerifier: 'ver', state: 'S1', returnTo: '/x' })
    arrive('?code=abc&state=OUTRO')
    const f = mockFetch({ token: tokenResponse() })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toMatch(/State inválido/)
    expect(loadTokens()).toBeNull()
    expect(loadPkceState()).toBeNull()
    expect(f.mock.calls.some(c => String(c[0]).endsWith('/token/'))).toBe(false)
  })

  it('state ausente na URL: erro sem tocar no token endpoint', async () => {
    savePkceState({ codeVerifier: 'ver', state: 'S1' })
    arrive('?code=abc')
    const f = mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toBe('Callback sem code/state')
    expect(loadTokens()).toBeNull()
    expect(f.mock.calls.some(c => String(c[0]).endsWith('/token/'))).toBe(false)
  })

  it('code ausente na URL: erro', async () => {
    arrive('?state=S1')
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toBe('Callback sem code/state')
  })

  it('estado PKCE ausente: erro pedindo novo login', async () => {
    arrive('?code=abc&state=S1')
    mockFetch({ token: tokenResponse() })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toMatch(/PKCE ausente/)
    expect(loadTokens()).toBeNull()
  })

  it('token endpoint recusando: erro e nenhum token guardado', async () => {
    savePkceState({ codeVerifier: 'ver', state: 'S1' })
    arrive('?code=abc&state=S1')
    mockFetch({ token: new Response('', { status: 400 }) })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    expect(screen.getByTestId('error').textContent).toContain('400')
    expect(loadTokens()).toBeNull()
  })
})

describe('AuthProvider: login, 401 e logout', () => {
  it('login() delega a startLogin com redirect_uri do callback e a rota atual', async () => {
    mockFetch()
    window.history.replaceState({}, '', '/flows?q=1')
    mountProvider()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
    act(() => auth.login())
    expect(oauth.startLogin).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'spa' }),
      window.location.origin + '/auth/callback',
      '/flows?q=1',
    )
  })

  it('login() antes de a config carregar é ignorado', async () => {
    mockFetch()
    mountProvider()
    act(() => auth.login())
    expect(oauth.startLogin).not.toHaveBeenCalled()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
  })

  it('loginWithCredentials com sucesso guarda tokens e autentica', async () => {
    const f = mockFetch({ login: tokenResponse({ access_token: jwt({ name: 'Ana' }) }) })
    mountProvider()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
    await act(async () => { await auth.loginWithCredentials('ana', 'pw') })
    expect(status()).toBe('authenticated')
    expect(screen.getByTestId('name').textContent).toBe('Ana')
    expect(loadTokens()?.refreshToken).toBe('RT')
    const call = f.mock.calls.find(c => c[0] === '/bff/auth/login')!
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ username: 'ana', password: 'pw' })
  })

  it('loginWithCredentials com falha propaga a mensagem do BFF e não autentica', async () => {
    mockFetch({ login: new Response(JSON.stringify({ error: 'Senha errada' }), { status: 401 }) })
    mountProvider()
    await waitFor(() => expect(status()).toBe('unauthenticated'))
    let caught: unknown
    await act(async () => { await auth.loginWithCredentials('ana', 'x').catch(e => { caught = e }) })
    expect((caught as Error).message).toBe('Senha errada')
    expect(status()).toBe('unauthenticated')
    expect(loadTokens()).toBeNull()
  })

  it('loginWithCredentials sem config carregada rejeita', async () => {
    mockFetch({ config: new Response('', { status: 500 }) })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    await expect(auth.loginWithCredentials('a', 'b')).rejects.toThrow(/indisponível/)
  })

  it('loginWithCredentials limpa erro anterior', async () => {
    arriveCallbackError()
    mockFetch({ login: tokenResponse() })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    await act(async () => { await auth.loginWithCredentials('a', 'b') })
    expect(status()).toBe('authenticated')
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('registra onUnauthorized e o 401 do BFF derruba a sessão', async () => {
    const setter = vi.spyOn(bff, 'setOnUnauthorized')
    saveTokens(validTokens())
    mockFetch()
    const { unmount } = mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    const handler = setter.mock.calls.at(-1)![0]!
    expect(typeof handler).toBe('function')
    act(() => handler())
    expect(status()).toBe('unauthenticated')
    expect(loadTokens()).toBeNull()
    expect(screen.getByTestId('token').textContent).toBe('')
    unmount()
    expect(setter).toHaveBeenLastCalledWith(null)
  })

  it('401 real em bff.ts sem refresh possível derruba a sessão (integração com bff.ts)', async () => {
    saveTokens({ accessToken: 'AT', expiresAt: Date.now() + 3600_000 }) // sem refreshToken
    const f = mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    f.mockImplementation(async () => new Response('no', { status: 401, statusText: 'Unauthorized' }))
    await act(async () => { await bff.bff.menu().catch(() => {}) })
    expect(status()).toBe('unauthenticated')
    expect(loadTokens()).toBeNull()
  })

  it('logout limpa storage, desautentica e chama oauth.logout com id_token_hint', async () => {
    saveTokens(validTokens())
    mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    act(() => auth.logout())
    expect(status()).toBe('unauthenticated')
    expect(loadTokens()).toBeNull()
    expect(oauth.logout).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'spa' }),
      window.location.origin,
      'IT',
    )
  })

  it('logout sem config carregada só limpa a sessão local', async () => {
    saveTokens(validTokens())
    mockFetch({ config: new Response('', { status: 500 }) })
    mountProvider()
    await waitFor(() => expect(status()).toBe('error'))
    act(() => auth.logout())
    expect(status()).toBe('unauthenticated')
    expect(loadTokens()).toBeNull()
    expect(oauth.logout).not.toHaveBeenCalled()
  })
})

describe('AuthProvider: refresh em 401', () => {
  it('o refresh é delegado a refreshTokens (via bff.ts) e a sessão se mantém quando funciona', async () => {
    saveTokens(validTokens('OLD'))
    const f = mockFetch()
    mountProvider()
    await waitFor(() => expect(status()).toBe('authenticated'))
    const refresh = vi.spyOn(oauth, 'refreshTokens')
    let first = true
    f.mockImplementation(async input => {
      const url = String(input)
      if (url.endsWith('/token/')) return tokenResponse({ access_token: 'NEW' })
      if (first) { first = false; return new Response('', { status: 401 }) }
      return new Response('[]', { status: 200 })
    })
    await act(async () => { await bff.bff.menu() })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(status()).toBe('authenticated')
    expect(loadTokens()?.accessToken).toBe('NEW')
  })
})

function arriveCallbackError() {
  window.history.replaceState({}, '', '/auth/callback?code=abc')
}
