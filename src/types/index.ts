export interface MenuItem {
  id: string
  label: string
  icon: string
  uiSchemaUrl: string
}

export interface UiSchema {
  featureId: string
  type: string
  title: string
}

export interface FlowDefinition {
  flowId: string
  version: string
  description: string
  active: boolean
  createdAt: string
  updatedAt: string
}

/** Spring Data Page envelope retornado por `GET /bff/flows` (sem `status=active`). */
export interface FlowsPage {
  content: FlowDefinition[]
  totalElements: number
  totalPages: number
  size: number
  number: number
  first: boolean
  last: boolean
}

export interface OrchestrationResponse {
  executionId: string
  flowId: string
  status: string
  result: Record<string, unknown>
  errorMessage?: string
  startedAt: string
  finishedAt: string
}
