import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center font-bold text-sm">
            OLK
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Open Library Kashmir
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-slate-300 hover:text-white transition-colors px-4 py-2"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="text-sm font-medium bg-teal-500 hover:bg-teal-400 text-white px-5 py-2 rounded-lg transition-colors"
          >
            Join Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-full px-4 py-1.5 mb-8">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-teal-300 text-sm font-medium">
            Free • Open Source • Privacy-First
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Share a book.
          <br />
          <span className="text-teal-400">Change a life.</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          OLK connects readers across Kashmir. Donate or lend your used books, 
          find your next read from someone nearby — all with maximum privacy 
          and zero cost.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link
            href="/register"
            className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors"
          >
            Start Sharing Books →
          </Link>
          <Link
            href="/browse"
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-8 py-3.5 rounded-xl text-base transition-colors"
          >
            Browse Books
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 text-left">
          {[
            {
              icon: '📖',
              title: 'Donate or Lend',
              desc: 'List books you no longer need. Choose to donate permanently or lend for a period.',
            },
            {
              icon: '📍',
              title: 'Find Nearby',
              desc: 'Books from readers closest to you appear first. No shipping — just meet and exchange.',
            },
            {
              icon: '🔒',
              title: 'Maximum Privacy',
              desc: 'End-to-end encrypted chats. Your exact location is never shared. Your data is yours.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-teal-500/30 transition-colors"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 text-center text-sm text-slate-600">
        Open Library Kashmir — Built with ❤️ for the people of Kashmir
      </footer>
    </div>
  )
}