-- Migration: 20260830000005_remove_legacy_slot_system.sql
-- Description: Completely remove the obsolete gig-worker slot scheduling tables and their permissive RLS.

-- Drop dependent table first
DROP TABLE IF EXISTS public.slot_bookings;

-- Drop parent table
DROP TABLE IF EXISTS public.slots;
