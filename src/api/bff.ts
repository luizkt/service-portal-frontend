import type { FlowDefinition, MenuItem, OrchestrationResponse, UiSchema } from '../types'

const BASE = '/bff'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const bff = {
  menu: (): Promise<MenuItem[]> =>
    request('/menu'),

  uiSchema: (featureId: string): Promise<UiSchema> =>
    request(`/ui/${featureId}`),

  flows: {
    list: (): Promise<FlowDefinition[]> =>
      request('/flows'),

    get: (flowId: string): Promise<FlowDefinition> =>
      request(`/flows/${flowId}`),

    create: (yaml: string): Promise<FlowDefinition> =>
      request('/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: yaml,
      }),

    update: (flowId: string, yaml: string): Promise<FlowDefinition> =>
      request(`/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: yaml,
      }),

    delete: (flowId: string): Promise<void> =>
      request(`/flows/${flowId}`, { method: 'DELETE' }),

    execute: (
      version: string,
      flowId: string,
      payload: Record<string, unknown>
    ): Promise<OrchestrationResponse> =>
      request(`/orchestrate/${version}/${flowId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
}
