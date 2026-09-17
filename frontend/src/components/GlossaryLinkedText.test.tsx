import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import GlossaryLinkedText, { highlightGlossaryTerms } from './GlossaryLinkedText'

function renderText(text: string, className?: string) {
  return className === undefined
    ? render(<GlossaryLinkedText text={text} />)
    : render(<GlossaryLinkedText text={text} className={className} />)
}

function linkedTerms(): string[] {
  return screen
    .queryAllByRole('button')
    .map((button) => button.textContent)
    .filter((label): label is string => label !== null)
}

describe('GlossaryLinkedText segmentation', () => {
  it('renders plain text without glossary terms as a single unlinked string', () => {
    renderText('nothing special here')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(document.querySelector('span')?.textContent).toBe('nothing special here')
  })

  it('links a glossary term as a button carrying the matched text', () => {
    renderText('a Candidate is a pencil mark')
    expect(linkedTerms()).toEqual(['Candidate'])
  })

  it('matches terms case-insensitively while preserving the matched casing', () => {
    renderText('every candidate needs checking')
    expect(linkedTerms()).toEqual(['candidate'])
  })

  it('links the longest term when one term is a prefix of another', () => {
    renderText('BUG+1 avoids the BUG state')
    expect(linkedTerms()).toEqual(['BUG+1', 'BUG'])
  })

  it('matches a term containing a regex metacharacter literally', () => {
    renderText('the + character alone is plain, but BUG+1 is linked')
    expect(linkedTerms()).toEqual(['BUG+1'])
  })

  it('links a term at the very start of the text', () => {
    renderText('Chain reactions start here')
    expect(linkedTerms()).toEqual(['Chain'])
  })

  it('links each of several distinct terms in one text', () => {
    renderText('a Chain, a Loop, and a House')
    expect(linkedTerms()).toEqual(['Chain', 'Loop', 'House'])
  })

  it('does not link a term embedded inside a longer word', () => {
    renderText('Chains are plurals')
    expect(linkedTerms()).toEqual([])
    expect(document.querySelector('span')?.textContent).toBe('Chains are plurals')
  })

  it('applies the given className to the wrapper span', () => {
    renderText('a Candidate', 'gloss-body')
    expect(document.querySelector('span.gloss-body')).not.toBeNull()
  })
})

describe('GlossaryLinkedText tooltip', () => {
  it('opens a tooltip with the term, definition, and example on click', () => {
    renderText('a Candidate is a pencil mark')
    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(screen.getByRole('heading', { name: 'Candidate' })).toBeInTheDocument()
    expect(screen.getByText(/could potentially go in a cell/)).toBeInTheDocument()
    expect(screen.getByText(/Example: If a cell shows candidates 3, 5, 7/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close tooltip' })).toBeInTheDocument()
  })

  it('omits the example line for terms without an example', () => {
    renderText('a Chain of cells')
    fireEvent.click(screen.getByRole('button', { name: 'Chain' }))
    expect(screen.getByRole('heading', { name: 'Chain' })).toBeInTheDocument()
    expect(screen.queryByText(/^Example:/)).not.toBeInTheDocument()
  })

  it('closes the tooltip when the term is clicked again', () => {
    renderText('a Candidate is a pencil mark')
    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(screen.getByRole('heading', { name: 'Candidate' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(screen.queryByRole('heading', { name: 'Candidate' })).not.toBeInTheDocument()
  })

  it('closes the tooltip when clicking outside it', () => {
    renderText('a Candidate is a pencil mark')
    fireEvent.click(screen.getByRole('button', { name: 'Candidate' }))
    expect(screen.getByRole('heading', { name: 'Candidate' })).toBeInTheDocument()
    fireEvent.click(document.body)
    expect(screen.queryByRole('heading', { name: 'Candidate' })).not.toBeInTheDocument()
  })

  it('shows only the most recently clicked term tooltip', () => {
    renderText('a Chain, a Loop, and a House')
    fireEvent.click(screen.getByRole('button', { name: 'Chain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loop' }))
    expect(screen.getByRole('heading', { name: 'Loop' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chain' })).not.toBeInTheDocument()
  })
})

describe('highlightGlossaryTerms', () => {
  it('wraps glossary terms in accent spans titled with the definition', () => {
    const { container } = render(
      <div>{highlightGlossaryTerms('a Candidate is a pencil mark')}</div>,
    )
    const span = container.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('Candidate')
    expect(span?.className).toBe('font-medium text-accent')
    expect(span?.getAttribute('title')).toMatch(/could potentially go in a cell/)
    expect(container.textContent).toBe('a Candidate is a pencil mark')
  })

  it('leaves text without glossary terms untouched', () => {
    const { container } = render(<div>{highlightGlossaryTerms('nothing special here')}</div>)
    expect(container.querySelector('span')).toBeNull()
    expect(container.textContent).toBe('nothing special here')
  })
})
