import { bff } from '../../../api/bff'
import { useAuth } from '../../../auth/AuthProvider'
import type { ContractDefinition, UiSchema } from '../../../types'
import { ResourceManager } from '../ResourceManager/ResourceManager'

const TEMPLATE = JSON.stringify(
  {
    contractId: 'my-contract',
    fields: [
      {
        name: 'clientId',
        type: 'STRING',
        required: true,
        validations: [
          { type: 'NOT_BLANK' },
          { type: 'PATTERN', value: '^[A-Z0-9]{6,20}$', message: 'Invalid clientId' },
        ],
      },
      {
        name: 'amount',
        type: 'DECIMAL',
        required: true,
        validations: [{ type: 'POSITIVE' }],
      },
    ],
  },
  null,
  2,
)

/** Contratos: escrita ADMIN/WORKFLOWS; leitura ADMIN/WORKFLOWS/RULES (enforce no BFF). */
export function ContractManager({ schema }: { schema: UiSchema }) {
  const { groups } = useAuth()
  const canWrite = groups.includes('ADMIN') || groups.includes('WORKFLOWS')
  return (
    <ResourceManager<ContractDefinition>
      title={schema.title}
      config={{
        idField: 'contractId',
        label: 'contrato',
        api: bff.contracts,
        template: TEMPLATE,
        canWrite,
      }}
    />
  )
}
