// Persistência do estado de auth em sessionStorage.
// Some ao fechar a aba; sobrevive a reload.

export interface StoredTokens {
  accessToken: string
  idToken?: string
  refreshToken?: string
  /** epoch ms — quando o access_token expira. */
  expiresAt: number
}

const TOKENS_KEY = 'sp.auth.tokens'
const PKCE_KEY = 'sp.auth.pkce'

interface PkceState {
  codeVerifier: string
  state: string
  /** Caminho ou URL onde o usuário estava antes do login (para redirect pós-login). */
  returnTo?: string
}

export function saveTokens(tokens: StoredTokens): void {
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function loadTokens(): StoredTokens | null {
  const raw = sessionStorage.getItem(TOKENS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredTokens
  } catch {
    return null
  }
}

export function clearTokens(): void {
  sessionStorage.removeItem(TOKENS_KEY)
}

export function savePkceState(state: PkceState): void {
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(state))
}

export function loadPkceState(): PkceState | null {
  const raw = sessionStorage.getItem(PKCE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PkceState
  } catch {
    return null
  }
}

export function clearPkceState(): void {
  sessionStorage.removeItem(PKCE_KEY)
}
