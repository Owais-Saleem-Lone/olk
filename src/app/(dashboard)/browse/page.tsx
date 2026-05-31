export default function BrowsePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Browse Books</h1>
      <p className="text-slate-400 mb-8">Find your next read from someone nearby</p>

      {/* Search Bar */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 mb-8">
        <input
          type="text"
          placeholder="Search by title, author, or ISBN..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* Empty State (we will add real books later!) */}
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-6xl mb-4">📖</div>
        <h2 className="text-xl font-semibold mb-2">No books just yet</h2>
        <p className="text-slate-400 max-w-md">
          Be the first to add a book to the community! Once books are added, they will appear right here.
        </p>
      </div>
    </div>
  )
}