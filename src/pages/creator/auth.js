// Creator Auth Page — Supabase
import { signUp, signIn, signInWithGoogle, getCurrentUser, getUserProfile, onAuthChange } from '../../auth.js';
import { showSuccess, showError } from '../../components/toast.js';
import { openModal } from '../../components/modal.js';

// Check if already logged in
async function checkAuth(user = null) {
  const currentUser = user || await getCurrentUser();
  if (currentUser) {
    const profile = await getUserProfile(currentUser.id);
    if (profile?.role === 'creator') {
      window.location.href = '/creator-dashboard.html';
    }
  }
}
checkAuth();

// Listen for auth state changes (crucial for OAuth redirects)
onAuthChange((user) => {
  if (user) checkAuth(user);
});

// Tab switching
const signinTab = document.getElementById('tab-signin');
const signupTab = document.getElementById('tab-signup');
const signinForm = document.getElementById('signin-form');
const signupForm = document.getElementById('signup-form');

signinTab.addEventListener('click', () => {
  signinTab.classList.add('active');
  signupTab.classList.remove('active');
  signinForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
});

signupTab.addEventListener('click', () => {
  signupTab.classList.add('active');
  signinTab.classList.remove('active');
  signupForm.classList.remove('hidden');
  signinForm.classList.add('hidden');
});

// Sign In
signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;
  const btn = document.getElementById('signin-btn');

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const user = await signIn(email, password);
    const profile = await getUserProfile(user.id);

    if (profile?.role !== 'creator') {
      showError('This account is not a creator account. Use the Admin Login instead.');
      btn.disabled = false;
      btn.textContent = 'Sign In';
      return;
    }

    showSuccess('Welcome back!');
    window.location.href = '/creator-dashboard.html';
  } catch (error) {
    const msg = error.message?.includes('Invalid login') ? 'Invalid email or password.' : error.message;
    showError(msg);
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

// Sign Up
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const btn = document.getElementById('signup-btn');

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    await signUp(email, password, name, 'creator');
    showSuccess('Account created! Welcome aboard!');
    window.location.href = '/creator-dashboard.html';
  } catch (error) {
    const msg = error.message?.includes('already registered') ? 'Email already registered.' : error.message;
    showError(msg);
    btn.disabled = false;
    btn.textContent = 'Sign Up';
  }
});

