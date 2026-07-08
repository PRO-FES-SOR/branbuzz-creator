-- SQL to create the push_subscriptions table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(creator_id, endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Creators can insert their own subscriptions
CREATE POLICY "Creators can insert own subscriptions" 
    ON public.push_subscriptions FOR INSERT 
    WITH CHECK (auth.uid() = creator_id);

-- Creators can view their own subscriptions
CREATE POLICY "Creators can view own subscriptions" 
    ON public.push_subscriptions FOR SELECT 
    USING (auth.uid() = creator_id);

-- Creators can delete their own subscriptions
CREATE POLICY "Creators can delete own subscriptions" 
    ON public.push_subscriptions FOR DELETE 
    USING (auth.uid() = creator_id);

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions" 
    ON public.push_subscriptions FOR SELECT 
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Ensure the function exists before creating the trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
