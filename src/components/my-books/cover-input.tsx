"use client"

import { useState } from 'react'
import { validateImageUrl } from '@/lib/image-utils'

export default function CoverInput({
  preview,
  onFileChange,
  onUrlChange,
  urlValue,
  onClear,
}: {
  preview: string
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onUrlChange: (v: string) => void
  urlValue: string
  onClear: () => void
}) {
  const [validating, setValidating] = useState(false)
  const [urlError, setUrlError] = useState('')

  const handleUrlBlur = async () => {
    const url = urlValue.trim()
    if (!url) { setUrlError(''); return }
    setValidating(true)
    setUrlError('')
    const valid = await validateImageUrl(url)
    setValidating(false)
    if (!valid) {
      setUrlError('Image could not be loaded. Check the URL.')
      onClear()
    }
  }

  return preview ? (
    <div className="relative inline-block">
      {/* next/image can't handle this: preview is a data: URL (local file), a blob,
          or an arbitrary pasted/ISBN-scan URL with no known host or intrinsic size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Cover preview"
        className="h-32 rounded-xl object-cover border border-white/10"
        onError={onClear} />
      <button type="button" onClick={onClear}
        className="absolute -top-2 -right-2 w-6 h-6 bg-brand-slate-muted hover:bg-red-500 border border-white/10 rounded-full text-white text-xs flex items-center justify-center transition-colors">
        ✕
      </button>
    </div>
  ) : (
    <>
      <label className="flex flex-col items-center gap-2 border-2 border-dashed border-white/10 hover:border-brand-teal/40 rounded-xl p-5 cursor-pointer transition-colors group">
        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-brand-teal transition-colors">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>
        </svg>
        <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Upload a photo</span>
        <span className="text-xs text-slate-600">JPG, PNG, WebP — auto-compressed under 500KB</span>
      </label>
      <div className="flex items-center gap-3 my-3">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-xs text-slate-600">or paste a URL</span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
      <input type="url" value={urlValue}
        onChange={(e) => { onUrlChange(e.target.value); setUrlError('') }}
        onBlur={handleUrlBlur}
        className={`w-full bg-white/5 border rounded-lg px-4 py-2.5 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal ${urlError ? 'border-red-500/50' : 'border-white/10'}`}
        placeholder="https://..." />
      {validating && <p className="text-xs text-slate-500 mt-1">Validating image...</p>}
      {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
    </>
  )
}
