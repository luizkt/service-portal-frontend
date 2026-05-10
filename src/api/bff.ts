import type { FlowDefinition, MenuItem, OrchestrationResponse, UiSchema } from '../types'
import { loadTokens } from '../auth/storage'

const BASE = '/bff'

/** Injetado pelo AuthProvider para invalidar a sessão em respostas 401. */
let onUnauthorized: (() => void) | null = null
export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  }
  const tokens = loadTokens()
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized()
  }
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
