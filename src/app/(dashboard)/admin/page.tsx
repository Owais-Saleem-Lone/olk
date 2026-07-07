'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type DailyStat = { day: string; new_users: number; new_books: number; new_requests: number; completed_exchanges: number }
type AreaStat = { area_name: string; user_count: number; book_count: number }
type TopContrib = { user_id: string; display_name: string; area_name: string; books_listed: number; books_donated: number; books_lent: number; avg_rating: number }
type ExchangeStats = { total_requests: number; pending_count: number; accepted_count: number; declined_count: number; handed_over_count: number; returned_count: number; success_rate: number }
type RatingDist = { score: number; count: number }

function MiniBar({ data, dataKey, color }: { data: DailyStat[]; dataKey: keyof DailyStat; color: string }) {
  const values = data.map(d => Number(d[dataKey]))
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-px h-16">
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t-sm min-w-[2px] ${color}`}
          style={{ height: `${(v / max) * 100}%`, opacity: Math.max(0.3, v / max) }}
          title={`${data[i].day}: ${v}`}
        />
      ))}
    </div>
  )
}

export default function AdminOverview() {
  const supabase = createClient()
  const [stats, setStats] = useState({ users: 0, books: 0, requests: 0, reports: 0, clubs: 0 })
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [areas, setAreas] = useState<AreaStat[]>([])
  const [topContribs, setTopContribs] = useState<TopContrib[]>([])
  const [exchangeStats, setExchangeStats] = useState<ExchangeStats | null>(null)
  const [ratingDist, setRatingDist] = useState<RatingDist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { count: uc }, { count: bc }, { count: rc }, { count: rpc }, { count: cc },
        { data: dailyData },
        { data: areaData },
        { data: contribData },
        { data: exchData },
        { data: ratingData },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('books').select('*', { count: 'exact', head: true }),
        supabase.from('book_requests').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('clubs').select('*', { count: 'exact', head: true }),
        supabase.rpc('admin_get_daily_stats', { days_back: 30 }),
        supabase.rpc('admin_get_area_stats'),
        supabase.rpc('admin_get_top_contributors', { lim: 5 }),
        supabase.rpc('admin_get_exchange_stats'),
        supabase.rpc('admin_get_rating_distribution'),
      ])
      setStats({ users: uc || 0, books: bc || 0, requests: rc || 0, reports: rpc || 0, clubs: cc || 0 })
      if (dailyData) setDaily(dailyData)
      if (areaData) setAreas(areaData)
      if (contribData) setTopContribs(contribData)
      if (exchData && exchData.length > 0) setExchangeStats(exchData[0])
      if (ratingData) setRatingDist(ratingData)
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) return <div className="text-slate-400 py-12 text-center">Loading dashboard...</div>

  const ratingMax = Math.max(...ratingDist.map(r => Number(r.count)), 1)

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Users', value: stats.users, icon: '👥', color: 'text-blue-400' },
          { label: 'Books', value: stats.books, icon: '📚', color: 'text-brand-teal-light' },
          { label: 'Requests', value: stats.requests, icon: '📩', color: 'text-purple-400' },
          { label: 'Reports', value: stats.reports, icon: '🚩', color: 'text-red-400' },
          { label: 'Clubs', value: stats.clubs, icon: '🏘️', color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className="text-lg mb-1">{s.icon}</div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Growth Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: 'New Users (30d)', key: 'new_users' as keyof DailyStat, color: 'bg-blue-400' },
          { title: 'New Books (30d)', key: 'new_books' as keyof DailyStat, color: 'bg-brand-teal-light' },
          { title: 'Requests (30d)', key: 'new_requests' as keyof DailyStat, color: 'bg-purple-400' },
          { title: 'Completed Exchanges (30d)', key: 'completed_exchanges' as keyof DailyStat, color: 'bg-green-400' },
        ].map(chart => {
          const total = daily.reduce((sum, d) => sum + Number(d[chart.key]), 0)
          return (
            <div key={chart.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-medium text-slate-300">{chart.title}</p>
                <span className="text-xs text-slate-500">Total: {total}</span>
              </div>
              <MiniBar data={daily} dataKey={chart.key} color={chart.color} />
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Exchange Stats */}
        {exchangeStats && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <p className="text-sm font-medium text-slate-300 mb-4">Exchange Health</p>
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-brand-teal-light">{exchangeStats.success_rate}%</p>
              <p className="text-xs text-slate-500">Success Rate</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                { label: 'Pending', v: exchangeStats.pending_count, c: 'text-amber-400' },
                { label: 'Accepted', v: exchangeStats.accepted_count, c: 'text-blue-400' },
                { label: 'Handed Over', v: exchangeStats.handed_over_count, c: 'text-purple-400' },
                { label: 'Returned', v: exchangeStats.returned_count, c: 'text-green-400' },
                { label: 'Declined', v: exchangeStats.declined_count, c: 'text-red-400' },
                { label: 'Total', v: exchangeStats.total_requests, c: 'text-white' },
              ].map(s => (
                <div key={s.label} className="py-1">
                  <p className={`text-lg font-semibold ${s.c}`}>{s.v}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rating Distribution */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <p className="text-sm font-medium text-slate-300 mb-4">Rating Distribution</p>
          <div className="space-y-2">
            {ratingDist.map(r => (
              <div key={r.score} className="flex items-center gap-2">
                <span className="text-sm text-slate-400 w-8">{r.score} ★</span>
                <div className="flex-1 bg-white/5 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-amber-400/60 rounded-full transition-all"
                    style={{ width: `${(Number(r.count) / ratingMax) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-8 text-right">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Areas */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <p className="text-sm font-medium text-slate-300 mb-4">Top Areas</p>
          {areas.length === 0 ? (
            <p className="text-sm text-slate-500">No area data yet</p>
          ) : (
            <div className="space-y-2">
              {areas.slice(0, 8).map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-sm text-slate-300 truncate">{a.area_name}</span>
                  <div className="flex gap-3 text-xs text-slate-500">
                    <span>{a.user_count} users</span>
                    <span>{a.book_count} books</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Contributors */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <p className="text-sm font-medium text-slate-300 mb-4">Top Contributors</p>
        {topContribs.length === 0 ? (
          <p className="text-sm text-slate-500">No contributors yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-white/5">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Area</th>
                  <th className="pb-2 font-medium text-center">Listed</th>
                  <th className="pb-2 font-medium text-center">Donated</th>
                  <th className="pb-2 font-medium text-center">Lent</th>
                  <th className="pb-2 font-medium text-center">Rating</th>
                </tr>
              </thead>
              <tbody>
                {topContribs.map((c, i) => (
                  <tr key={c.user_id} className="border-b border-white/[0.03]">
                    <td className="py-2 text-white">
                      <span className="text-slate-500 mr-2">#{i + 1}</span>
                      {c.display_name || 'Unknown'}
                    </td>
                    <td className="py-2 text-slate-400">{c.area_name || '—'}</td>
                    <td className="py-2 text-center text-brand-teal-light">{c.books_listed}</td>
                    <td className="py-2 text-center text-green-400">{c.books_donated}</td>
                    <td className="py-2 text-center text-blue-400">{c.books_lent}</td>
                    <td className="py-2 text-center text-amber-400">{c.avg_rating > 0 ? `${c.avg_rating} ★` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
