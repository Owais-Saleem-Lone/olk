import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-white text-center px-4">
      <div className="text-6xl mb-2">📖</div>
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="text-slate-400 max-w-md">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have been moved.
      </p>
      <Link
        href="/"
        className="text-sm font-semibold bg-brand-teal hover:bg-brand-teal-light text-white px-4 py-2 rounded-lg transition-all"
      >
        Return Home
      </Link>
    </div>
  )
}
