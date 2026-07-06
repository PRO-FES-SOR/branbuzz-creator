-- Add campaign_closed column to products table
-- Allows creators to see the product but not apply for it

ALTER TABLE products
ADD COLUMN IF NOT EXISTS campaign_closed boolean DEFAULT false;
