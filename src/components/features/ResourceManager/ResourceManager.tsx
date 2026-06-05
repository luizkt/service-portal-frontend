import { useEffect, useState } from 'react'
import type { ResourcePage } from '../../../types'
import './ResourceManager.css'

/** Item mínimo comum aos recursos modulares (integrations/contracts/validations). */
export interface ResourceItem {
  version: number
  active: boolean
  createdAt: string
}

export interface ResourceApi<T extends ResourceItem> {
  list: (params?: { status?: string }) => Promise<ResourcePage<T> | T[]>
  get: (id: string, version: number) => Promise<T>
  listVersions: (id: string, status?: string) => Promise<T[]>
  create: (body: unknown) => Promise<T>
  update: (id: string, version: number, body: unknown) => Promise<T>
  delete: (id: string, version: number) => Promise<void>
}

export interface ResourceConfig<T extends ResourceItem> {
  /** Nome do campo de id (ex.: "integrationId"). */
  idField: string
  /** Rótulo singular para textos da UI (ex.: "integração"). */
  label: string
  /** Cliente do BFF para o recurso. */
  api: ResourceApi<T>
  /** Template JSON usado no formulário de criação. */
  template: string
  /** Indica se o usuário pode criar/editar/excluir (controla exibição dos botões). */
  canWrite?: boolean
}

type View = 'list' | 'create' | 'detail' | 'versions'

function isPage<T>(x: ResourcePage<T> | T[]): x is ResourcePage<T> {
  return !Array.isArray(x) && typeof (x as ResourcePage<T>).content !== 'undefined'
}

interface Props<T extends ResourceItem> {
  config: ResourceConfig<T>
  title: string
}

export function ResourceManager<T extends ResourceItem>({ config, title }: Props<T>) {
  const { api, idField, label } = config
  const canWrite = config.canWrite ?? true

  const [view, setView] = useState<View>('list')
  const [items, setItems] = useState<T[]>([])
  const [selected, setSelected] = useState<T | null>(null)
  const [versions, setVersions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [json, setJson] = useState(config.template)
  const [submitting, setSubmitting] = useState(false)

  const idOf = (item: T): string => String((item as Record<string, unknown>)[idField])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.list({ status: 'active' })
      setItems(isPage(data) ? data.content : data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreate = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const body = JSON.parse(json)
      await api.create(body)
      await load()
      setView('list')
      setJson(config.template)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = async (item: T) => {
    setError(null)
    try {
      const full = await api.get(idOf(item), item.version)
      setSelected(full)
      setView('detail')
    } catch (e) {
      setError(String(e))
    }
  }

  const openVersions = async (item: T) => {
    setError(null)
    try {
      const list = await api.listVersions(idOf(item))
      setVersions(list)
      setSelected(item)
      setView('versions')
    } catch (e) {
      setError(String(e))
    }
  }

  const handleDelete = async (item: T) => {
    if (!confirm(`Desativar a ${label} "${idOf(item)}" versão ${item.version}?`)) return
    setError(null)
    try {
      await api.delete(idOf(item), item.version)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="rm">
      <div className="rm-header">
        <h2>{title}</h2>
        {view === 'list' && canWrite && (
          <button className="rm-btn" onClick={() => { setJson(config.template); setView('create') }}>
            Nova {label}
          </button>
        )}
        {view !== 'list' && (
          <button className="rm-btn rm-btn-secondary" onClick={() => setView('list')}>
            Voltar
          </button>
        )}
      </div>

      {error && <div className="rm-error">{error}</div>}

      {view === 'list' && (
        loading ? (
          <p className="rm-muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="rm-muted">Nenhuma {label} ativa.</p>
        ) : (
          <table className="rm-table">
            <thead>
              <tr><th>ID</th><th>Versão</th><th>Ativo</th><th>Criado em</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${idOf(item)}-${item.version}`}>
                  <td>{idOf(item)}</td>
                  <td>{item.version}</td>
                  <td>{item.active ? 'Sim' : 'Não'}</td>
                  <td>{item.createdAt}</td>
                  <td className="rm-actions">
                    <button className="rm-link" onClick={() => openDetail(item)}>Detalhe</button>
                    <button className="rm-link" onClick={() => openVersions(item)}>Versões</button>
                    {canWrite && (
                      <button className="rm-link rm-danger" onClick={() => handleDelete(item)}>Desativar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {view === 'create' && (
        <div className="rm-form">
          <label>JSON da {label}</label>
          <textarea className="rm-textarea" value={json} onChange={(e) => setJson(e.target.value)} rows={18} />
          <div className="rm-form-actions">
            <button className="rm-btn" disabled={submitting} onClick={handleCreate}>
              {submitting ? 'Enviando…' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {view === 'detail' && selected && (
        <div className="rm-detail">
          <h3>{idOf(selected)} — v{selected.version}</h3>
          <pre className="rm-json">{JSON.stringify(selected, null, 2)}</pre>
        </div>
      )}

      {view === 'versions' && selected && (
        <div className="rm-detail">
          <h3>Versões de {idOf(selected)}</h3>
          <table className="rm-table">
            <thead><tr><th>Versão</th><th>Ativo</th><th>Criado em</th></tr></thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version}>
                  <td>{v.version}</td>
                  <td>{v.active ? 'Sim' : 'Não'}</td>
                  <td>{v.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
