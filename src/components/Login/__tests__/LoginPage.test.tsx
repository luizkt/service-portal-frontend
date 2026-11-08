import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoginPage } from '../LoginPage'

const auth = { loginWithCredentials: vi.fn(), error: null as string | null }
vi.mock('../../../auth/AuthProvider', () => ({ useAuth: () => auth }))

function fill(user: string, pass: string) {
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: user } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: pass } })
}

beforeEach(() => {
  auth.loginWithCredentials.mockReset()
  auth.error = null
})

describe('LoginPage', () => {
  it('botão fica desabilitado enquanto faltar usuário ou senha', () => {
    render(<LoginPage />)
    const btn = screen.getByRole('button', { name: 'Entrar' })
    expect(btn).toBeDisabled()
    fill('ana', '')
    expect(btn).toBeDisabled()
    fill('ana', 'pw')
    expect(btn).toBeEnabled()
  })

  it('envia usuário e senha para loginWithCredentials', async () => {
    auth.loginWithCredentials.mockResolvedValue(undefined)
    render(<LoginPage />)
    fill('ana', 'pw')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(auth.loginWithCredentials).toHaveBeenCalledWith('ana', 'pw'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('durante o envio o botão mostra "Entrando..." e fica desabilitado, campos também', async () => {
    let finish!: () => void
    auth.loginWithCredentials.mockReturnValue(new Promise<void>(r => { finish = r }))
    render(<LoginPage />)
    fill('ana', 'pw')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    const btn = await screen.findByRole('button', { name: 'Entrando...' })
    expect(btn).toBeDisabled()
    expect(screen.getByLabelText('Usuário')).toBeDisabled()
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled())
  })

  it('erro do login aparece em role="alert" e some ao editar o campo', async () => {
    auth.loginWithCredentials.mockRejectedValue(new Error('Usuário ou senha inválidos'))
    render(<LoginPage />)
    fill('ana', 'errada')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Usuário ou senha inválidos')
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'outra' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejeição que não é Error usa mensagem padrão', async () => {
    auth.loginWithCredentials.mockRejectedValue('x')
    render(<LoginPage />)
    fill('ana', 'pw')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Erro ao fazer login')
  })

  it('mostra o erro do contexto de auth (ex.: callback inválido)', () => {
    auth.error = 'State inválido'
    render(<LoginPage />)
    expect(screen.getByRole('alert').textContent).toBe('State inválido')
  })
})
