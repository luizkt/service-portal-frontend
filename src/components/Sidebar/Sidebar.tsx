import type { MenuItem } from '../../types'
import './Sidebar.css'

interface Props {
  items: MenuItem[]
  activeId: string | null
  onSelect: (item: MenuItem) => void
}

export function Sidebar({ items, activeId, onSelect }: Props) {
  if (items.length === 0) {
    return <div className="sidebar-empty">Nenhuma funcionalidade disponível.</div>
  }

  return (
    <nav className="sidebar-nav">
      {items.map(item => (
        <button
          key={item.id}
          className={`sidebar-item${activeId === item.id ? ' sidebar-item--active' : ''}`}
          onClick={() => onSelect(item)}
        >
          <span className="sidebar-item-icon">&#9670;</span>
          <span className="sidebar-item-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
