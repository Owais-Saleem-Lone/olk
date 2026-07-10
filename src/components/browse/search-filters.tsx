"use client"

import { useState } from 'react'
import GenreSelect from '@/components/genre-select'

const RADIUS_STEPS: Array<number | null> = [2, 5, 10, null]

export default function SearchFilters({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onClearSearch,
  filterGenre,
  onFilterGenreChange,
  filterType,
  onFilterTypeChange,
  filterCondition,
  onFilterConditionChange,
  filterArea,
  onFilterAreaChange,
  radiusKm,
  onRadiusKmChange,
  hasLocation,
}: {
  searchQuery: string
  onSearchQueryChange: (v: string) => void
  onSearch: (e: React.FormEvent) => void
  onClearSearch: () => void
  filterGenre: string
  onFilterGenreChange: (v: string) => void
  filterType: string
  onFilterTypeChange: (v: string) => void
  filterCondition: string
  onFilterConditionChange: (v: string) => void
  filterArea: string
  onFilterAreaChange: (v: string) => void
  radiusKm: number | null
  onRadiusKmChange: (v: number | null) => void
  hasLocation: boolean
}) {
  const [showFilters, setShowFilters] = useState(false)

  return (
    <form onSubmit={onSearch} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search by title or author..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            className="flex-1 sm:flex-initial bg-brand-teal hover:bg-brand-teal-light text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={onClearSearch}
              className="flex-1 sm:flex-initial bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-3 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter toggle */}
      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className="mt-4 text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        Filters
        {(filterGenre || filterType || filterCondition || filterArea || radiusKm != null) && (
          <span className="bg-brand-teal/20 text-brand-teal-light text-xs font-bold px-1.5 py-0.5 rounded-full">
            {[filterGenre, filterType, filterCondition, filterArea, radiusKm != null ? 'radius' : ''].filter(Boolean).length}
          </span>
        )}
      </button>

      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <GenreSelect
            value={filterGenre}
            onChange={onFilterGenreChange}
            allOptionLabel="All Genres"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />

          <select
            value={filterType}
            onChange={(e) => onFilterTypeChange(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="" className="bg-brand-slate">All Types</option>
            <option value="donate" className="bg-brand-slate">Donate</option>
            <option value="lend" className="bg-brand-slate">Lend</option>
          </select>

          <select
            value={filterCondition}
            onChange={(e) => onFilterConditionChange(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="" className="bg-brand-slate">Any Condition</option>
            <option value="excellent" className="bg-brand-slate">Excellent</option>
            <option value="good" className="bg-brand-slate">Good</option>
            <option value="fair" className="bg-brand-slate">Fair</option>
            <option value="poor" className="bg-brand-slate">Poor</option>
          </select>

          <input
            type="text"
            value={filterArea}
            onChange={(e) => onFilterAreaChange(e.target.value)}
            placeholder="Filter by area..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />

          {hasLocation && (
            <div className="sm:col-span-2 lg:col-span-4 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">Distance</span>
                <span className="text-sm text-brand-teal-light font-medium">
                  {radiusKm == null ? 'Any distance' : `Within ${radiusKm}km`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={RADIUS_STEPS.indexOf(radiusKm)}
                onChange={(e) => onRadiusKmChange(RADIUS_STEPS[parseInt(e.target.value, 10)])}
                className="w-full accent-brand-teal cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>2km</span>
                <span>5km</span>
                <span>10km</span>
                <span>Any</span>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
