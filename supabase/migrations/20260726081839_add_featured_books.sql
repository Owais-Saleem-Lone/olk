-- Lets admins curate up to 5 real books from the library to spotlight on the
-- homepage ("From the Community"), replacing the purely decorative shelf.
ALTER TABLE public.books
  ADD COLUMN featured boolean NOT NULL DEFAULT false,
  ADD COLUMN featured_at timestamptz;

CREATE INDEX idx_books_featured ON public.books (featured_at) WHERE featured = true;
