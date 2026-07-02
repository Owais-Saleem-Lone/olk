-- Lets ISBN scan enrichment (Open Library) fill in more than title/author/cover.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS publication_year smallint
    CHECK (publication_year IS NULL OR (publication_year BETWEEN 1000 AND 2200));
