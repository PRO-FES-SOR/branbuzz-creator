// Admin Auth Page — Supabase
import { signIn, getCurrentUser, getUserProfile } from '../../auth.js';
import { showSuccess, showError } from '../../components/toast.js';

// Check if already logged in
async function checkAuth() {
  const user = await getCurrentUser();
  if (user) {
    const profile = await getUserProfile(user.id);
    if (profile?.role === 'admin') {
      window.location.href = '/admin-dashboard.html';
    }
  }
}
checkAuth();

// Sign In
const form = document.getElementById('admin-signin-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const btn = document.getElementById('admin-signin-btn');

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const user = await signIn(email, password);
    const profile = await getUserProfile(user.id);

    if (profile?.role !== 'admin') {
      showError('This account is not an admin account.');
      btn.disabled = false;
      btn.textContent = 'Sign In as Admin';
      return;
    }

    showSuccess('Welcome, Admin!');
    window.location.href = '/admin-dashboard.html';
  } catch (error) {
    const msg = error.message?.includes('Invalid login') ? 'Invalid email or password.' : error.message;
    showError(msg);
    btn.disabled = false;
    btn.textContent = 'Sign In as Admin';
  }
});
