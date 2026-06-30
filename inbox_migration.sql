-- ============================================
-- Inbox Feature Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES profiles(id) ON DELETE CASCADE, -- NULL means broadcast
  message_type text NOT NULL CHECK (message_type IN ('direct', 'broadcast', 'to_admin')),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Creators can read their own received direct messages, their own sent messages, and broadcast messages.
-- Admins can read ALL messages.
CREATE POLICY "Users can view relevant messages" 
  ON messages FOR SELECT 
  USING (
    receiver_id = auth.uid() OR 
    sender_id = auth.uid() OR 
    message_type = 'broadcast' OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Creators can ONLY insert messages to admin (message_type = 'to_admin')
-- Admins can insert any message
CREATE POLICY "Users can insert messages" 
  ON messages FOR INSERT 
  WITH CHECK (
    sender_id = auth.uid() AND 
    (
      (message_type = 'to_admin' AND receiver_id IS NULL) OR 
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- Only receiver or admin can update (e.g., mark as read)
CREATE POLICY "Users can update received messages" 
  ON messages FOR UPDATE 
  USING (
    receiver_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    receiver_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Realtime configuration
-- Enable Realtime for the messages table so clients can listen to new messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
