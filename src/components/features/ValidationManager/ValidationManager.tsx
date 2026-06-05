import { bff } from '../../../api/bff'
import { useAuth } from '../../../auth/AuthProvider'
import type { UiSchema, ValidationDefinition } from '../../../types'
import { ResourceManager } from '../ResourceManager/ResourceManager'

const TEMPLATE = JSON.stringify(
  {
    validationId: 'my-validation',
    type: 'HTTP',
    url: 'http://api.exemplo.com/resource/{{contract.field}}/check',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
    bodyTemplate: null,
    responseBody: { example: 'value' },
  },
  null,
  2,
)

/** Validações: escrita ADMIN/RULES; leitura ADMIN/RULES (enforce no BFF). */
export function ValidationManager({ schema }: { schema: UiSchema }) {
  const { groups } = useAuth()
  const canWrite = groups.includes('ADMIN') || groups.includes('RULES')
  return (
    <ResourceManager<ValidationDefinition>
      title={schema.title}
      config={{
        idField: 'validationId',
        label: 'validação',
        api: bff.validations,
        template: TEMPLATE,
        canWrite,
      }}
    />
  )
}
