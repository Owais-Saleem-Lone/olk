import { requireAdmin } from '@/lib/admin'
import AdminNav from './admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin('viewer')

  return (
    <div className="min-h-[80vh]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Signed in as <span className="text-slate-400">{admin.display_name || admin.email}</span>
          {' '}<span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full">{admin.admin_role.replace('_', ' ')}</span>
        </p>
      </div>
      <AdminNav role={admin.admin_role} />
      <div className="mt-6">{children}</div>
    </div>
  )
}
