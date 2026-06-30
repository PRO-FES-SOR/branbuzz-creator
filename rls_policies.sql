-- ============================================
-- Creator Platform — Recommended RLS Policies
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- MIGRATION: Add email + password columns to profiles
-- Run this ONCE to add login credential support
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_plain text;

-- Backfill existing profiles with email from auth.users
UPDATE profiles
SET email = auth.users.email
FROM auth.users
WHERE profiles.id = auth.users.id
AND profiles.email IS NULL;

-- ============================================
-- F6: Unique Amazon Order ID constraint
-- Prevents the same Amazon order from being used across multiple orders
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_amazon_order_id_unique
ON orders (amazon_order_id)
WHERE amazon_order_id IS NOT NULL AND amazon_order_id != '';

-- ============================================
-- D3: Enable Supabase Realtime on orders table
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE orders;




-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES
-- ============================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can update their own display_name only (not role)
CREATE POLICY "Users can update own display_name"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Allow insert for new signups (profile creation)
CREATE POLICY "Users can create own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- PRODUCTS
-- ============================================

-- All authenticated users can view active products
CREATE POLICY "Anyone can view active products"
  ON products FOR SELECT
  USING (is_active = true OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Only admins can insert/update/delete products
CREATE POLICY "Admins can manage products"
  ON products FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- ORDERS
-- ============================================

-- Creators can view only their own orders
CREATE POLICY "Creators can view own orders"
  ON orders FOR SELECT
  USING (creator_id = auth.uid());

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Creators can insert orders (apply for products)
CREATE POLICY "Creators can create orders"
  ON orders FOR INSERT
  WITH CHECK (
    creator_id = auth.uid()
    AND status = 'interested'
  );

-- Creators can update ONLY specific columns on their own orders
-- (screenshot_url, amazon_order_id, upi_id, review_text, review_proof_url, reel_url)
-- They CANNOT update: status, payment_amount, refund_amount, admin_notes
CREATE POLICY "Creators can update own order media"
  ON orders FOR UPDATE
  USING (creator_id = auth.uid())
  WITH CHECK (
    creator_id = auth.uid()
    -- Note: Column-level restrictions require a trigger or RPC function
    -- This policy allows row-level access; use a trigger to enforce column restrictions
  );

-- Admins can update all orders (status transitions, payments, notes)
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- STORAGE BUCKET: uploads
-- ============================================
-- Configure in Supabase Dashboard → Storage → uploads → Policies:
--
-- 1. Allow authenticated users to upload to their own folder:
--    INSERT: bucket_id = 'uploads' AND (storage.foldername(name))[1] IN ('screenshots', 'review-proofs', 'reels') AND (storage.foldername(name))[2] = auth.uid()::text
--
-- 2. Allow public read access (for viewing uploaded proofs):
--    SELECT: bucket_id = 'uploads'
--
-- 3. Do NOT allow users to delete or overwrite other users' files.

-- ============================================
-- RECOMMENDED: updated_at trigger (C2)
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
