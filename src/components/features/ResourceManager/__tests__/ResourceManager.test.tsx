import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResourceManager } from '../ResourceManager'
import type { ResourceApi, ResourceItem } from '../ResourceManager'

interface FakeItem extends ResourceItem {
  integrationId: string
  url: string
}

function makeApi(overrides: Partial<ResourceApi<FakeItem>> = {}): ResourceApi<FakeItem> {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({ integrationId: 'vc', version: 2, active: true, url: 'http://x', createdAt: '2026-01-01' }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const item: FakeItem = {
  integrationId: 'validate-client',
  url: 'http://api.exemplo.com/clients/1',
  version: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
}

function renderManager(api: ResourceApi<FakeItem>, canWrite = true) {
  return render(
    <ResourceManager<FakeItem>
      title="Integrações"
      config={{ idField: 'integrationId', label: 'integração', api, template: '{}', canWrite }}
    />
  )
}

describe('ResourceManager — edit flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('exibe botão Editar na view de detalhe quando canWrite=true', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item]), get: vi.fn().mockResolvedValue(item) })
    renderManager(api)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
  })

  it('oculta botão Editar quando canWrite=false', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item]), get: vi.fn().mockResolvedValue(item) })
    renderManager(api, false)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('heading', { level: 3, name: /validate-client/i }))
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('abre view de edição pré-populada ao clicar Editar', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item]), get: vi.fn().mockResolvedValue(item) })
    renderManager(api)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('"validate-client"')
    expect(screen.getByText(/nova versão será criada/i)).toBeTruthy()
  })

  it('chama api.update ao salvar e volta para a lista', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item]), get: vi.fn().mockResolvedValue(item) })
    renderManager(api)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('validate-client', 1, expect.any(Object)))
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('botão Cancelar na view de edição retorna para o detalhe', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item]), get: vi.fn().mockResolvedValue(item) })
    renderManager(api)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
    expect(screen.queryByRole('button', { name: 'Salvar nova versão' })).toBeNull()
  })

  it('exibe erro quando api.update lança exceção', async () => {
    const api = makeApi({
      list: vi.fn().mockResolvedValue([item]),
      get: vi.fn().mockResolvedValue(item),
      update: vi.fn().mockRejectedValue(new Error('400 Bad Request: id mismatch')),
    })
    renderManager(api)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))
    await waitFor(() => screen.getByText(/400 Bad Request/))
  })

  it('exibe erro de JSON inválido sem chamar api.update', async () => {
    const api = makeApi({ list: vi.fn().mockResolvedValue([item]), get: vi.fn().mockResolvedValue(item) })
    renderManager(api)
    await waitFor(() => screen.getByText('validate-client'))
    fireEvent.click(screen.getByText('validate-client'))
    await waitFor(() => screen.getByRole('button', { name: 'Editar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'INVALID JSON' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))
    await waitFor(() => screen.getByText(/SyntaxError/i))
    expect(api.update).not.toHaveBeenCalled()
  })
})
