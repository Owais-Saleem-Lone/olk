import { describe, it, expect } from 'vitest'
import { wordCount } from './text-limits'

describe('wordCount', () => {
  it('counts space-separated words', () => {
    expect(wordCount('one two three')).toBe(3)
  })

  it('collapses repeated whitespace', () => {
    expect(wordCount('one   two\n\nthree')).toBe(3)
  })

  it('ignores leading/trailing whitespace', () => {
    expect(wordCount('  one two  ')).toBe(2)
  })

  it('returns 0 for an empty or whitespace-only string', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   ')).toBe(0)
  })

  // book-notes-modal.tsx rejects notes over 100 words using this exact helper;
  // the DB-level trigger (enforce_book_notes_limits migration) mirrors the
  // same threshold independently in SQL.
  it('matches the 100-word limit boundary enforced elsewhere', () => {
    const hundred = Array(100).fill('word').join(' ')
    const hundredOne = Array(101).fill('word').join(' ')
    expect(wordCount(hundred)).toBe(100)
    expect(wordCount(hundredOne)).toBe(101)
  })
})
