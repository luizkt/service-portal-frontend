import { useEffect, useState } from 'react'
import { bff } from './api/bff'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ComponentRenderer } from './components/ComponentRenderer/ComponentRenderer'
import { LoginPage } from './components/Login/LoginPage'
import type { MenuItem, UiSchema } from './types'
import { useAuth } from './auth/AuthProvider'
import './App.css'

const GROUP_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  WORKFLOWS: 'Operação de Fluxos',
  RULES: 'Regras de Negócio',
}

export default function App() {
  const auth = useAuth()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null)
  const [schema, setSchema] = useState<UiSchema | null>(null)
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    bff.menu()
      .then(items => {
        setMenuItems(items)
        setLoadingMenu(false)
      })
      .catch(err => {
        console.error('Erro ao carregar menu', err)
        setLoadingMenu(false)
      })
  }, [auth.status])

  if (auth.status === 'loading') {
    return <div className="app-gate">Carregando...</div>
  }

  if (auth.status === 'unauthenticated' || auth.status === 'error') {
    return <LoginPage />
  }

  const handleMenuSelect = async (item: MenuItem) => {
    setActiveItem(item)
    setSchema(null)
    setSchemaError(null)
    try {
      const ui = await bff.uiSchema(item.id)
      setSchema(ui)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSchemaError(
        msg.includes('403')
          ? 'Você não tem permissão para acessar este módulo.'
          : 'Erro ao carregar módulo. Tente novamente.'
      )
      console.error('Erro ao carregar UI schema', err)
    }
  }

  const primaryGroup = auth.groups[0]
  const groupLabel = primaryGroup ? (GROUP_LABELS[primaryGroup] ?? primaryGroup) : null

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="app-logo">
          <span className="app-logo-icon">&#9670;</span>
          <span>Service Portal</span>
        </div>
        <div className="app-sidebar-body">
          {loadingMenu ? (
            <div className="sidebar-loading">Carregando...</div>
          ) : (
            <Sidebar
              items={menuItems}
              activeId={activeItem?.id ?? null}
              onSelect={handleMenuSelect}
            />
          )}
        </div>
        <div className="app-user-info">
          {auth.displayName && (
            <span className="app-user-name">{auth.displayName}</span>
          )}
          {primaryGroup ? (
            <span className={`app-group-badge app-group-badge--${primaryGroup.toLowerCase()}`}>
              {primaryGroup}
            </span>
          ) : (
            <span className="app-group-badge app-group-badge--none">Sem grupo</span>
          )}
        </div>
        <button className="app-logout" onClick={auth.logout}>Sair</button>
      </aside>
      <main className="app-content">
        {schemaError ? (
          <div className="app-access-denied">
            <div className="app-access-denied-icon">&#8960;</div>
            <p>{schemaError}</p>
          </div>
        ) : !activeItem ? (
          <div className="app-welcome">
            <h2>Bem-vindo{auth.displayName ? `, ${auth.displayName}` : ''}</h2>
            {groupLabel && (
              <p>Perfil de acesso: <strong>{groupLabel}</strong></p>
            )}
            {!primaryGroup && (
              <p className="app-welcome-no-access">
                Sua conta não possui módulos liberados. Contate o administrador.
              </p>
            )}
            <p className="app-welcome-hint">Selecione um módulo no menu lateral para começar.</p>
          </div>
        ) : !schema ? (
          <div className="app-gate">Carregando...</div>
        ) : (
          <ComponentRenderer schema={schema} />
        )}
      </main>
    </div>
  )
}
