-- Migration: 20260921005200_fix_driver_sessions_replica_identity.sql
-- Description: Set REPLICA IDENTITY FULL on driver_sessions to allow Realtime RLS to broadcast updates to Customer Order Tracking

ALTER TABLE public.driver_sessions REPLICA IDENTITY FULL;
