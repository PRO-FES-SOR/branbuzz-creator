import { supabase } from '../supabase.js';

// Base64 to Uint8Array helper for VAPID key
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// NOTE: You must generate your own VAPID keys using a tool like web-push
// For now, this is a placeholder. You'll need to set this when deploying the Edge Function.
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuB-3qIX7aLRj5Xb5hN3b5fB7M';

let isRegistered = false;

export async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported in this browser');
    return false;
  }

  try {
    // Register the service worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered successfully:', registration.scope);
    isRegistered = true;
    
    // Check permission state and handle banner
    checkPermissionAndShowBanner(registration);
    
    // Listen for messages from SW (e.g. clicking a notification when tab is open)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SWITCH_SECTION') {
        if (typeof window.switchToSection === 'function') {
          window.switchToSection(event.data.section);
        }
      }
    });

    return true;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return false;
  }
}

function checkPermissionAndShowBanner(registration) {
  const banner = document.getElementById('push-banner');
  const enableBtn = document.getElementById('push-banner-enable');
  const dismissBtn = document.getElementById('push-banner-dismiss');
  
  if (!banner) return;
  
  const isDismissed = localStorage.getItem('pushBannerDismissed') === 'true';
  
  // If permission is already granted, ensure we have an active subscription in Supabase
  if (Notification.permission === 'granted') {
    subscribeToPush(registration);
    return;
  }

  if (Notification.permission === 'default' && !isDismissed) {
    banner.classList.remove('hidden');
    
    if (enableBtn) {
      enableBtn.addEventListener('click', async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          banner.classList.add('hidden');
          await subscribeToPush(registration);
        } else {
          banner.classList.add('hidden');
          localStorage.setItem('pushBannerDismissed', 'true');
        }
      });
    }
    
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.classList.add('hidden');
        localStorage.setItem('pushBannerDismissed', 'true');
      });
    }
  }
}

async function subscribeToPush(registration) {
  try {
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      const applicationServerKey = urlB64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
    }
    
    // Save to Supabase
    await saveSubscriptionToDatabase(subscription);
    
  } catch (err) {
    console.error('Failed to subscribe to Push:', err);
  }
}

async function saveSubscriptionToDatabase(subscription) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const subscriptionJSON = subscription.toJSON();
  const endpoint = subscriptionJSON.endpoint;
  const p256dh = subscriptionJSON.keys.p256dh;
  const auth = subscriptionJSON.keys.auth;

  // Insert or handle unique constraint
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      creator_id: user.id,
      endpoint: endpoint,
      p256dh: p256dh,
      auth: auth
    }, { onConflict: 'creator_id, endpoint' });
    
  if (error) {
    console.error('Failed to save push subscription to DB:', error);
  }
}

// Deprecated in offline push model: we don't send local broadcast channel messages.
// The Edge Function will send the actual push notification directly to the endpoint.
export function sendPushNotification(title, body, data = {}) {
  // Doing nothing here. Left for backward compatibility so dashboard.js doesn't break,
  // but true push notifications will arrive from the Edge Function.
  console.log('Local push notification suppressed in favor of offline Web Push');
}
