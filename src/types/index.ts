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
  validations?: Record<string, unknown>
  errorMessage?: string
  startedAt: string
  finishedAt: string
}

/** Envelope Spring Data Page genérico para os recursos modulares. */
export interface ResourcePage<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface IntegrationDefinition {
  integrationId: string
  version: number
  type: string
  url: string
  method: string
  headers: Record<string, string>
  timeout: number
  bodyTemplate: string | null
  responseBody: Record<string, unknown> | null
  active: boolean
  createdAt: string
  updatedAt: string
}

/** Mesma forma de IntegrationDefinition (validações pós-integrações). */
export interface ValidationDefinition {
  validationId: string
  version: number
  type: string
  url: string
  method: string
  headers: Record<string, string>
  timeout: number
  bodyTemplate: string | null
  responseBody: Record<string, unknown> | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface FieldValidation {
  type: string
  value?: string
  message?: string
}

export interface ContractField {
  name: string
  type: string
  required: boolean
  validations: FieldValidation[]
}

export interface ContractDefinition {
  contractId: string
  version: number
  fields: ContractField[]
  active: boolean
  createdAt: string
  updatedAt: string
}
