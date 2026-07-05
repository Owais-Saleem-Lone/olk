import Link from 'next/link'

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center font-bold text-lg mx-auto mb-6">OLK</div>
        <h1 className="text-2xl font-semibold mb-3">Down for maintenance</h1>
        <p className="text-slate-400 mb-6">
          Open Library Kashmir is briefly offline for maintenance. Please check back shortly.
        </p>
        <Link href="/login" className="text-sm text-teal-400 hover:text-teal-300">Admin login →</Link>
      </div>
    </div>
  )
}
