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
    const result = await bff.flows.delete('flow-x', '1.0')
    expect(result).toBeUndefined()
  })

  it('flows.get monta /bff/flows/{id}/versions/{v}', async () => {
    const f = mockFetch(new Response('{"flowId":"f1","version":"1.0"}', { status: 200 }))
    await bff.flows.get('f1', '1.0')
    expect(f.mock.calls[0][0]).toBe('/bff/flows/f1/versions/1.0')
  })

  it('flows.list sem args usa /bff/flows', async () => {
    const f = mockFetch(new Response('{"content":[]}', { status: 200 }))
    await bff.flows.list()
    expect(f.mock.calls[0][0]).toBe('/bff/flows')
  })

  it('flows.list com status=active vai como query param', async () => {
    const f = mockFetch(new Response('[]', { status: 200 }))
    await bff.flows.list({ status: 'active' })
    expect(f.mock.calls[0][0]).toBe('/bff/flows?status=active')
  })

  it('flows.list com paginação completa', async () => {
    const f = mockFetch(new Response('{"content":[]}', { status: 200 }))
    await bff.flows.list({ page: 1, size: 50, sort: 'flowId,asc' })
    expect(f.mock.calls[0][0]).toBe('/bff/flows?page=1&size=50&sort=flowId%2Casc')
  })

  it('flows.create envia YAML como text/plain', async () => {
    const f = mockFetch(new Response('{}', { status: 200 }))
    await bff.flows.create('id: foo\n')
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
    expect(init.body).toBe('id: foo\n')
  })

  it('flows.update PUT em /bff/flows/{id}/versions/{v}', async () => {
    const f = mockFetch(new Response('{}', { status: 200 }))
    await bff.flows.update('f1', '1.0', 'yaml')
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PUT')
    expect(f.mock.calls[0][0]).toBe('/bff/flows/f1/versions/1.0')
  })

  it('flows.execute POST em /bff/flows/{id}/versions/{v}/executions', async () => {
    const f = mockFetch(new Response('{"executionId":"e1"}', { status: 200 }))
    const r = await bff.flows.execute('my-flow', 'v2', { x: 1 })
    expect(f.mock.calls[0][0]).toBe('/bff/flows/my-flow/versions/v2/executions')
    const init = f.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"x":1}')
    expect(r).toMatchObject({ executionId: 'e1' })
  })

  it('flows.getYaml GET com Accept application/x-yaml', async () => {
    saveTokens({ accessToken: 'AT', expiresAt: Date.now() + 60_000 })
    const f = mockFetch(new Response('flow:\n  id: x\n', { status: 200 }))
    const yaml = await bff.flows.getYaml('f1', '1.0')
    expect(yaml).toBe('flow:\n  id: x\n')
    expect(f.mock.calls[0][0]).toBe('/bff/flows/f1/versions/1.0/yaml')
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['Accept']).toBe('application/x-yaml')
    expect(headers['Authorization']).toBe('Bearer AT')
  })

  it('flows.getYaml lança erro em falha não-ok', async () => {
    mockFetch(new Response('boom', { status: 500, statusText: 'ERR' }))
    await expect(bff.flows.getYaml('f1', '1.0')).rejects.toThrow(/500.*ERR.*boom/s)
  })

  it('flows.getYaml chama onUnauthorized em 401', async () => {
    const handler = vi.fn()
    setOnUnauthorized(handler)
    mockFetch(new Response('nope', { status: 401, statusText: 'Unauthorized' }))
    await expect(bff.flows.getYaml('f1', '1.0')).rejects.toThrow(/401/)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('uiSchema usa /bff/features/{id}/ui-schema', async () => {
    const f = mockFetch(new Response('{"featureId":"x","type":"x","title":"X"}', { status: 200 }))
    await bff.uiSchema('x')
    expect(f.mock.calls[0][0]).toBe('/bff/features/x/ui-schema')
  })
})
