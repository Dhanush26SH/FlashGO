-- Migration: 20260822000002_fix_driver_online_column.sql
-- 
-- DEFECT: The check_driver_online_guard trigger and claim_trip / reassign_trip RPCs
-- reference profiles.is_online which was never added to the profiles table.
-- This caused all UPDATE operations on profiles to fail with:
--   "record "new" has no field "is_online""
--
-- Fix: Add is_online to profiles with a safe DEFAULT FALSE.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;

-- Update all driver rows to online=false by default (safe, no real session data)
-- Non-driver rows simply have is_online=false which is harmless.

-- Confirm the trigger now works correctly by re-running its definition
-- (no change needed to trigger itself; adding the column is sufficient).

-- For good measure, also ensure driver_sessions table (if used) syncs is_online:
-- (No changes needed to driver_sessions — the trigger reads from profiles directly.)
