import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

console.log("send-push edge function started!");

serve(async (req) => {
  try {
    // Webhook payload from Supabase
    const payload = await req.json();
    console.log("Received webhook payload:", JSON.stringify(payload));

    const record = payload.record;
    if (!record) {
      return new Response(JSON.stringify({ error: "No record found" }), { status: 400 });
    }

    let title = "New Notification";
    let body = "You have a new update.";
    let creatorId = null;

    // Determine what triggered this webhook
    if (payload.table === "orders") {
      creatorId = record.creator_id;
      const status = record.status.replace("_", " ");
      title = "Order Updated";
      body = `Your order is now: ${status}`;
    } else if (payload.table === "messages") {
      creatorId = record.receiver_id;
      title = "New Message";
      body = record.content || "You received a new message.";
      if (body.includes('REPLY::[')) {
         const match = body.match(/REPLY::\[(.*?)\]::REPLY_END(.*)/s);
         if (match) body = match[2].trim();
      }
    } else {
      return new Response(JSON.stringify({ error: "Unsupported table" }), { status: 400 });
    }

    if (!creatorId) {
      return new Response(JSON.stringify({ error: "No creator ID" }), { status: 400 });
    }

    // Initialize Supabase client to fetch subscriptions
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("creator_id", creatorId);

    if (error || !subscriptions || subscriptions.length === 0) {
      console.log("No push subscriptions found for creator:", creatorId);
      return new Response(JSON.stringify({ success: true, message: "No subscriptions found" }), { status: 200 });
    }

    // Configure Web Push VAPID keys
    // These must be set as Edge Function secrets
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@branbuzz.com";
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured");
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500 });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const pushPayload = JSON.stringify({
      title,
      body,
      data: {
        section: payload.table === "orders" ? "orders" : "inbox"
      }
    });

    let successCount = 0;
    const staleSubscriptions = [];

    // Send push to all subscriptions for this user
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        await webpush.sendNotification(pushSubscription, pushPayload);
        successCount++;
      } catch (err) {
        console.error("Error sending push to endpoint:", sub.endpoint, err);
        // If the subscription is no longer valid (e.g. 410 Gone), mark for deletion
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleSubscriptions.push(sub.id);
        }
      }
    }

    // Clean up stale subscriptions
    if (staleSubscriptions.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", staleSubscriptions);
      console.log(`Cleaned up ${staleSubscriptions.length} stale subscriptions`);
    }

    return new Response(JSON.stringify({ success: true, sent: successCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
