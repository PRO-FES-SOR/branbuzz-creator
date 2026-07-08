-- SQL to create Webhooks to trigger the Edge Function
-- Run this in your Supabase SQL Editor

-- 1. Create a function that calls the Edge Function
CREATE OR REPLACE FUNCTION notify_edge_function()
RETURNS TRIGGER AS $$
DECLARE
  webhook_url TEXT;
  service_role_key TEXT;
  payload JSONB;
BEGIN
  -- NOTE: You should set these securely in Vault or hardcode your Edge Function URL here
  -- Example: 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/send-push'
  webhook_url := 'https://' || current_setting('request.headers')::json->>'x-forwarded-host' || '/functions/v1/send-push';
  -- WARNING: the above url extraction only works for local dev or simple setups, 
  -- for production, hardcode the URL or get it from a secure table/vault:
  -- webhook_url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/send-push';
  
  -- We don't have the service_role_key directly accessible in SQL, so we rely on 
  -- Supabase's native HTTP extension (pg_net) to handle authentication if using Webhooks UI.
  -- Since doing this via pure raw SQL without pg_net is complex, the EASIEST way is to use
  -- the Supabase Dashboard -> Database -> Webhooks.

  -- But if we use pg_net:
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', NEW,
    'old_record', OLD
  );

  PERFORM net.http_post(
    url := webhook_url,
    body := payload,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_OR_SERVICE_KEY"}'::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger for orders
DROP TRIGGER IF EXISTS trigger_push_orders ON public.orders;
CREATE TRIGGER trigger_push_orders
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_edge_function();

-- 3. Trigger for messages
DROP TRIGGER IF EXISTS trigger_push_messages ON public.messages;
CREATE TRIGGER trigger_push_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_edge_function();


-- ==============================================================================
-- IMPORTANT ALTERNATIVE: Use Supabase Dashboard for Webhooks (Recommended)
-- ==============================================================================
-- 1. Go to Supabase Dashboard -> Database -> Webhooks
-- 2. Click "Create Webhook"
-- 3. Name: "Push Notification on Order Update"
-- 4. Table: orders, Events: UPDATE
-- 5. Webhook URL: https://[YOUR_PROJECT_REF].supabase.co/functions/v1/send-push
-- 6. HTTP Headers: Authorization: Bearer [YOUR_ANON_KEY]
-- 
-- Repeat for Table: messages, Events: INSERT
