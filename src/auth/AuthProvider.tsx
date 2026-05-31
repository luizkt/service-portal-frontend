import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  exchangeCodeForTokens,
  fetchAuthConfig,
  isTokenValid,
  logout as oauthLogout,
  startLogin,
  type AuthConfig,
} from './oauth'
import { clearTokens, loadPkceState, loadTokens, type StoredTokens } from './storage'
import { setAuthConfig, setOnUnauthorized } from '../api/bff'

const REDIRECT_PATH = '/auth/callback'

interface AuthContextValue {
  status: 'loading' | 'unauthenticated' | 'authenticated' | 'error'
  error: string | null
  accessToken: string | null
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function buildRedirectUri(): string {
  return window.location.origin + REDIRECT_PATH
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [tokens, setTokens] = useState<StoredTokens | null>(loadTokens())
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [error, setError] = useState<string | null>(null)

  // 1) carrega config do BFF; 2) se URL é /auth/callback, troca code por token
  useEffect(() => {
    let cancelled = false
    fetchAuthConfig()
      .then(async cfg => {
        if (cancelled) return
        setConfig(cfg)
        setAuthConfig(cfg)

        if (window.location.pathname === REDIRECT_PATH) {
          const params = new URLSearchParams(window.location.search)
          const code = params.get('code')
          const state = params.get('state')
          if (!code || !state) {
            setStatus('error')
            setError('Callback sem code/state')
            return
          }
          try {
            // Captura returnTo antes de exchangeCodeForTokens limpar o PKCE state
            const returnTo = loadPkceState()?.returnTo ?? '/'
            const t = await exchangeCodeForTokens(cfg, buildRedirectUri(), code, state)
            if (cancelled) return
            setTokens(t)
            setStatus('authenticated')
            window.history.replaceState({}, '', returnTo)
          } catch (e) {
            setStatus('error')
            setError(e instanceof Error ? e.message : 'Falha no callback')
          }
        } else {
          const stored = loadTokens()
          setTokens(stored)
          setStatus(isTokenValid(stored) ? 'authenticated' : 'unauthenticated')
        }
      })
      .catch(e => {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Falha ao carregar config')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(() => {
    if (!config) return
    void startLogin(config, buildRedirectUri(), window.location.pathname + window.location.search)
  }, [config])

  const logout = useCallback(() => {
    const idToken = tokens?.idToken
    clearTokens()
    setTokens(null)
    setStatus('unauthenticated')
    if (config) {
      oauthLogout(config, window.location.origin, idToken)
    }
  }, [config, tokens])

  // Quando o BFF responder 401, derruba a sessão no front
  useEffect(() => {
    setOnUnauthorized(() => {
      clearTokens()
      setTokens(null)
      setStatus('unauthenticated')
    })
    return () => setOnUnauthorized(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        status,
        error,
        accessToken: tokens?.accessToken ?? null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
