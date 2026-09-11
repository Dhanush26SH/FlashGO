const fs = require('fs');

const sql = `-- 20260902000004_notifications_schema.sql

-- 1. Create or Upgrade Notifications Table Safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
        -- State A: Legacy table exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id') THEN
            EXECUTE 'ALTER TABLE public.notifications RENAME COLUMN user_id TO recipient_id';
            EXECUTE 'ALTER TABLE public.notifications RENAME COLUMN body TO message';
            EXECUTE 'ALTER TABLE public.notifications RENAME COLUMN read TO is_read';
            
            EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type TEXT';
            EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id TEXT';
            EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB';
            EXECUTE 'ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key TEXT';
            
            EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN type TYPE TEXT USING type::text';
            EXECUTE 'DROP TYPE IF EXISTS notification_type';
            
            EXECUTE $Q$UPDATE public.notifications SET entity_type = 'system' WHERE entity_type IS NULL$Q$;
            EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN entity_type SET NOT NULL';
            
            EXECUTE $Q$UPDATE public.notifications SET entity_id = 'legacy' WHERE entity_id IS NULL$Q$;
            EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN entity_id SET NOT NULL';
            
            EXECUTE 'UPDATE public.notifications SET event_key = gen_random_uuid()::text WHERE event_key IS NULL';
            EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN event_key SET NOT NULL';
        ELSE
            RAISE EXCEPTION 'notifications table exists but is not the expected legacy format (missing user_id).';
        END IF;
    ELSE
        -- State B: Clean create
        EXECUTE $Q$
        CREATE TABLE public.notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'info',
            is_read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            metadata JSONB,
            event_key TEXT NOT NULL
        )
        $Q$;
    END IF;
END;
$$;

-- Unique constraint for idempotency
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_notification_event'
    ) THEN
        ALTER TABLE public.notifications ADD CONSTRAINT unique_notification_event UNIQUE (recipient_id, event_key);
    END IF;
END;
$$;

-- Indexes for performance and Realtime
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(recipient_id) WHERE is_read = false;

-- 2. Update RLS Policies
-- Drop existing policies
DROP POLICY IF EXISTS "ON public.notifications FOR SELECT" ON public.notifications;
DROP POLICY IF EXISTS "ON public.notifications FOR UPDATE" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;

-- Create strict policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = recipient_id);

CREATE POLICY "Users can mark own notifications read"
ON public.notifications FOR UPDATE
USING (auth.uid() = recipient_id)
WITH CHECK (
    -- Only allow changing is_read from false to true. Cannot change other fields.
    (old.is_read = false AND new.is_read = true) AND
    (old.recipient_id = new.recipient_id) AND
    (old.type = new.type) AND
    (old.title = new.title) AND
    (old.message = new.message) AND
    (old.entity_type = new.entity_type) AND
    (old.entity_id = new.entity_id) AND
    (old.event_key = new.event_key)
);

-- No INSERT or DELETE policies for clients.

-- 3. Mark Read RPCs
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE id = p_notification_id AND recipient_id = auth.uid();
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE recipient_id = auth.uid() AND is_read = false;
END;
$BODY$;

-- 4. Internal Writer Helper
CREATE OR REPLACE FUNCTION public.write_notification(
    p_recipient_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_event_key TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
BEGIN
    INSERT INTO public.notifications (
        recipient_id, type, title, message, entity_type, entity_id, event_key, metadata, is_read
    ) VALUES (
        p_recipient_id, p_type, p_title, p_message, p_entity_type, p_entity_id, p_event_key, p_metadata, false
    )
    ON CONFLICT (recipient_id, event_key) DO NOTHING; -- Safe idempotency
END;
$BODY$;

-- Revoke execute from public
REVOKE EXECUTE ON FUNCTION public.write_notification FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.write_notification FROM anon, authenticated;

-- Ensure Realtime publication for notifications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END;
$$;
`;

fs.writeFileSync('supabase/migrations/20260902000004_notifications_schema.sql', sql);
console.log('Migration 00004 updated successfully.');
