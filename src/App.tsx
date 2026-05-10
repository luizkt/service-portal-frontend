import { useEffect, useState } from 'react'
import { bff } from './api/bff'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ComponentRenderer } from './components/ComponentRenderer/ComponentRenderer'
import type { MenuItem, UiSchema } from './types'
import './App.css'

export default function App() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null)
  const [schema, setSchema] = useState<UiSchema | null>(null)
  const [loadingMenu, setLoadingMenu] = useState(true)

  useEffect(() => {
    bff.menu()
      .then(items => {
        setMenuItems(items)
        setLoadingMenu(false)
      })
      .catch(err => {
        console.error('Erro ao carregar menu', err)
        setLoadingMenu(false)
      })
  }, [])

  const handleMenuSelect = async (item: MenuItem) => {
    setActiveItem(item)
    setSchema(null)
    try {
      const ui = await bff.uiSchema(item.id)
      setSchema(ui)
    } catch (err) {
      console.error('Erro ao carregar UI schema', err)
    }
  }

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="app-logo">
          <span className="app-logo-icon">&#9670;</span>
          <span>Service Portal</span>
        </div>
        {loadingMenu ? (
          <div className="sidebar-loading">Carregando...</div>
        ) : (
          <Sidebar
            items={menuItems}
            activeId={activeItem?.id ?? null}
            onSelect={handleMenuSelect}
          />
        )}
      </aside>
      <main className="app-content">
        <ComponentRenderer schema={schema} />
      </main>
    </div>
  )
}
