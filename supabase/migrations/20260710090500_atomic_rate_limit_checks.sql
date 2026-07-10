-- enforce_message_rate_limit / enforce_request_rate_limit were check-then-
-- insert with no locking: concurrent inserts from the same user can each
-- read the count before either commits, letting the hourly/daily cap
-- overshoot by a few rows under a race. Take a per-user advisory xact lock
-- before counting so concurrent inserts from the same user serialize; the
-- lock auto-releases at transaction end, and different users never contend
-- with each other.
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('message_rate_limit:' || NEW.sender_id::text)::bigint);

  v_limit := public.get_platform_setting_int('max_messages_per_hour', 30);

  SELECT count(*) INTO v_count
  FROM public.messages
  WHERE sender_id = NEW.sender_id
    AND created_at > now() - interval '1 hour';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: max % messages per hour reached', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_request_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('request_rate_limit:' || NEW.requester_id::text)::bigint);

  v_limit := public.get_platform_setting_int('max_requests_per_day', 10);

  SELECT count(*) INTO v_count
  FROM public.book_requests
  WHERE requester_id = NEW.requester_id
    AND created_at > now() - interval '24 hours';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: max % requests per day reached', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
