import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import './LoginPage.css'

export function LoginPage() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFormError(null)
    try {
      await auth.loginWithCredentials(username, password)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  const displayError = formError ?? auth.error

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-header">
          <span className="login-logo-icon">&#9670;</span>
          <h1>Service Portal</h1>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="sp-username">Usuário</label>
            <input
              id="sp-username"
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setFormError(null) }}
              autoComplete="username"
              required
              disabled={loading}
              placeholder="seu.usuario"
            />
          </div>
          <div className="login-field">
            <label htmlFor="sp-password">Senha</label>
            <input
              id="sp-password"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setFormError(null) }}
              autoComplete="current-password"
              required
              disabled={loading}
              placeholder="••••••••"
            />
          </div>
          {displayError && <p className="login-error">{displayError}</p>}
          <button
            type="submit"
            className="login-btn"
            disabled={loading || !username || !password}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
