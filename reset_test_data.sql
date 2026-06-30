-- ============================================
-- RESET TEST DATA
-- WARNING: This will permanently delete ALL orders, chat messages, and creator profiles!
-- Run this in your Supabase SQL Editor ONLY if you want to start fresh.
-- ============================================

-- 1. Delete all chat messages
-- DELETE FROM messages; (Table doesn't exist yet in your DB)

-- 2. Delete all orders (This removes all screenshot links, review texts, and reel URLs)
DELETE FROM orders;

-- 3. Completely delete creator accounts
-- This deletes the actual login accounts from Supabase Auth.
-- It will automatically cascade and delete their public.profiles as well.
DELETE FROM auth.users WHERE id IN (SELECT id FROM public.profiles WHERE role = 'creator');

-- (Optional) If you want to delete products as well, uncomment the line below:
-- DELETE FROM products;
