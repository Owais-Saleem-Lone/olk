-- Enforce max_messages_per_hour and max_requests_per_day server-side.
-- These platform_settings keys already existed (or are seeded here) but were never
-- checked before insert, so a client could flood a conversation or spam requests.
-- Enforcing via BEFORE INSERT triggers means the limit holds even for direct
-- API/DB calls, not just the UI.

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('max_messages_per_hour', '30', 'Maximum messages a user can send per hour')
ON CONFLICT (key) DO NOTHING;

-- Uses #>> '{}' rather than a plain ::text cast because the admin settings UI
-- always writes values as JSON strings (e.g. "30"); ::text on that keeps the
-- quotes and breaks a numeric cast, while #>> '{}' unwraps either a JSON
-- string or a JSON number to plain unquoted text.
CREATE OR REPLACE FUNCTION public.get_platform_setting_int(p_key text, p_default int)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.platform_settings WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
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

DROP TRIGGER IF EXISTS trg_enforce_message_rate_limit ON public.messages;
CREATE TRIGGER trg_enforce_message_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_rate_limit();

CREATE OR REPLACE FUNCTION public.enforce_request_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
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

DROP TRIGGER IF EXISTS trg_enforce_request_rate_limit ON public.book_requests;
CREATE TRIGGER trg_enforce_request_rate_limit
  BEFORE INSERT ON public.book_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_request_rate_limit();
