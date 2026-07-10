"use client"

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import AddBookForm from '@/components/my-books/add-book-form'
import MyBooksList from '@/components/my-books/my-books-list'
import ReceivedBooksList from '@/components/my-books/received-books-list'
import type { Book, ReceivedBook } from '@/components/my-books/types'

export default function MyBooksPage() {
  const supabase = createClient()

  const [myBooks, setMyBooks] = useState<Book[]>([])
  const [receivedBooks, setReceivedBooks] = useState<ReceivedBook[]>([])
  const [receivedProgress, setReceivedProgress] = useState<Record<string, number>>({})

  const fetchMyBooks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('books').select('*').eq('owner_id', user.id)
      .order('created_at', { ascending: false })
    if (!error && data) setMyBooks(data)
  }, [supabase])

  const fetchReceivedBooks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('book_requests')
      .select('id, handed_over_at, book_id, books(id, title, author, cover_url, genre, listing_type, lending_duration_months)')
      .eq('requester_id', user.id)
      .eq('status', 'handed_over')
      .order('handed_over_at', { ascending: false })
    if (error || !data) return
    const received = data as unknown as ReceivedBook[]
    setReceivedBooks(received)
    const bookIds = received.map((r) => r.book_id)
    if (bookIds.length === 0) return
    const { data: prog } = await supabase
      .from('book_progress')
      .select('book_id, progress_pct')
      .in('book_id', bookIds)
      .eq('reader_id', user.id)
    if (prog) {
      const pm: Record<string, number> = {}
      prog.forEach((p: { book_id: string; progress_pct: number }) => { pm[p.book_id] = p.progress_pct })
      setReceivedProgress(pm)
    }
  }, [supabase])

  useAsyncEffect(() => { fetchMyBooks(); fetchReceivedBooks() }, [fetchMyBooks, fetchReceivedBooks])

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Books</h1>
      <p className="text-slate-400 mb-8">Add a book to donate or lend</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <AddBookForm onAdded={fetchMyBooks} />

        <div className="flex flex-col gap-8">
          <MyBooksList books={myBooks} onChange={fetchMyBooks} />
          <ReceivedBooksList
            items={receivedBooks}
            progress={receivedProgress}
            onProgressSaved={(bookId, pct) => setReceivedProgress(prev => ({ ...prev, [bookId]: pct }))}
            onChange={() => { fetchMyBooks(); fetchReceivedBooks() }}
          />
        </div>
      </div>
    </div>
  )
}
