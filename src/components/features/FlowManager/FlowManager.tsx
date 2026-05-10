import { useEffect, useState } from 'react'
import { bff } from '../../../api/bff'
import type { FlowDefinition, OrchestrationResponse, UiSchema } from '../../../types'
import './FlowManager.css'

interface Props {
  schema: UiSchema
}

type View = 'list' | 'create' | 'detail' | 'execute'

const FLOW_TEMPLATE = `fluxo:
  id: "meu-fluxo"
  descricao: "Descrição do fluxo"
  versao: "1.0.0"
  ativo: true

  contrato:
    campos:
      - nome: "campo"
        tipo: STRING
        obrigatorio: true
        validacoes:
          - tipo: NOT_BLANK

  integracoes:
    - id: "passo-1"
      ordem: 1
      tipo: HTTP
      continuarEmErro: false
      http:
        url: "http://example.com/api"
        metodo: GET
        headers:
          Accept: "application/json"
`

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
  const [execVersion, setExecVersion] = useState('v1')
  const [execPayload, setExecPayload] = useState('{\n  \n}')
  const [execResult, setExecResult] = useState<OrchestrationResponse | null>(null)
  const [executing, setExecuting] = useState(false)

  const loadFlows = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await bff.flows.list()
      setFlows(data)
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
      await bff.flows.update(selected.id, yaml)
      await loadFlows()
      setView('list')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (flowId: string) => {
    if (!confirm(`Desativar o fluxo "${flowId}"?`)) return
    try {
      await bff.flows.delete(flowId)
      await loadFlows()
      if (selected?.id === flowId) {
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
      const full = await bff.flows.get(flow.id)
      setSelected(full)
    } catch (_) {}
  }

  const handleEditFromDetail = () => {
    if (!selected) return
    setYaml(
      `fluxo:\n  id: "${selected.id}"\n  descricao: "${selected.descricao ?? ''}"\n  versao: "${selected.versao}"\n  ativo: ${selected.ativo}\n`
    )
    setView('create')
  }

  const handleExecute = async () => {
    if (!selected) return
    setExecuting(true)
    setExecResult(null)
    setError(null)
    try {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(execPayload)
      } catch {
        setError('Payload JSON inválido.')
        setExecuting(false)
        return
      }
      const result = await bff.flows.execute(execVersion, selected.id, payload)
      setExecResult(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setExecuting(false)
    }
  }

  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR')
  }

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
            <button className="btn btn-primary" onClick={() => { setYaml(FLOW_TEMPLATE); setView('create'); setError(null) }}>
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
                  <tr key={flow.mongoId ?? flow.id} onClick={() => handleViewDetail(flow)} className="fm-table-row">
                    <td className="fm-flow-id">{flow.id}</td>
                    <td>{flow.descricao ?? '—'}</td>
                    <td><span className="fm-badge">{flow.versao}</span></td>
                    <td className="fm-date">{formatDate(flow.criadoEm)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="fm-row-actions">
                        <button className="btn btn-sm btn-ghost" onClick={() => { setSelected(flow); setView('execute'); setExecResult(null) }}>
                          ▶ Executar
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(flow.id)}>
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
          <h2 className="fm-form-title">{selected ? `Editar: ${selected.id}` : 'Novo Fluxo'}</h2>
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
              <span className="fm-detail-value fm-flow-id">{selected.id}</span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Descrição</span>
              <span className="fm-detail-value">{selected.descricao ?? '—'}</span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Versão</span>
              <span className="fm-detail-value"><span className="fm-badge">{selected.versao}</span></span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Status</span>
              <span className="fm-detail-value">
                <span className={`fm-status ${selected.ativo ? 'fm-status--active' : 'fm-status--inactive'}`}>
                  {selected.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Criado em</span>
              <span className="fm-detail-value fm-date">{formatDate(selected.criadoEm)}</span>
            </div>
            <div className="fm-detail-row">
              <span className="fm-detail-label">Atualizado em</span>
              <span className="fm-detail-value fm-date">{formatDate(selected.atualizadoEm)}</span>
            </div>
          </div>
          <div className="fm-detail-actions">
            <button className="btn btn-primary" onClick={() => { setView('execute'); setExecResult(null) }}>
              ▶ Executar
            </button>
            <button className="btn btn-ghost" onClick={handleEditFromDetail}>
              Editar YAML
            </button>
            <button className="btn btn-danger" onClick={() => handleDelete(selected.id)}>
              Desativar
            </button>
          </div>
        </div>
      )}

      {/* EXECUTE VIEW */}
      {view === 'execute' && selected && (
        <div className="fm-execute">
          <h2 className="fm-form-title">Executar: <span className="fm-flow-id">{selected.id}</span></h2>
          <div className="fm-execute-form">
            <label className="fm-label">Versão do fluxo</label>
            <input
              className="fm-input"
              value={execVersion}
              onChange={e => setExecVersion(e.target.value)}
              placeholder="v1"
            />
            <label className="fm-label">Payload (JSON)</label>
            <textarea
              className="fm-yaml-editor"
              value={execPayload}
              onChange={e => setExecPayload(e.target.value)}
              rows={10}
              spellCheck={false}
            />
            <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
              {executing ? 'Executando...' : '▶ Executar'}
            </button>
          </div>

          {execResult && (
            <div className={`fm-exec-result ${execResult.status === 'SUCCESS' ? 'fm-exec-result--success' : 'fm-exec-result--error'}`}>
              <div className="fm-exec-result-header">
                <strong>Status:</strong> {execResult.status}
                {execResult.executionId && <span className="fm-exec-id">ID: {execResult.executionId}</span>}
              </div>
              {execResult.errorMessage && (
                <div className="fm-exec-error-msg">{execResult.errorMessage}</div>
              )}
              <pre className="fm-exec-json">{JSON.stringify(execResult.resultado, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
