-- clubs.member_count defaulted to 1, on the assumption that the creator was
-- counted without a corresponding club_members row. But clubs/create/page.tsx
-- explicitly inserts a club_members row for the creator too, and
-- trg_club_member_count (added later in fix_member_count_trigger.sql to make
-- member_count updates atomic) increments the count on every club_members
-- insert -- including the creator's own. Every club's member_count has
-- therefore been exactly one higher than its real club_members row count
-- since that trigger shipped, permanently, for every club on the platform.
-- Confirmed via manual testing: a freshly created club with only its creator
-- as a member showed member_count = 2.
ALTER TABLE public.clubs ALTER COLUMN member_count SET DEFAULT 0;

UPDATE public.clubs c
SET member_count = (SELECT count(*) FROM public.club_members cm WHERE cm.club_id = c.id);
