import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import type { MenuItem } from '../../../types'

const items: MenuItem[] = [
  { id: 'flows', label: 'Fluxos', icon: 'f', uiSchemaUrl: '/a' },
  { id: 'contracts', label: 'Contratos', icon: 'c', uiSchemaUrl: '/b' },
]

describe('Sidebar', () => {
  it('lista vazia mostra mensagem e nenhum nav', () => {
    render(<Sidebar items={[]} activeId={null} onSelect={() => {}} />)
    expect(screen.getByText('Nenhuma funcionalidade disponível.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('renderiza nav com aria-label e só o item ativo tem aria-current="page"', () => {
    render(<Sidebar items={items} activeId="contracts" onSelect={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Contratos/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Fluxos/ })).not.toHaveAttribute('aria-current')
  })

  it('sem item ativo nenhum botão tem aria-current', () => {
    render(<Sidebar items={items} activeId={null} onSelect={() => {}} />)
    screen.getAllByRole('button').forEach(b => expect(b).not.toHaveAttribute('aria-current'))
  })

  it('clique chama onSelect com o item inteiro', () => {
    const onSelect = vi.fn()
    render(<Sidebar items={items} activeId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Fluxos/ }))
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })
})
