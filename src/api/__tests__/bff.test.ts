import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bff, setOnUnauthorized } from '../bff'
import { saveTokens } from '../../auth/storage'

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  sessionStorage.clear()
  setOnUnauthorized(null)
})

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
}

describe('bff client', () => {
  it('GET /menu inclui Bearer quando há token', async () => {
    saveTokens({ accessToken: 'AT', expiresAt: Date.now() + 60_000 })
    const f = mockFetch(new Response('[{"id":"x","label":"X","icon":"i","uiSchemaUrl":"/u"}]', {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))

    const items = await bff.menu()
    expect(items).toHaveLength(1)
    const init = f.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer AT')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('omite Authorization quando não há token', async () => {
    const f = mockFetch(new Response('[]', { status: 200 }))
    await bff.menu()
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('lança erro com status e body em respostas !ok', async () => {
    mockFetch(new Response('detalhe', { status: 500, statusText: 'ERR' }))
    await expect(bff.menu()).rejects.toThrow(/500.*ERR.*detalhe/s)
  })

  it('chama onUnauthorized em 401 e ainda lança erro', async () => {
    const handler = vi.fn()
    setOnUnauthorized(handler)
    mockFetch(new Response('nope', { status: 401, statusText: 'Unauthorized' }))
    await expect(bff.menu()).rejects.toThrow(/401/)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('204 retorna undefined (delete)', async () => {
    mockFetch(new Response(null, { status: 204 }))
    const result = await bff.flows.delete('flow-x')
    expect(result).toBeUndefined()
  })

  it('flows.get monta path correto', async () => {
    const f = mockFetch(new Response('{"id":"f1"}', { status: 200 }))
    await bff.flows.get('f1')
    expect(f.mock.calls[0][0]).toBe('/bff/flows/f1')
  })

  it('flows.list', async () => {
    mockFetch(new Response('[]', { status: 200 }))
    expect(await bff.flows.list()).toEqual([])
  })

  it('flows.create envia YAML como text/plain', async () => {
    const f = mockFetch(new Response('{}', { status: 200 }))
    await bff.flows.create('id: foo\n')
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(init.body).toBe('id: foo\n')
  })

  it('flows.update envia PUT com YAML', async () => {
    const f = mockFetch(new Response('{}', { status: 200 }))
    await bff.flows.update('f1', 'yaml')
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(f.mock.calls[0][0]).toBe('/bff/flows/f1')
  })

  it('flows.execute monta path com version e flowId e envia JSON', async () => {
    const f = mockFetch(new Response('{"executionId":"e1"}', { status: 200 }))
    const r = await bff.flows.execute('v2', 'meu-fluxo', { x: 1 })
    expect(f.mock.calls[0][0]).toBe('/bff/orchestrate/v2/meu-fluxo')
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"x":1}')
    expect(r).toMatchObject({ executionId: 'e1' })
  })

  it('uiSchema usa featureId no path', async () => {
    const f = mockFetch(new Response('{"featureId":"x","type":"x","title":"X"}', { status: 200 }))
    await bff.uiSchema('x')
    expect(f.mock.calls[0][0]).toBe('/bff/ui/x')
  })
})
