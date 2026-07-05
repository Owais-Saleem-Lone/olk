"use client"

import { useState, useRef } from 'react'

type BookData = {
  title: string
  author: string
  coverUrl: string | null
  genre: string | null
  publicationYear: number | null
  description: string | null
}

// BarcodeDetector is a real, shipping browser API (Chrome/Edge/Android
// WebView) but isn't part of TypeScript's default DOM lib types yet.
interface BarcodeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
declare const BarcodeDetector: {
  new (options: { formats: string[] }): BarcodeDetector
}

// Keyword -> app genre taxonomy. Open Library subjects are noisy folksonomy
// tags (a historical-romance novel can carry a bare "History" tag alongside
// dozens of fiction/literature tags), so a single substring hit isn't
// trustworthy. Instead we score every category by how many distinct subject
// strings match its keywords and take the winner, requiring both a minimum
// count and a clear lead over the runner-up — otherwise we leave genre unset
// rather than guess wrong.
const GENRE_KEYWORDS: Array<[string, string[]]> = [
  ['Physics', ['physics']],
  ['Chemistry', ['chemistry']],
  ['Biology', ['biology', 'botany', 'zoology']],
  ['Mathematics', ['mathematics', 'algebra', 'calculus', 'geometry', 'trigonometry']],
  ['Civil Engineering', ['civil engineering']],
  ['Mechanical Engineering', ['mechanical engineering']],
  ['Electrical Engineering', ['electrical engineering', 'electronics']],
  ['IT/Computer Science', ['computer science', 'programming', 'software', 'computing', 'algorithms']],
  ['Anatomy', ['anatomy']],
  ['Physiology', ['physiology']],
  ['Clinical Medicine', ['medicine', 'medical', 'clinical']],
  ['Psychology', ['psychology']],
  ['Philosophy', ['philosophy']],
  ['Geography', ['geography']],
  ['Civics', ['civics', 'political science', 'government']],
  ['History', ['history']],
  ['Urdu Literature', ['urdu']],
  ['Hindi Literature', ['hindi']],
  ['Persian Literature', ['persian', 'farsi']],
  ['Arabic Literature', ['arabic']],
  ['Kashmiri Literature', ['kashmiri']],
  ['English Literature', ['fiction', 'literature', 'novel', 'poetry', 'drama']],
]

function guessGenre(subjects: string[]): string | null {
  const scores = GENRE_KEYWORDS.map(([genre, keywords]) => ({
    genre,
    count: subjects.filter(s => {
      const lower = s.toLowerCase()
      return keywords.some(kw => lower.includes(kw))
    }).length,
  })).sort((a, b) => b.count - a.count)

  const [top, runnerUp] = scores
  if (!top || top.count < 2 || top.count <= (runnerUp?.count ?? 0)) return null
  return top.genre
}

function extractYear(publishDate: string | undefined): number | null {
  const match = publishDate?.match(/\d{4}/)
  return match ? parseInt(match[0], 10) : null
}

function extractDescription(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const value = (raw as { value?: unknown }).value
    return typeof value === 'string' ? value : null
  }
  return null
}

async function fetchDescription(editionKey: string | undefined): Promise<string | null> {
  if (!editionKey) return null
  try {
    const res = await fetch(`https://openlibrary.org${editionKey}.json`)
    if (!res.ok) return null
    const edition = await res.json()

    const editionDescription = extractDescription(edition.description)
    if (editionDescription) return editionDescription

    const workKey = edition.works?.[0]?.key
    if (!workKey) return null
    const workRes = await fetch(`https://openlibrary.org${workKey}.json`)
    if (!workRes.ok) return null
    const work = await workRes.json()
    return extractDescription(work.description)
  } catch {
    return null
  }
}

async function lookupISBN(isbn: string): Promise<BookData | null> {
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)
  if (!res.ok) return null
  const data = await res.json()
  const book = data[`ISBN:${isbn}`]
  if (!book) return null

  const subjects: string[] = (book.subjects || []).map((s: { name?: string }) => s.name).filter(Boolean)

  return {
    title: book.title || '',
    author: book.authors?.[0]?.name || '',
    coverUrl: book.cover?.medium || book.cover?.large || null,
    genre: guessGenre(subjects),
    publicationYear: extractYear(book.publish_date),
    description: await fetchDescription(book.key),
  }
}

export default function ISBNScanner({ onResult, onClose }: {
  onResult: (data: BookData) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'choose' | 'camera' | 'manual'>('choose')
  const [manualISBN, setManualISBN] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const startCamera = async () => {
    setMode('camera')
    setError('')

    if (!('BarcodeDetector' in window)) {
      setError('Barcode scanning not supported in this browser. Try entering the ISBN manually.')
      setMode('manual')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8'] })

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return
        try {
          const barcodes = await detector.detect(videoRef.current)
          if (barcodes.length > 0) {
            const isbn = barcodes[0].rawValue
            stopCamera()
            await handleLookup(isbn)
            return
          }
        } catch {}
        if (streamRef.current) requestAnimationFrame(scan)
      }

      requestAnimationFrame(scan)
    } catch {
      setError('Camera access denied. Try entering the ISBN manually.')
      setMode('manual')
    }
  }

  const handleLookup = async (isbn: string) => {
    setLoading(true)
    setError('')
    const data = await lookupISBN(isbn.replace(/[-\s]/g, ''))
    setLoading(false)

    if (data) {
      onResult(data)
    } else {
      setError(`No book found for ISBN: ${isbn}. Try a different ISBN or add manually.`)
      setMode('manual')
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualISBN.trim()) handleLookup(manualISBN.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => { stopCamera(); onClose() }}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Scan ISBN</h3>
        <p className="text-sm text-slate-400 mb-5">Auto-fill book details from barcode</p>

        {loading && (
          <div className="text-center py-8">
            <svg className="animate-spin h-6 w-6 text-teal-400 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            <p className="text-sm text-slate-400">Looking up book...</p>
          </div>
        )}

        {!loading && mode === 'choose' && (
          <div className="space-y-3">
            <button onClick={startCamera} className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
              Scan with Camera
            </button>
            <button onClick={() => setMode('manual')} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-3 rounded-lg transition-colors text-sm">
              Type ISBN Manually
            </button>
          </div>
        )}

        {!loading && mode === 'camera' && (
          <div>
            <div className="rounded-xl overflow-hidden bg-black mb-3 aspect-[4/3]">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            </div>
            <p className="text-xs text-slate-500 text-center mb-3">Point camera at the barcode on the back of the book</p>
            <button onClick={() => { stopCamera(); setMode('manual') }} className="w-full text-sm text-slate-400 hover:text-white py-2 transition-colors">
              Type ISBN instead
            </button>
          </div>
        )}

        {!loading && mode === 'manual' && (
          <form onSubmit={handleManualSubmit}>
            <input
              type="text"
              value={manualISBN}
              onChange={e => setManualISBN(e.target.value)}
              placeholder="Enter ISBN (e.g., 9780141439518)"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm mb-3"
              autoFocus
            />
            <button type="submit" disabled={!manualISBN.trim()} className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
              Look Up
            </button>
          </form>
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <button onClick={() => { stopCamera(); onClose() }} className="w-full mt-3 text-sm text-slate-500 hover:text-white py-2 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
