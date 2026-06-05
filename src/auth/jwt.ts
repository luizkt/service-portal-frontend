export interface JwtClaims {
  sub?: string
  name?: string
  preferred_username?: string
  email?: string
  groups?: string[]
  exp?: number
}

export function decodeJwtPayload(token: string): JwtClaims {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return {}
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    return JSON.parse(atob(padded)) as JwtClaims
  } catch {
    return {}
  }
}
