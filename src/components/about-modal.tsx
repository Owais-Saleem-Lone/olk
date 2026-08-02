"use client"

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const TEAM = [
  {
    initials: 'OS',
    name: 'Mr. Owais Saleem',
    role: 'Chair & Founder',
    bio: 'To me, OLK is one piece of a larger conviction: that Kashmir can build an egalitarian society where opportunity crosses mountains and lakes, where cutting-edge technology sits comfortably alongside nature and art, and where a community’s well-being is never measured by GDP alone.',
    website: null as string | null,
  },
  {
    initials: 'MU',
    name: 'Mr. Malik Umair',
    role: 'Co-founder, Head of Operations',
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
        className="text-sm text-slate-400 hover:text-slate-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-black/5"
      >
        About
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#FBF6EC]/97 backdrop-blur-xl">

          {/* Ambient glows — fixed so they stay while scrolling */}
          <div className="pointer-events-none fixed inset-0">
            <div className="absolute top-[5%] left-1/4 w-[500px] h-[500px] bg-teal-300/[0.14] rounded-full blur-[120px]" />
            <div className="absolute top-[45%] right-[8%] w-[400px] h-[400px] bg-amber-300/[0.14] rounded-full blur-[100px]" />
            <div className="absolute bottom-[8%] left-[12%] w-[350px] h-[350px] bg-violet-300/[0.14] rounded-full blur-[90px]" />
          </div>

          {/* Fixed close button */}
          <button
            onClick={() => setOpen(false)}
            className="fixed top-5 right-5 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white hover:bg-slate-50 border border-black/5 shadow-sm text-slate-500 hover:text-slate-900 transition-colors"
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
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center font-bold text-sm text-slate-900 shadow-xl shadow-teal-600/20 mx-auto mb-5">
                OLK
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight text-slate-900">About Us</h1>
              <p className="text-slate-500 text-sm tracking-widest uppercase">Open Library Kashmir</p>
            </div>

            {/* ── I. Vision ── */}
            <section className="mb-24">
              <div className="flex items-center gap-5 mb-10">
                <span className="text-4xl font-thin text-amber-600 select-none leading-none">I</span>
                <div className="flex-1 h-px bg-gradient-to-r from-amber-300 to-transparent" />
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8 tracking-tight">Vision</h2>

              <div className="border-l-2 border-amber-300 pl-6 mb-10">
                <p className="text-lg text-slate-800 font-medium leading-relaxed italic">
                  More than a degree. More than a career. A return to meaning.
                </p>
              </div>

              <div className="space-y-6 text-slate-400 leading-relaxed text-[15px]">
                <p>For millennia, education was the pursuit of light—to understand the self, to wrestle with contradictions, and to shape a better world. Somewhere along the way, we traded that light for a paycheck.</p>
                <p><span className="text-slate-900 font-semibold">Open Library Kashmir (OLK)</span> is a quiet rebellion against the mechanical.</p>
                <p>We believe a physicist should know poetry. We believe a philosopher should marvel at quantum mechanics. And we believe a sincere artist—the one told their craft is &quot;worthless&quot;—is, at least, as valuable as any other white-collar job acquired after degrees.</p>
                <p>Here, the natural sciences sit beside ancient history. Here, cutting-edge technology converses with travelogues and cinema that shakes the soul. We are building a sanctuary for the curious, the creative, and the restless.</p>
                <p>To turn students in the remotest corners into active shapers of society. We don&apos;t just make access to textbooks easy. We hand out the courage to pursue art by creating, literature by writing and translating and publishing, photography and cinema—not just pictures and reels, but documenting stories, lives, and history. The quiet thrill of a life lived with passion.</p>
              </div>
            </section>

            {/* ── II. This Platform ── */}
            <section className="mb-24">
              <div className="flex items-center gap-5 mb-10">
                <span className="text-4xl font-thin text-teal-600 select-none leading-none">II</span>
                <div className="flex-1 h-px bg-gradient-to-r from-teal-300 to-transparent" />
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8 tracking-tight">This Platform</h2>

              <div className="border-l-2 border-teal-300 pl-6 mb-10">
                <p className="text-lg text-slate-800 font-medium leading-relaxed italic">
                  Where books travel, and minds open.
                </p>
              </div>

              <div className="space-y-6 text-slate-400 leading-relaxed text-[15px] mb-10">
                <p>OLK begins not with a building, but with a belief. Our platform is a baby step—small, tender, but alive with possibility.</p>
                <p>Imagine a place where books do not collect dust on forgotten shelves. They travel. A donated novel from the city reaches a seeker in a remote valley. A textbook on philosophy finds a home where it is truly needed. No middlemen. No gatekeepers.</p>
                <p>Just people. And the passion that connects them.</p>
              </div>

              <div className="bg-teal-50 border border-teal-100 rounded-2xl p-7">
                <h3 className="text-sm font-bold text-teal-700 uppercase tracking-widest mb-4">Join the Community</h3>
                <div className="space-y-4 text-[15px] text-slate-400 leading-relaxed">
                  <p>This is a space where we actively support the dreamer who wants to write, the traveler who wants to document, and the student who wants to understand <em>why</em> before they learn <em>how</em>.</p>
                  <p className="text-slate-800 font-medium">OLK is not just a library. It is a living ecosystem of enlightenment.</p>
                </div>
              </div>
            </section>

            {/* ── III. Team ── */}
            <section>
              <div className="flex items-center gap-5 mb-10">
                <span className="text-4xl font-thin text-violet-400 select-none leading-none">III</span>
                <div className="flex-1 h-px bg-gradient-to-r from-violet-300 to-transparent" />
              </div>

              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8 tracking-tight">Team</h2>

              <div className="space-y-4">
                {TEAM.map(member => (
                  <div
                    key={member.name}
                    className="bg-white border border-black/5 hover:border-teal-200 rounded-2xl p-6 transition-colors shadow-sm"
                  >
                    <div className="flex gap-5 items-start">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-200 to-slate-100 border border-black/5 flex items-center justify-center text-slate-400 font-semibold text-sm flex-shrink-0">
                        {member.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 leading-snug">{member.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 mb-4">{member.role}</p>
                        {member.bio
                          ? <p className="text-sm text-slate-400 leading-relaxed">{member.bio}</p>
                          : <p className="text-xs text-slate-600 italic">Biography coming soon.</p>
                        }
                        {member.website && (
                          <a
                            href={member.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-500 mt-4 transition-colors"
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
              <p className="text-slate-600 text-xs">Built with ❤️ for the people of Kashmir</p>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  )
}
