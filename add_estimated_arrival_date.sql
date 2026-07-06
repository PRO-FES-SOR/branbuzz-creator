-- Add estimated_arrival_date column to orders table
-- This allows creators to provide an estimated arrival date when uploading purchase proofs

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS estimated_arrival_date date;