// Google Auth
async function handleGoogleLogin(e) {
  e.preventDefault();
  const btn = e.currentTarget;
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.textContent = 'Redirecting to Google...';
  
  try {
    await signInWithGoogle();
    // Browser will redirect
  } catch (error) {
    showError(error.message);
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

document.getElementById('signin-google-btn').addEventListener('click', handleGoogleLogin);
document.getElementById('signup-google-btn').addEventListener('click', handleGoogleLogin);

// Terms and Conditions Modal
const tncLink = document.getElementById('tnc-link');
if (tncLink) {
  tncLink.addEventListener('click', (e) => {
    e.preventDefault();
    const tncHtml = `
      <div style="font-size: 0.9rem; line-height: 1.6; color: var(--color-text-secondary); max-height: 60vh; overflow-y: auto; padding-right: 8px;">
        <p>By joining a BranBuzz campaign, you agree to follow the campaign instructions, marketplace rules, social media platform rules, and the terms mentioned below.</p>
        
        <h4 style="margin-top: 16px; color: var(--color-text-primary);">1. Campaign Participation</h4>
        <p>Creators must register with true and correct details. BranBuzz may reject or block any creator account if fake details, duplicate accounts, fraud, or misuse is found.</p>
        <p>Each campaign will mention the product, marketplace, refund amount, review reward, reel payment, deadline, and content requirements. Payment will be released only after BranBuzz verifies that the creator has completed the required steps.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">2. Product Order and Refund</h4>
        <p>The creator must order the assigned product from the marketplace mentioned in the campaign brief.</p>
        <p>After placing the order, the creator must upload a clear order screenshot on the BranBuzz platform. The screenshot must show the product name, order ID, order date, marketplace name, and paid amount.</p>
        <p>BranBuzz will refund the approved product cost after verifying the order proof. Extra charges such as delivery fees, convenience fees, gift wrapping, or platform charges will be refunded only if mentioned in the campaign brief.</p>
        <p>Creators must not cancel, return, replace, or refund the product after claiming payment from BranBuzz unless written approval is given.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">3. Marketplace Review</h4>
        <p>After receiving and using the product, the creator may post an honest review on the same marketplace where the product was ordered, where marketplace rules allow it.</p>
        <p>BranBuzz does not require only positive reviews. Reviews must be genuine, based on the creator’s actual product experience, and must not be fake, copied, forced, or misleading.</p>
        <p>The creator must follow all marketplace review policies and disclosure requirements.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">4. Review Reward</h4>
        <p>The review reward amount will be ₹100 or the amount mentioned in the campaign brief.</p>
        <p>The review reward will be paid only after the review is published, visible, reflected on the marketplace, and verified by BranBuzz.</p>
        <p>If the review is not reflected, rejected, removed, hidden, or not visible on the marketplace, BranBuzz will not pay the review reward amount.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">5. Reel and Raw Clip Submission</h4>
        <p>If the campaign includes reel creation, the creator must shoot and share original raw clips as per the campaign brief.</p>
        <p>Raw clips must be clear, usable, and created by the creator. Copied, stolen, downloaded, fake, or unusable content will not be accepted.</p>
        <p>The creator must follow the required format, product visibility, usage demo, language, deadline, and other instructions mentioned in the campaign brief.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">6. Reel Payment</h4>
        <p>The reel payment will be ₹1,000 or the amount mentioned in the campaign brief.</p>
        <p>Reel payment will be released only after the creator submits approved raw clips and BranBuzz or the brand team edits and posts the final reel on Instagram or the agreed platform.</p>
        <p>Payment may be rejected if the creator submits poor-quality clips, misses the deadline, does not follow the brief, refuses corrections, or violates the campaign terms.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">7. Content Usage Rights</h4>
        <p>By submitting raw clips, photos, videos, reviews, captions, or testimonials, the creator gives BranBuzz and the campaign brand permission to edit, publish, reuse, advertise, boost, crop, resize, and use the content for marketing, social media, marketplace listings, websites, ads, and brand promotions.</p>
        <p>The creator confirms that all submitted content is original and does not violate any third-party rights.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">8. Disclosure and Compliance</h4>
        <p>Creators must follow all applicable marketplace, social media, advertising, and consumer protection rules.</p>
        <p>For paid or sponsored content, creators must use proper disclosure such as “Ad,” “Sponsored,” “Paid Collaboration,” or any other disclosure required by law or platform rules.</p>
        <p>BranBuzz may reject submissions or hold payments if the creator fails to follow required disclosure rules.</p>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">9. Payment Rejection</h4>
        <p>BranBuzz may hold, reject, or cancel payment in cases including:</p>
        <ul style="margin-left: 20px; list-style-type: disc;">
          <li>Fake or edited order screenshots</li>
          <li>Cancelled, returned, or refunded orders</li>
          <li>Review not reflected on marketplace</li>
          <li>Review rejected, hidden, or removed</li>
          <li>Fake, copied, or misleading reviews</li>
          <li>Poor-quality or unusable raw clips</li>
          <li>Late submission</li>
          <li>Failure to follow the campaign brief</li>
          <li>Duplicate accounts</li>
          <li>Fraud, misuse, or suspicious activity</li>
          <li>Violation of marketplace or platform policies</li>
        </ul>

        <h4 style="margin-top: 16px; color: var(--color-text-primary);">10. Final Approval</h4>
        <p>All refunds, rewards, reel payments, and approvals are subject to BranBuzz verification.</p>
        <p>BranBuzz’s decision regarding campaign approval, rejection, payment, and creator eligibility will be final.</p>
        <p style="margin-top: 16px; font-weight: 600;">By accepting a campaign on BranBuzz, the creator confirms that they have read, understood, and agreed to this Creator Agreement.</p>
      </div>
    `;
    openModal('BranBuzz Creator Agreement', tncHtml);
  });
}
