import { describe, it, expect } from 'vitest'
import { escapeHtml } from './html-escape'

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`))
      .toBe('&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;')
  })

  it('leaves plain text untouched', () => {
    expect(escapeHtml('A Tale of Two Cities')).toBe('A Tale of Two Cities')
  })

  it('handles an empty string', () => {
    expect(escapeHtml('')).toBe('')
  })
})
