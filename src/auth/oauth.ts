import { generateCodeChallenge, generateCodeVerifier, generateRandomString } from './pkce'
import { clearPkceState, loadPkceState, savePkceState, saveTokens, type StoredTokens } from './storage'

export interface AuthConfig {
  issuerUri: string
  clientId: string
  scopes: string[]
}

export interface TokenResponse {
  access_token: string
  id_token?: string
  refresh_token?: string
  expires_in: number
  token_type?: string
}

/** Garante "/" final. */
function withTrailingSlash(s: string): string {
  return s.endsWith('/') ? s : s + '/'
}

/** Fetch /bff/auth/config — endpoint público que descreve o IdP ao SPA. */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/bff/auth/config')
  if (!res.ok) throw new Error(`Falha ao carregar config de auth: ${res.status}`)
  return res.json()
}

/** Inicia o fluxo: gera code_verifier/state, persiste e redireciona para /authorize. */
export async function startLogin(
  config: AuthConfig,
  redirectUri: string,
  returnTo?: string
): Promise<void> {
  const codeVerifier = generateCodeVerifier()
  const state = generateRandomString()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  savePkceState({ codeVerifier, state, returnTo })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authorizeUrl = withTrailingSlash(config.issuerUri) + 'authorize/?' + params.toString()
  window.location.assign(authorizeUrl)
}

/** Troca o code recebido no callback por tokens (PKCE). */
export async function exchangeCodeForTokens(
  config: AuthConfig,
  redirectUri: string,
  code: string,
  receivedState: string
): Promise<StoredTokens> {
  const pkce = loadPkceState()
  if (!pkce) throw new Error('Estado PKCE ausente — reinicie o login')
  if (pkce.state !== receivedState) {
    clearPkceState()
    throw new Error('State inválido — possível CSRF')
  }

  const tokenUrl = withTrailingSlash(config.issuerUri) + 'token/'
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: pkce.codeVerifier,
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    clearPkceState()
    throw new Error(`Token endpoint retornou ${res.status}`)
  }
  const json = (await res.json()) as TokenResponse
  const tokens: StoredTokens = {
    accessToken: json.access_token,
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  saveTokens(tokens)
  clearPkceState()
  return tokens
}

/** Limpa tokens + redireciona para /end-session do Authentik. */
export function logout(config: AuthConfig, postLogoutRedirectUri: string, idToken?: string): void {
  const params = new URLSearchParams({ post_logout_redirect_uri: postLogoutRedirectUri })
  if (idToken) params.set('id_token_hint', idToken)
  const endSessionUrl = withTrailingSlash(config.issuerUri) + 'end-session/?' + params.toString()
  window.location.assign(endSessionUrl)
}

/** True se o token ainda tem >= skewMs ms de validade. */
export function isTokenValid(tokens: StoredTokens | null, skewMs = 30_000): boolean {
  if (!tokens) return false
  return tokens.expiresAt - Date.now() > skewMs
}
