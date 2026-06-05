import { bff } from '../../../api/bff'
import { useAuth } from '../../../auth/AuthProvider'
import type { IntegrationDefinition, UiSchema } from '../../../types'
import { ResourceManager } from '../ResourceManager/ResourceManager'

const TEMPLATE = JSON.stringify(
  {
    integrationId: 'my-integration',
    type: 'HTTP',
    url: 'http://api.exemplo.com/resource/{{contract.field}}',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
    bodyTemplate: null,
    responseBody: { example: 'value' },
  },
  null,
  2,
)

/** Integrações: escrita apenas ADMIN; leitura ADMIN/WORKFLOWS (enforce no BFF). */
export function IntegrationManager({ schema }: { schema: UiSchema }) {
  const { groups } = useAuth()
  const canWrite = groups.includes('ADMIN')
  return (
    <ResourceManager<IntegrationDefinition>
      title={schema.title}
      config={{
        idField: 'integrationId',
        label: 'integração',
        api: bff.integrations,
        template: TEMPLATE,
        canWrite,
      }}
    />
  )
}
