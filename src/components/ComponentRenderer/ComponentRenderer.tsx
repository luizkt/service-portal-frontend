import type { UiSchema } from '../../types'
import { FlowManager } from '../features/FlowManager/FlowManager'
import { IntegrationManager } from '../features/IntegrationManager/IntegrationManager'
import { ContractManager } from '../features/ContractManager/ContractManager'
import { ValidationManager } from '../features/ValidationManager/ValidationManager'
import './ComponentRenderer.css'

const componentMap: Record<string, React.ComponentType<{ schema: UiSchema }>> = {
  'flow-manager': FlowManager,
  'integration-manager': IntegrationManager,
  'contract-manager': ContractManager,
  'validation-manager': ValidationManager,
}

interface Props {
  schema: UiSchema | null
}

export function ComponentRenderer({ schema }: Props) {
  if (!schema) {
    return (
      <div className="renderer-welcome">
        <div className="renderer-welcome-icon">&#9670;</div>
        <h2>Service Portal</h2>
        <p>Selecione uma funcionalidade no menu lateral para começar.</p>
      </div>
    )
  }

  const Component = componentMap[schema.type]
  if (!Component) {
    return (
      <div className="renderer-unknown">
        <p>Componente não encontrado para o tipo: <strong>{schema.type}</strong></p>
      </div>
    )
  }

  return <Component schema={schema} />
}
