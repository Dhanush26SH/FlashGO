-- Migration: 20260920235300_fix_return_task_constraint.sql
-- Description: Add 'standard' to driver_return_tasks_return_type_check constraint

ALTER TABLE public.driver_return_tasks 
  DROP CONSTRAINT IF EXISTS driver_return_tasks_return_type_check;

ALTER TABLE public.driver_return_tasks 
  ADD CONSTRAINT driver_return_tasks_return_type_check 
  CHECK (return_type IN ('cooler', 'merchandise', 'standard'));
