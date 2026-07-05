-- The old permissive policy let any authenticated user insert a notification
-- row for ANY other user (only auth.uid() IS NOT NULL was checked), which
-- means the app's own UI was the only thing stopping a user from hitting
-- PostgREST directly and spoofing arbitrary notifications ("admin" type,
-- fake title/link) to any other user.
--
-- Cross-user notifications are a legitimate feature (request accepted,
-- new message, club announcements, etc.), so we can't simply require
-- auth.uid() = user_id. Instead, direct table inserts are now restricted to
-- self-notifications (and admins, via the existing separate policy); all
-- cross-user notification creation goes through the `createNotification`
-- server action, which uses the service-role client precisely because RLS
-- no longer permits it to act as the calling user.
DROP POLICY IF EXISTS "Authenticated users insert notifications" ON public.notifications;

CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
