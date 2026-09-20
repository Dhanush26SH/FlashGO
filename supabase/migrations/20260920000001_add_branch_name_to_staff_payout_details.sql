-- Add branch_name column to staff_payout_details
ALTER TABLE public.staff_payout_details ADD COLUMN branch_name TEXT;
