import Link from 'next/link'
import Image from 'next/image'

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <Image src="/olk-logo.svg" alt="OLK logo" width={56} height={56} unoptimized className="rounded-full mx-auto mb-6" />
        <h1 className="text-2xl font-semibold mb-3">Down for maintenance</h1>
        <p className="text-slate-400 mb-6">
          Open Library Kashmir is briefly offline for maintenance. Please check back shortly.
        </p>
        <Link href="/login" className="text-sm text-brand-teal-light hover:text-teal-300">Admin login →</Link>
      </div>
    </div>
  )
}
