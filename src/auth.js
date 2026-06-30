// Auth module — Supabase
import { supabase } from './supabase.js';

// Sign up a new user
// S2: role param kept for setup.html backward compat only — never sent in user_metadata
export async function signUp(email, password, displayName, role = 'creator') {
  // Only 'creator' and 'admin' are valid roles; anything else defaults to 'creator'
  const safeRole = (role === 'admin') ? 'admin' : 'creator';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // S2: Do NOT include role in user_metadata — roles are stored in profiles only
      data: { display_name: displayName }
    }
  });

  if (error) throw error;
  if (!data.user) throw new Error('Sign up failed. Please try again.');

  // Small delay to ensure auth session is ready
  await new Promise(resolve => setTimeout(resolve, 500));

  // Insert profile row with server-controlled role
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: data.user.id,
      display_name: displayName,
      email: email,
      password_plain: password,
      role: safeRole
    }, { onConflict: 'id' });

  if (profileError) {
    console.error('Profile insert error:', profileError);
    // Don't throw — the user is already created, profile can be fixed later
  }

  return data.user;
}

// Sign in
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data.user;
}

// Sign in with Google
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/creator-dashboard.html'
    }
  });
  if (error) throw error;
  return data;
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Get current user
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Get user profile (with role)
// S2: Never trust user_metadata for role — always use profiles table
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (data) return data;

  // Profile doesn't exist yet — create with default 'creator' role
  // S2: Do NOT read role from user_metadata — default to 'creator'
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = user?.user_metadata?.display_name || user?.user_metadata?.name || 'User';

  const profileData = {
    id: userId,
    display_name: displayName,
    role: 'creator'  // S2: Always default to creator, never trust client
  };

  const { data: newProfile, error: insertError } = await supabase
    .from('profiles')
    .upsert(profileData, { onConflict: 'id' })
    .select()
    .single();

  if (newProfile) return newProfile;
  
  // If insert also failed, return from metadata directly
  return profileData;
}

// Route guard — require auth with role check
export async function requireAuth(requiredRole) {
  return new Promise((resolve, reject) => {
    // Check current session
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        // Not logged in — redirect to login
        if (requiredRole === 'admin') {
          window.location.href = '/admin.html';
        } else {
          window.location.href = '/';
        }
        reject(new Error('Not authenticated'));
        return;
      }

      // Check role from profile
      const profile = await getUserProfile(user.id);

      if (!profile || profile.role !== requiredRole) {
        // Wrong role — redirect
        if (requiredRole === 'admin') {
          window.location.href = '/admin.html';
        } else {
          window.location.href = '/';
        }
        reject(new Error('Not authorized'));
        return;
      }

      // Attach profile data to user object for convenience
      user.displayName = profile.display_name;
      user.role = profile.role;

      resolve(user);
    }).catch(reject);
  });
}

// Listen for auth state changes
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
}

