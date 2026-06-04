import { useEffect, useState } from 'react'
import { bff } from '../../../api/bff'
import type { FlowDefinition, FlowsPage, OrchestrationResponse, UiSchema } from '../../../types'
import './FlowManager.css'

interface Props {
  schema: UiSchema
}

type View = 'list' | 'create' | 'detail' | 'execute'

const FLOW_TEMPLATE = `flow:
  id: "my-flow"
  description: "Flow description"
  version: "1.0.0"
  active: true

  contract:
    fields:
      - name: "field"
        type: STRING
        required: true
        validations:
          - type: NOT_BLANK

  integrations:
    - id: "step-1"
      order: 1
      type: HTTP
      continueOnError: false
      http:
        url: "http://example.com/api"
        method: GET
        headers:
          Accept: "application/json"
`

function isPage(x: FlowsPage | FlowDefinition[]): x is FlowsPage {
  return !Array.isArray(x) && typeof (x as FlowsPage).content !== 'undefined'
}

export function FlowManager({ schema }: Props) {
  const [view, setView] = useState<View>('list')
  const [flows, setFlows] = useState<FlowDefinition[]>([])
  const [selected, setSelected] = useState<FlowDefinition | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create/Edit form state
  const [yaml, setYaml] = useState(FLOW_TEMPLATE)
  const [submitting, setSubmitting] = useState(false)

  // Execute state
  const [execPayload, setExecPayload] = useState('{\n  \n}')
  const [execResult, setExecResult] = useState<OrchestrationResponse | null>(null)
  const [executing, setExecuting] = useState(false)
  const [execResultV2, setExecResultV2] = useState<OrchestrationResponse | null>(null)
  const [executingV2, setExecutingV2] = useState(false)

  const loadFlows = async () => {
    setLoading(true)
    setError(null)
    try {
      // Lista de ativos (sem yamlContent) — ideal para a tela inicial
      const data = await bff.flows.list({ status: 'active' })
      setFlows(isPage(data) ? data.content : data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFlows()
  }, [])

  const handleCreate = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await bff.flows.create(yaml)
      await loadFlows()
      setView('list')
      setYaml(FLOW_TEMPLATE)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      await bff.flows.update(selected.flowId, selected.version, yaml)
      await loadFlows()
      setView('list')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (flow: FlowDefinition) => {
    if (!confirm(`Desativar o fluxo "${flow.flowId}" versão ${flow.version}?`)) return
    try {
      await bff.flows.delete(flow.flowId, flow.version)
      await loadFlows()
      if (selected?.flowId === flow.flowId && selected?.version === flow.version) {
        setSelected(null)
        setView('list')
      }
    } catch (e) {
      setError(String(e))
    }
  }

  const handleViewDetail = async (flow: FlowDefinition) => {
    setSelected(flow)
    setView('detail')
    try {
      const full = await bff.flows.get(flow.flowId, flow.version)
      setSelected(full)
    } catch (_) {}
  }

  const handleEditFromDetail = async () => {
    if (!selected) return
    try {
      // Recupera o YAML cru atual para edição
      const yamlContent = await bff.flows.getYaml(selected.flowId, selected.version)
      setYaml(yamlContent)
    } catch {
      // Fallback: gera um YAML mínimo a partir dos metadados
      setYaml(
        `flow:\n  id: "${selected.flowId}"\n  description: "${selected.description ?? ''}"\n  version: "${selected.version}"\n  active: ${selected.active}\n`
      )
    }
    setView('create')
  }

  const parsePayload = (): Record<string, unknown> | null => {
    try {
      return JSON.parse(execPayload)
    } catch {
      setError('Payload JSON inválido.')
      return null
    }
  }

  const handleExecute = async () => {
    if (!selected) return
    const payload = parsePayload()
    if (!payload) return
    setExecuting(true)
    setExecResult(null)
    setError(null)
    try {
      setExecResult(await bff.flows.execute(selected.flowId, selected.version, payload))
    } catch (e) {
      setError(String(e))
    } finally {
      setExecuting(false)
    }
  }

  const handleExecuteV2 = async () => {
    if (!selected) return
    const payload = parsePayload()
    if (!payload) return
    setExecutingV2(true)
    setExecResultV2(null)
    setError(null)
    try {
      setExecResultV2(await bff.flows.executeV2(selected.flowId, selected.version, payload))
    } catch (e) {
      setError(String(e))
    } finally {
      setExecutingV2(false)
    }
  }

  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR')
  }

  const flowKey = (f: FlowDefinition) => `${f.flowId}_${f.version}`

  return (
    <div className="fm">
      <div className="fm-header">
        <h1 className="fm-title">{schema.title}</h1>
        <div className="fm-header-actions">
          {view !== 'list' && (
            <button className="btn btn-ghost" onClick={() => { setView('list'); setError(null) }}>
              ← Voltar
            </button>
          )}
          {view === 'list' && (
            <button className="btn btn-primary" onClick={() => { setYaml(FLOW_TEMPLATE); setSelected(null); setView('create'); setError(null) }}>
              + Novo Fluxo
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="fm-error">
          <strong>Erro:</strong> {error}
          <button className="fm-error-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* LIST VIEW */}
      {view === 'list' && (
        <div className="fm-list">
          {loading ? (
            <div className="fm-loading">Carregando fluxos...</div>
          ) : flows.length === 0 ? (
            <div className="fm-empty">
              <p>Nenhum fluxo cadastrado.</p>
              <button className="btn btn-primary" onClick={() => { setYaml(FLOW_TEMPLATE); setView('create') }}>
                Criar primeiro fluxo
              </button>
            </div>
          ) : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Descrição</th>
                  <th>Versão</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {flows.map(flow => (
                  <tr key={flowKey(flow)} onClick={() => handleViewDetail(flow)} className="fm-table-row">
                    <td className="fm-flow-id">{flow.flowId}</td>
                    <td>{flow.description ?? '—'}</td>
                    <td><span className="fm-badge">{flow.version}</span></td>
                    <td className="fm-date">{formatDate(flow.createdAt)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="fm-row-actions">
                        <button className="btn btn-sm btn-ghost" onClick={() => { setSelected(flow); setView('execute'); setExecResult(null); setExecResultV2(null) }}>
                          ▶ Executar
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(flow)}>
                          Desativar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CREATE / EDIT VIEW */}
      {view === 'create' && (
        <div className="fm-form">
          <h2 className="fm-form-title">{selected ? `Editar: ${selected.flowId} (${selected.version})` : 'Novo Fluxo'}</h2>
          <p className="fm-form-hint">Cole ou edite o YAML do fluxo abaixo.</p>
          <textarea
            className="fm-yaml-editor"
            value={yaml}
            onChange={e => setYaml(e.target.value)}
            rows={24}
            spellCheck={false}
          />
          <div className="fm-form-actions">
            <button
              className="btn btn-primary"
              onClick={selected ? handleUpdate : handleCreate}
              disabled={submitting}
            >
              {submitting ? 'Salvando...' : (selected ? 'Atualizar' : 'Criar Fluxo')}
            </button>
          </div>
        </div>
      )}

      {/* DETAIL VIEW */}
      {view === 'detail' && selected && (
        <div className="fm-detail">
          <div className="fm-detail-card">
            <div className="fm-detail-row">
              <span className="fm-detail-label">ID</span>
              <span className="fm-detail-value fm-flow-id">{selected.flowId}</span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Descrição</span>
              <span className="fm-detail-value">{selected.description ?? '—'}</span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Versão</span>
              <span className="fm-detail-value"><span className="fm-badge">{selected.version}</span></span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Status</span>
              <span className="fm-detail-value">
                <span className={`fm-status ${selected.active ? 'fm-status--active' : 'fm-status--inactive'}`}>
                  {selected.active ? 'Ativo' : 'Inativo'}
                </span>
              </span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Criado em</span>
              <span className="fm-detail-value fm-date">{formatDate(selected.createdAt)}</span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Atualizado em</span>
              <span className="fm-detail-value fm-date">{formatDate(selected.updatedAt)}</span>
            </div>
          </div>
          <div className="fm-detail-actions">
            <button className="btn btn-primary" onClick={() => { setView('execute'); setExecResult(null); setExecResultV2(null) }}>
              ▶ Executar
            </button>
            <button className="btn btn-ghost" onClick={handleEditFromDetail}>
              Editar YAML
            </button>
            <button className="btn btn-danger" onClick={() => handleDelete(selected)}>
              Desativar
            </button>
          </div>
        </div>
      )}

      {/* EXECUTE VIEW */}
      {view === 'execute' && selected && (
        <div className="fm-execute">
          <h2 className="fm-form-title">
            Executar: <span className="fm-flow-id">{selected.flowId}</span>{' '}
            <span className="fm-badge">{selected.version}</span>
          </h2>
          <div className="fm-execute-form">
            <label className="fm-label">Payload (JSON)</label>
            <textarea
              className="fm-yaml-editor"
              value={execPayload}
              onChange={e => setExecPayload(e.target.value)}
              rows={10}
              spellCheck={false}
            />
            <div className="fm-exec-actions">
              <button className="btn btn-primary" onClick={handleExecute} disabled={executing || executingV2}>
                {executing ? 'Executando...' : '▶ v1 Sequencial'}
              </button>
              <button className="btn btn-secondary" onClick={handleExecuteV2} disabled={executing || executingV2}>
                {executingV2 ? 'Executando...' : '▶ v2 Paralelo'}
              </button>
            </div>
          </div>

          {(execResult || execResultV2) && (
            <div className="fm-exec-compare">
              {execResult && (
                <div className={`fm-exec-result ${execResult.status === 'SUCCESS' ? 'fm-exec-result--success' : 'fm-exec-result--error'}`}>
                  <div className="fm-exec-result-header">
                    <strong>v1 — Sequencial</strong>
                    <span className="fm-exec-status">{execResult.status}</span>
                    {execResult.executionId && <span className="fm-exec-id">ID: {execResult.executionId}</span>}
                  </div>
                  {execResult.errorMessage && (
                    <div className="fm-exec-error-msg">{execResult.errorMessage}</div>
                  )}
                  <h4 className="fm-exec-section-title">Integrações</h4>
                  <pre className="fm-exec-json">{JSON.stringify(execResult.result, null, 2)}</pre>
                  {execResult.validations && Object.keys(execResult.validations).length > 0 && (
                    <>
                      <h4 className="fm-exec-section-title">Validações</h4>
                      <pre className="fm-exec-json fm-exec-validations">{JSON.stringify(execResult.validations, null, 2)}</pre>
                    </>
                  )}
                </div>
              )}
              {execResultV2 && (
                <div className={`fm-exec-result ${execResultV2.status === 'SUCCESS' ? 'fm-exec-result--success' : 'fm-exec-result--error'}`}>
                  <div className="fm-exec-result-header">
                    <strong>v2 — Paralelo</strong>
                    <span className="fm-exec-status">{execResultV2.status}</span>
                    {execResultV2.executionId && <span className="fm-exec-id">ID: {execResultV2.executionId}</span>}
                  </div>
                  {execResultV2.errorMessage && (
                    <div className="fm-exec-error-msg">{execResultV2.errorMessage}</div>
                  )}
                  <h4 className="fm-exec-section-title">Integrações</h4>
                  <pre className="fm-exec-json">{JSON.stringify(execResultV2.result, null, 2)}</pre>
                  {execResultV2.validations && Object.keys(execResultV2.validations).length > 0 && (
                    <>
                      <h4 className="fm-exec-section-title">Validações</h4>
                      <pre className="fm-exec-json fm-exec-validations">{JSON.stringify(execResultV2.validations, null, 2)}</pre>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
