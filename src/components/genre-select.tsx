const GENRE_GROUPS: { label: string; options: string[] }[] = [
  { label: 'Natural Sciences', options: ['Physics', 'Chemistry', 'Biology', 'Mathematics'] },
  { label: 'Engineering', options: ['Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering', 'IT/Computer Science'] },
  { label: 'Medicine', options: ['Anatomy', 'Physiology', 'Clinical Medicine'] },
  { label: 'Social Sciences', options: ['History', 'Civics', 'Geography', 'Psychology', 'Philosophy'] },
  { label: 'Literature', options: ['English Literature', 'Urdu Literature', 'Hindi Literature', 'Persian Literature', 'Arabic Literature', 'Kashmiri Literature'] },
]

export default function GenreSelect({
  value,
  onChange,
  className,
  allOptionLabel,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  // When set, renders a leading "unset" option (e.g. "All Genres" for a filter) with value=""
  allOptionLabel?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? 'w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-teal'}
    >
      {allOptionLabel && <option value="" className="bg-white">{allOptionLabel}</option>}
      {GENRE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label} className="bg-white">
          {group.options.map((opt) => (
            <option key={opt} value={opt} className="bg-white">{opt}</option>
          ))}
        </optgroup>
      ))}
      <optgroup label="Other" className="bg-white">
        <option value="General" className="bg-white">General / Other</option>
      </optgroup>
    </select>
  )
}
