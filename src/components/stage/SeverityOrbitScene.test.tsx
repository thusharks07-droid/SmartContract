// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Severity } from '../../types/domain'
import { SeverityOrbitScene } from './SeverityOrbitScene'

vi.mock('@react-three/fiber', () => ({ Canvas: () => null }))

const counts: Record<Severity, number> = {
  critical: 1,
  high: 1,
  medium: 1,
  low: 2,
  informational: 1,
}

const summaries: Record<Severity, string> = {
  critical: 'Critical: 1 — Reentrancy in Vault.sol:42',
  high: 'High: 1 — Access control in Treasury.sol:19',
  medium: 'Medium: 1 — External call in Vault.sol:68',
  low: 'Low: 2 — State transition in Token.sol:25',
  informational: 'Informational: 1 — Example in Token.sol:7',
}

function Harness() {
  const [selected, setSelected] = useState<Severity | null>(null)
  const [hovered, setHovered] = useState<Severity | null>(null)
  return (
    <>
      <output>{hovered}</output>
      <SeverityOrbitScene
        counts={counts}
        summaries={summaries}
        selected={selected}
        onSelect={setSelected}
        onHover={setHovered}
      />
    </>
  )
}

describe('SeverityOrbitScene HTML controls', () => {
  it('provides keyboard-operable severity summaries and shared selection state', () => {
    render(<Harness />)

    const highButton = screen.getByRole('button', { name: 'high 1' })
    fireEvent.focus(highButton)
    expect(screen.getByText(summaries.high)).toBeTruthy()
    expect(screen.getByText('high', { selector: 'output' })).toBeTruthy()

    fireEvent.click(highButton)
    expect(highButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(summaries.high)).toBeTruthy()
  })
})
