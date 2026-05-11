import type { FlowDefinition, FlowsPage, MenuItem, OrchestrationResponse, UiSchema } from '../types'
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

export interface ListFlowsParams {
  page?: number
  size?: number
  sort?: string
  status?: 'active' | string
}

/**
 * Cliente do BFF — todos os paths são REST-shape em inglês após o refactor:
 *   - /bff/features/{id}/ui-schema     (substitui /bff/ui/{id})
 *   - /bff/flows/{id}/versions/{v}     (substitui /bff/flows/{id}/{versao})
 *   - /bff/flows/{id}/versions/{v}/yaml
 *   - /bff/flows/{id}/versions/{v}/executions (substitui /bff/orchestrate/{v}/{id})
 *   - /bff/flows?status=active         (em vez de /workflows/active)
 */
export const bff = {
  menu: (): Promise<MenuItem[]> =>
    request('/menu'),

  uiSchema: (featureId: string): Promise<UiSchema> =>
    request(`/features/${encodeURIComponent(featureId)}/ui-schema`),

  flows: {
    list: (params: ListFlowsParams = {}): Promise<FlowsPage | FlowDefinition[]> => {
      const qs = new URLSearchParams()
      if (params.page != null) qs.set('page', String(params.page))
      if (params.size != null) qs.set('size', String(params.size))
      if (params.sort) qs.set('sort', params.sort)
      if (params.status) qs.set('status', params.status)
      const suffix = qs.toString() ? `?${qs.toString()}` : ''
      return request(`/flows${suffix}`)
    },

    get: (flowId: string, version: string): Promise<FlowDefinition> =>
      request(`/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(version)}`),

    getYaml: async (flowId: string, version: string): Promise<string> => {
      const tokens = loadTokens()
      const headers: Record<string, string> = { Accept: 'application/x-yaml' }
      if (tokens?.accessToken) headers['Authorization'] = `Bearer ${tokens.accessToken}`
      const res = await fetch(
        `${BASE}/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(version)}/yaml`,
        { headers }
      )
      if (res.status === 401 && onUnauthorized) onUnauthorized()
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`${res.status} ${res.statusText}: ${body}`)
      }
      return res.text()
    },

    create: (yaml: string): Promise<FlowDefinition> =>
      request('/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: yaml,
      }),

    update: (flowId: string, version: string, yaml: string): Promise<FlowDefinition> =>
      request(`/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(version)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: yaml,
      }),

    delete: (flowId: string, version: string): Promise<void> =>
      request(`/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(version)}`, {
        method: 'DELETE',
      }),

    execute: (
      flowId: string,
      version: string,
      payload: Record<string, unknown>
    ): Promise<OrchestrationResponse> =>
      request(
        `/flows/${encodeURIComponent(flowId)}/versions/${encodeURIComponent(version)}/executions`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
  },
}
