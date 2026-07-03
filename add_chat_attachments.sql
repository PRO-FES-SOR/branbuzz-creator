-- ============================================
-- Add Chat Attachments
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add attachment_url column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url text;

-- 2. IMPORTANT: Update Storage Policies for the "uploads" bucket
-- To allow users to upload files in chat, ensure your Storage Policy allows INSERT and SELECT
-- to a folder named "chat-attachments/".
-- 
-- Recommended INSERT policy for "uploads" bucket:
-- bucket_id = 'uploads' AND (
--   (storage.foldername(name))[1] IN ('screenshots', 'review-proofs', 'reels', 'chat-attachments')
-- )
--
-- Recommended SELECT policy for "uploads" bucket:
-- bucket_id = 'uploads' (Allow public read access so attachments can be viewed)
