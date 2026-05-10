// PKCE helpers — RFC 7636. Usa Web Crypto API + crypto.getRandomValues nativos.

const VERIFIER_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/** Gera string base64url a partir de bytes (sem padding). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** code_verifier: 43–128 chars do conjunto unreserved. Default 64. */
export function generateCodeVerifier(length = 64): string {
  if (length < 43 || length > 128) {
    throw new Error('code_verifier deve ter entre 43 e 128 caracteres')
  }
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += VERIFIER_ALPHABET[bytes[i] % VERIFIER_ALPHABET.length]
  }
  return out
}

/** code_challenge = base64url( SHA-256( code_verifier ) ) — método S256. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

/** state / nonce — opaco anti-CSRF. */
export function generateRandomString(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}
