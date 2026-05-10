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
  mongoId: string
  id: string
  descricao: string
  versao: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export interface OrchestrationResponse {
  executionId: string
  flowId: string
  status: string
  resultado: Record<string, unknown>
  errorMessage?: string
  iniciadoEm: string
  finalizadoEm: string
}
