-- Add platform column to products table
-- Default is 'Amazon' for existing backwards compatibility

ALTER TABLE products
ADD COLUMN IF NOT EXISTS platform text DEFAULT 'Amazon';
