-- ============================================================
-- Migration 00081: Add booking_type to bookings table
--
-- Distinguishes initial consultations from refund consultations
-- so users can book both independently.
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'initial'
  CHECK (booking_type IN ('initial', 'refund'));
