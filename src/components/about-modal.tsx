"use client"

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const TEAM = [
  {
    initials: 'OS',
    name: 'Mr. Owais Saleem',
    role: 'Chair & Founder',
    bio: null as string | null,
    website: null as string | null,
  },
  {
    initials: 'MU',
    name: 'Mr. Malik Umair',
    role: 'Head of Operations, Co-founder',
    bio: null as string | null,
    website: null as string | null,
  },
]

export default function AboutModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) {
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
      >
        About
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#020817]/96 backdrop-blur-xl">

          {/* Ambient glows — fixed so they stay while scrolling */}
          <div className="pointer-events-none fixed inset-0">
            <div className="absolute top-[5%] left-1/4 w-[500px] h-[500px] bg-teal-600/[0.06] rounded-full blur-[120px]" />
            <div className="absolute top-[45%] right-[8%] w-[400px] h-[400px] bg-amber-500/[0.04] rounded-full blur-[100px]" />
            <div className="absolute bottom-[8%] left-[12%] w-[350px] h-[350px] bg-violet-600/[0.04] rounded-full blur-[90px]" />
          </div>

          {/* Fixed close button */}
          <button
            onClick={() => setOpen(false)}
            className="fixed top-5 right-5 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/10 border border-white/10 text-slate-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>

          {/* Scrollable content */}
          <div className="relative max-w-2xl mx-auto px-6 py-20">

            {/* ── Header ── */}
            <div className="text-center mb-20">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center font-bold text-sm shadow-xl shadow-teal-500/30 mx-auto mb-5">
                OLK
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">About Us</h1>
              <p className="text-slate-600 text-sm tracking-widest uppercase">Open Library Kashmir</p>
            </div>

            {/* ── I. Vision ── */}
            <section className="mb-24">
              <div className="flex items-center gap-5 mb-10">
                <span className="text-4xl font-thin text-amber-500/25 select-none leading-none">I</span>
                <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 to-transparent" />
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 tracking-tight">Vision</h2>

              <div className="border-l-2 border-amber-400/40 pl-6 mb-10">
                <p className="text-lg text-white/90 font-medium leading-relaxed italic">
                  More than a degree. More than a career. A return to meaning.
                </p>
              </div>

              <div className="space-y-6 text-slate-300/80 leading-relaxed text-[15px]">
                <p>For millennia, education was the pursuit of light—to understand the self, to wrestle with contradictions, and to shape a better world. Somewhere along the way, we traded that light for a paycheck.</p>
                <p><span className="text-white font-semibold">Open Library Kashmir (OLK)</span> is a quiet rebellion against the mechanical.</p>
                <p>We believe a physicist should know poetry. We believe a philosopher should marvel at quantum mechanics. And we believe a sincere artist—the one told their craft is "worthless"—is, at least, as valuable as any other white-collar job acquired after degrees.</p>
                <p>Here, the natural sciences sit beside ancient history. Here, cutting-edge technology converses with travelogues and cinema that shakes the soul. We are building a sanctuary for the curious, the creative, and the restless.</p>
                <p>To turn students in the remotest corners into active shapers of society. We don&apos;t just make access to textbooks easy. We hand out the courage to pursue art by creating, literature by writing and translating and publishing, photography and cinema—not just pictures and reels, but documenting stories, lives, and history. The quiet thrill of a life lived with passion.</p>
              </div>
            </section>

            {/* ── II. This Platform ── */}
            <section className="mb-24">
              <div className="flex items-center gap-5 mb-10">
                <span className="text-4xl font-thin text-teal-500/25 select-none leading-none">II</span>
                <div className="flex-1 h-px bg-gradient-to-r from-teal-500/20 to-transparent" />
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 tracking-tight">This Platform</h2>

              <div className="border-l-2 border-teal-400/40 pl-6 mb-10">
                <p className="text-lg text-white/90 font-medium leading-relaxed italic">
                  Where books travel, and minds open.
                </p>
              </div>

              <div className="space-y-6 text-slate-300/80 leading-relaxed text-[15px] mb-10">
                <p>OLK begins not with a building, but with a belief. Our platform is a baby step—small, tender, but alive with possibility.</p>
                <p>Imagine a place where books do not collect dust on forgotten shelves. They travel. A donated novel from the city reaches a seeker in a remote valley. A textbook on philosophy finds a home where it is truly needed. No middlemen. No gatekeepers.</p>
                <p>Just people. And the passion that connects them.</p>
              </div>

              <div className="bg-teal-500/[0.04] border border-teal-500/[0.12] rounded-2xl p-7">
                <h3 className="text-sm font-bold text-teal-400 uppercase tracking-widest mb-4">Join the Community</h3>
                <div className="space-y-4 text-[15px] text-slate-400 leading-relaxed">
                  <p>This is a space where we actively support the dreamer who wants to write, the traveler who wants to document, and the student who wants to understand <em>why</em> before they learn <em>how</em>.</p>
                  <p className="text-slate-200 font-medium">OLK is not just a library. It is a living ecosystem of enlightenment.</p>
                </div>
              </div>
            </section>

            {/* ── III. Team ── */}
            <section>
              <div className="flex items-center gap-5 mb-10">
                <span className="text-4xl font-thin text-violet-400/25 select-none leading-none">III</span>
                <div className="flex-1 h-px bg-gradient-to-r from-violet-500/20 to-transparent" />
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-white mb-8 tracking-tight">Team</h2>

              <div className="space-y-4">
                {TEAM.map(member => (
                  <div
                    key={member.name}
                    className="bg-white/[0.02] border border-white/[0.06] hover:border-white/10 rounded-2xl p-6 transition-colors"
                  >
                    <div className="flex gap-5 items-start">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center text-white/70 font-semibold text-sm flex-shrink-0">
                        {member.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white leading-snug">{member.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 mb-4">{member.role}</p>
                        {member.bio
                          ? <p className="text-sm text-slate-400 leading-relaxed">{member.bio}</p>
                          : <p className="text-xs text-slate-700 italic">Biography coming soon.</p>
                        }
                        {member.website && (
                          <a
                            href={member.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-teal-500 hover:text-teal-400 mt-4 transition-colors"
                          >
                            Visit website
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Footer ── */}
            <div className="text-center mt-24 pb-4">
              <p className="text-slate-800 text-xs">Built with ❤️ for the people of Kashmir</p>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  )
}
