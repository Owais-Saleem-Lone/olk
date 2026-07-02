ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text
    CHECK (bio IS NULL OR char_length(bio) <= 300);
