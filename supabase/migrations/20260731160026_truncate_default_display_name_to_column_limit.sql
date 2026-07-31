-- handle_new_user() defaulted profiles.display_name to the raw signup email,
-- but display_name is varchar(50). Any email over 50 characters made this
-- INSERT raise "value too long for type character varying(50)" -- and since
-- this trigger runs inside the same transaction as the auth.users insert,
-- that exception rolled back the entire signup, not just the display name.
-- Real users with long-but-valid emails could not create an account at all.
-- Found while building tests/rls/known-issues.test.ts; fixed by truncating
-- the default to the column's own limit rather than widening the column
-- (display_name's 50-char cap is relied on elsewhere for layout, e.g. the
-- sidebar/profile card, and a user can always set a shorter display name
-- themself afterward).
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$ BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, substring(new.email from 1 for 50));
  RETURN new;
END;
 $$;
