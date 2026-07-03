// Creator Dashboard — Supabase
import { requireAuth, signOut } from '../../auth.js';
import { supabase } from '../../supabase.js';
import { showSuccess, showError, showInfo } from '../../components/toast.js';
import { openModal, closeModal, showImagePreview } from '../../components/modal.js';
import { getStatusBadge, getStatusTimeline } from '../../components/statusBadge.js';
import { createUploadArea, uploadFile } from '../../components/fileUpload.js';
import { escHtml, escUrl } from '../../utils.js';

// C3: Single source of truth for sections
const SECTIONS = {
  products: 'section-products',
  orders: 'section-orders',
  inbox: 'section-inbox',
};

let currentUser = null;
let products = [];
let orders = [];
let messages = [];
let realtimeChannel = null;
let currentChatAttachment = null;

// ========================================
// INITIALIZATION
// ========================================
async function init() {
  try {
    currentUser = await requireAuth('creator');
    document.getElementById('page-loader').style.display = 'none';

    // Set user info in navbar
    const userNameEl = document.getElementById('nav-user-name');
    if (userNameEl) userNameEl.textContent = currentUser.displayName || 'Creator';
    
    const avatarEl = document.getElementById('nav-avatar');
    if (avatarEl) avatarEl.textContent = (currentUser.displayName || 'C')[0].toUpperCase();

    // Load data
    await Promise.all([loadProducts(), loadOrders(), loadMessages()]);

    setupNavigation();
    setupOrderTabs();
    subscribeToRealtime();
  } catch (error) {
    console.error('Auth error:', error);
  }
}

// ========================================
// NAVIGATION
// ========================================
function setupNavigation() {
  const navLinks = document.querySelectorAll('.floating-tab[data-section], .nav-link[data-section]');

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      switchToSection(link.dataset.section);
    });
  });

  // Floating Support Button
  const supportBtn = document.getElementById('floating-support-btn');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => {
      switchToSection('inbox');
    });
  }

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/';
  });
}

// Switch to a section programmatically
function switchToSection(sectionName) {
  const navLinks = document.querySelectorAll('.floating-tab[data-section], .nav-link[data-section]');

  navLinks.forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.floating-tab[data-section="${sectionName}"], .nav-link[data-section="${sectionName}"]`);
  if (activeLink) activeLink.classList.add('active');

  // C3: Use shared SECTIONS map
  Object.values(SECTIONS).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const targetId = SECTIONS[sectionName];
  const target = targetId ? document.getElementById(targetId) : null;
  if (target) target.classList.remove('hidden');

  // Close mobile menu
  const navLinksMenu = document.getElementById('nav-links');
  if (navLinksMenu) navLinksMenu.classList.remove('open');

  // Floating Support Button Visibility
  const supportBtn = document.getElementById('floating-support-btn');
  if (supportBtn) {
    if (sectionName === 'inbox') {
      supportBtn.style.display = 'none';
    } else {
      supportBtn.style.display = 'flex';
    }
  }

  // Reload orders when switching to orders tab
  if (sectionName === 'orders') {
    loadOrders();
  }
  if (sectionName === 'inbox') {
    loadMessages();
  }
}

// ========================================
// REALTIME SUBSCRIPTION
// ========================================
function subscribeToRealtime() {
  if (realtimeChannel) return; // Prevent duplicate subscriptions

  realtimeChannel = supabase.channel('creator-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `creator_id=eq.${currentUser.id}` },
      async () => {
        // Reload orders when changes happen
        await loadOrders();
        
        // Re-apply current active filter if the order tab is active
        const activeTab = document.querySelector('#order-tabs .section-tab.active');
        if (activeTab) {
          renderOrders(activeTab.dataset.filter);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' }, // Supabase realtime filter on OR/IN is complex, so we filter locally if needed, but since RLS restricts it, we only receive our own messages anyway!
      async () => {
        // Reload messages
        await loadMessages();
      }
    )
    .subscribe();
}

// ========================================
// PRODUCTS
// ========================================
async function loadProducts() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    products = data || [];
    renderProducts();
  } catch (error) {
    console.error('Error loading products:', error);
    showError('Failed to load products.');
  }
}

function renderProducts() {
  const grid = document.getElementById('product-grid');

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">📦</div>
        <h3>No products available</h3>
        <p>Check back later for new product listings!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map((product, index) => `
    <div class="product-card-modern stagger-${(index % 6) + 1}" data-product-id="${product.id}">
      <div class="product-image-container">
        ${product.image_url
          ? `<img src="${escUrl(product.image_url)}" alt="${escHtml(product.title)}" onerror="this.onerror=null;this.src='';this.alt='Image unavailable';" />`
          : `<span class="placeholder-icon">📦</span>`
        }
        <div class="product-badge-natural">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17 8C8 10 5 16 5 22c0-2 1-7 6-10 1-1 3-2 6-2z"/><path d="M17 8c2-4 4-5 6-5-2 2-3 5-3 8-1 1-3 2-6 2 2-1 4-2 3-5z"/></svg>
          Natural
        </div>
        <button class="btn-heart">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
      </div>
      <div class="product-content">
        <h3 class="product-title">${escHtml(product.title)}</h3>
        <div class="product-category">Hair Care</div>
        <div class="product-rating">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          <span class="rating-text">4.6 (128)</span>
        </div>
        <p class="product-desc">${escHtml(product.description || 'No description available')}</p>
        
        <div class="product-divider"></div>
        
        <div class="product-footer">
          <div class="price-block">
            <span class="price-current">₹${product.price || 0}</span>
            <span class="price-mrp">MRP ₹${(product.price || 0) + 119}</span>
          </div>
          <div class="earn-block">
            <span class="earn-label">Earn up to</span>
            <div class="earn-amount">
              ₹${(product.review_payment || 0) + (product.reel_payment || 0)}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // S4: Event delegation instead of inline onclick
  grid.querySelectorAll('.product-card-modern[data-product-id]').forEach(card => {
    card.addEventListener('click', () => window.openProductModal(card.dataset.productId));
  });
}

// Product Modal — Interest Form
window.openProductModal = function(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  // F6: Prevent duplicate applications
  const existing = orders.find(o => o.product_id === productId && !['rejected', 'completed'].includes(o.status));
  if (existing) {
    showInfo('You already have an active application for this product. Check your My Orders tab.');
    return;
  }

  const bodyHTML = `
    <div style="margin-bottom: var(--space-lg);">
      <div style="display:flex; align-items:center; gap: var(--space-md); margin-bottom: var(--space-lg); padding-bottom: var(--space-lg); border-bottom: 1px solid var(--color-border);">
        <div style="width: 60px; height: 60px; border-radius: var(--radius-md); overflow: hidden; background: var(--color-bg-secondary); flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${product.image_url ? `<img src="${escUrl(product.image_url)}" style="width:100%;height:100%;object-fit:cover;" />` : '📦'}
        </div>
        <div>
          <h4 style="font-size: 0.95rem; margin-bottom: 0.15rem;">${escHtml(product.title)}</h4>
          <span class="product-price" style="font-size: 1rem;">₹${product.price}</span>
          <span style="font-size: 0.8rem; color: var(--color-accent-green); margin-left: var(--space-sm);">Earn ₹${(product.review_payment || 0) + (product.reel_payment || 0)}</span>
        </div>
      </div>
    </div>
    <form id="interest-form">
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label class="form-label">Your Name</label>
        <input type="text" class="form-input" id="interest-name" value="${escHtml(currentUser.displayName || '')}" required />
      </div>
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label class="form-label">Contact Number</label>
        <input type="tel" class="form-input" id="interest-phone" placeholder="+91 98765 43210" pattern="[0-9]{10,15}" title="Enter a valid phone number (10-15 digits)" required />
      </div>
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label class="form-label">Instagram ID</label>
        <input type="text" class="form-input" id="interest-instagram" placeholder="yourusername" required />
      </div>
      <button type="submit" class="btn btn-primary btn-lg w-full" id="interest-submit-btn">
        Apply & Go to ${product.platform || 'Amazon'} →
      </button>
    </form>
    <p style="font-size: 0.75rem; color: var(--color-text-muted); text-align: center; margin-top: var(--space-md);">
      After submitting, you'll be redirected to ${product.platform || 'Amazon'} to purchase the product.
    </p>
  `;

  openModal('Apply for Product', bodyHTML);

  // Handle form submit
  document.getElementById('interest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('interest-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      // D8: Normalize Instagram handle — strip leading @
      const igRaw = document.getElementById('interest-instagram').value.trim();
      const igNormalized = igRaw.replace(/^@/, '');

      const orderData = {
        creator_id: currentUser.id,
        product_id: product.id,
        creator_name: document.getElementById('interest-name').value.trim(),
        contact_number: document.getElementById('interest-phone').value.trim(),
        instagram_id: igNormalized,
        status: 'interested',
        product_title: product.title,
        product_price: product.price,
      };

      // F4: Try to snapshot payment amounts (columns may not exist yet)
      let { error } = await supabase.from('orders').insert({
        ...orderData,
        review_payment: product.review_payment || 0,
        reel_payment: product.reel_payment || 0,
      });

      // If snapshot columns don't exist, retry without them
      if (error) {
        const retry = await supabase.from('orders').insert(orderData);
        if (retry.error) throw retry.error;
      }

      closeModal();

      // Load orders and switch to My Orders tab
      await loadOrders();
      switchToSection('orders');

      showSuccess(`✅ Application submitted! Go to the ${product.platform || 'Amazon'} tab to purchase the product, then come back here to upload your purchase screenshot.`);

      // F3: Open Platform synchronously (no setTimeout) to avoid popup blocker
      if (product.amazon_url) {
        window.open(product.amazon_url, '_blank', 'noopener');
      }
    } catch (error) {
      console.error('Error submitting interest:', error);
      showError('Failed to submit. Please try again.');
      btn.disabled = false;
      btn.textContent = `Apply & Go to ${product.platform || 'Amazon'} →`;
    }
  });
};

// ========================================
// ORDERS
// ========================================
async function loadOrders() {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('creator_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    orders = data || [];

    // Update count badge
    const countEl = document.getElementById('orders-count');
    if (orders.length > 0) {
      countEl.textContent = orders.length;
      countEl.style.display = 'inline-flex';
    } else {
      countEl.style.display = 'none';
    }

    renderOrders();
  } catch (error) {
    console.error('Error loading orders:', error);
    showError('Failed to load orders. Please refresh the page.');
  }
}

function setupOrderTabs() {
  const tabs = document.querySelectorAll('#order-tabs .section-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderOrders(tab.dataset.filter);
    });
  });
}

function renderOrders(filter = 'all') {
  const list = document.getElementById('orders-list');

  let filtered = orders;
  if (filter === 'active') {
    filtered = orders.filter(o => !['completed'].includes(o.status));
  } else if (filter === 'pending') {
    // F1: Added review_verified + F10: Added review_rejected
    filtered = orders.filter(o => ['interested', 'rejected', 'refunded', 'screenshot_verified', 'screenshot_rejected', 'review_verified', 'reel_rejected', 'review_rejected'].includes(o.status));
  } else if (filter === 'completed') {
    filtered = orders.filter(o => o.status === 'completed');
  }

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <h3>No orders found</h3>
        <p>${filter === 'all' ? 'Browse products and apply to start earning!' : 'No orders match this filter.'}</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map((order, i) => {
    const actions = getOrderActions(order);
    return `
      <div class="order-card stagger-${(i % 6) + 1}">
        <div class="order-card-header">
          <h4>${escHtml(order.product_title || 'Product')}</h4>
          ${getStatusBadge(order.status)}
        </div>
        ${getStatusTimeline(order.status)}
        <div class="order-card-details">
          <div class="order-detail-item">
            <label>Product Price</label>
            <span>₹${order.product_price || 0}</span>
          </div>
          <div class="order-detail-item">
            <label>Instagram</label>
            <span>${escHtml(order.instagram_id)}</span>
          </div>
          <div class="order-detail-item">
            <label>Applied On</label>
            <span>${new Date(order.created_at).toLocaleDateString()}</span>
          </div>
          ${order.amazon_order_id ? `
            <div class="order-detail-item">
              <label>Order ID</label>
              <span style="font-family: monospace; font-size: 0.8rem;">${escHtml(order.amazon_order_id)}</span>
            </div>
          ` : ''}
          ${order.upi_id ? `
            <div class="order-detail-item">
              <label>UPI ID</label>
              <span style="color: var(--color-accent-teal);">${escHtml(order.upi_id)}</span>
            </div>
          ` : ''}
          ${order.refund_amount ? `
            <div class="order-detail-item">
              <label>Refund</label>
              <span style="color: var(--color-accent-green);">₹${order.refund_amount}</span>
            </div>
          ` : ''}
          ${order.payment_amount ? `
            <div class="order-detail-item">
              <label>Payment</label>
              <span style="color: var(--color-accent-green);">₹${order.payment_amount}</span>
            </div>
          ` : ''}
        </div>
        ${actions ? `<div class="order-actions">${actions}</div>` : ''}
      </div>
    `;
  }).join('');

  // S4: Event delegation for action buttons (replaces inline onclick)
  list.querySelectorAll('[data-action="upload-screenshot"]').forEach(btn => {
    btn.addEventListener('click', () => window.uploadScreenshot(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="resubmit-screenshot"]').forEach(btn => {
    btn.addEventListener('click', () => window.uploadScreenshot(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="go-amazon"]').forEach(btn => {
    btn.addEventListener('click', () => window.goToAmazon(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="submit-review"]').forEach(btn => {
    btn.addEventListener('click', () => window.submitReview(btn.dataset.id));
  });
  list.querySelectorAll('[data-action="submit-reel"]').forEach(btn => {
    btn.addEventListener('click', () => window.submitReel(btn.dataset.id));
  });
}

function getOrderActions(order) {
  // S4: All user-controlled text is escaped via escHtml
  switch (order.status) {
    case 'interested':
      // Get platform if available
      const platform = products.find(p => p.id === order.product_id)?.platform || 'Amazon';
      return `
        <button class="btn btn-primary btn-sm" data-action="upload-screenshot" data-id="${order.id}">Submit Purchase Proof</button>
        ${order.product_id ? `<button class="btn btn-secondary btn-sm" data-action="go-amazon" data-id="${order.product_id}">Go to ${platform}</button>` : ''}
      `;
    case 'screenshot_uploaded':
      return `<span style="font-size: 0.8rem; color: var(--color-text-muted);">Waiting for admin verification...</span>`;
    case 'screenshot_verified':
      return `<span style="font-size: 0.8rem; color: var(--color-accent-green);">Verified! Refund will be processed soon.</span>`;
    case 'refunded':
      return `
        <button class="btn btn-primary btn-sm" data-action="submit-review" data-id="${order.id}">Submit Review + Proof</button>
      `;
    case 'review_submitted':
      return `<span style="font-size: 0.8rem; color: var(--color-text-muted);">Review under verification by admin...</span>`;
    case 'review_verified':
      return `
        <button class="btn btn-primary btn-sm" data-action="submit-reel" data-id="${order.id}">Submit Reel</button>
        <span style="font-size: 0.8rem; color: var(--color-accent-green);">Review verified! Now submit your reel.</span>
      `;
    case 'reel_submitted':
      return `<span style="font-size: 0.8rem; color: var(--color-text-muted);">Reel under review. Payment will be processed soon.</span>`;
    case 'completed':
      return `<span style="font-size: 0.8rem; color: var(--color-accent-green);">Completed! Payment of ₹${order.payment_amount || 0} processed.</span>`;
    case 'reel_rejected':
      return `
        <div style="margin-bottom: var(--space-sm);">
          <span style="font-size: 0.8rem; color: var(--color-accent-red); display: block; margin-bottom: var(--space-sm);">⚠️ Reel rejected: ${escHtml(order.admin_notes || 'Please resubmit your reel.')}</span>
          <button class="btn btn-primary btn-sm" data-action="submit-reel" data-id="${order.id}">Resubmit Reel</button>
        </div>
      `;
    case 'review_rejected':
      return `
        <div style="margin-bottom: var(--space-sm);">
          <span style="font-size: 0.8rem; color: var(--color-accent-red); display: block; margin-bottom: var(--space-sm);">⚠️ Review rejected: ${escHtml(order.admin_notes || 'Please resubmit your review.')}</span>
          <button class="btn btn-primary btn-sm" data-action="submit-review" data-id="${order.id}">Resubmit Review</button>
        </div>
      `;
    case 'screenshot_rejected':
      return `
        <div style="margin-bottom: var(--space-sm);">
          <span style="font-size: 0.8rem; color: var(--color-accent-red); display: block; margin-bottom: var(--space-sm);">⚠️ Screenshot rejected: ${escHtml(order.admin_notes || 'Please resubmit your purchase proof.')}</span>
          <button class="btn btn-primary btn-sm" data-action="resubmit-screenshot" data-id="${order.id}">Resubmit Purchase Proof</button>
        </div>
      `;
    case 'rejected':
      return `
        <div style="margin-bottom: var(--space-sm);">
          <span style="font-size: 0.8rem; color: var(--color-accent-red); display: block; margin-bottom: var(--space-sm);">⚠️ Rejected: ${escHtml(order.admin_notes || 'This order was rejected.')}</span>
          <button class="btn btn-primary btn-sm" data-action="resubmit-screenshot" data-id="${order.id}">Resubmit Purchase Proof</button>
        </div>
      `;
    default:
      return '';
  }
}

// ========================================
// UPLOAD PURCHASE SCREENSHOT
// ========================================
window.uploadScreenshot = function(orderId) {
  const bodyHTML = `
    <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-lg);">
      Fill in your purchase details and upload a screenshot of your e-commerce order confirmation.
    </p>
    <form id="screenshot-form">
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label class="form-label">Order ID</label>
        <input type="text" class="form-input" id="amazon-order-id" placeholder="e.g. 402-1234567-8901234" required />
      </div>
      <div class="form-group" style="margin-bottom: var(--space-md);">
        <label class="form-label">UPI ID (for refund)</label>
        <input type="text" class="form-input" id="upi-id" placeholder="e.g. yourname@upi or 9876543210@paytm" required />
      </div>
      <label class="form-label" style="margin-bottom: var(--space-sm); display: block;">Purchase Proof Screenshot</label>
      <div id="screenshot-upload-area"></div>
      <button type="submit" class="btn btn-primary btn-lg w-full" id="upload-screenshot-btn" style="margin-top: var(--space-lg);" disabled>
        Submit Purchase Proof
      </button>
    </form>
  `;

  openModal('Submit Purchase Proof', bodyHTML);

  const orderIdInput = document.getElementById('amazon-order-id');
  const upiInput = document.getElementById('upi-id');

  let uploader = createUploadArea('screenshot-upload-area', {
    accept: 'image/*',
    sublabel: 'PNG, JPG, WEBP (max 10MB)',
    onFileSelected: () => checkFormReady()
  });

  orderIdInput.addEventListener('input', checkFormReady);
  upiInput.addEventListener('input', checkFormReady);

  function checkFormReady() {
    const hasOrderId = orderIdInput.value.trim().length > 0;
    const hasUpi = upiInput.value.trim().length > 0;
    const hasFile = uploader.getFile() !== null;
    document.getElementById('upload-screenshot-btn').disabled = !(hasOrderId && hasUpi && hasFile);
  }

  document.getElementById('screenshot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = uploader.getFile();
    const amazonOrderId = orderIdInput.value.trim();
    const upiId = upiInput.value.trim();
    if (!file || !amazonOrderId || !upiId) return;

    const btn = document.getElementById('upload-screenshot-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
      // F6: Check for duplicate Order ID to prevent refund farming
      const { data: dupes, error: dupeErr } = await supabase
        .from('orders')
        .select('id')
        .eq('amazon_order_id', amazonOrderId)
        .neq('id', orderId)
        .limit(1);
      if (!dupeErr && dupes && dupes.length > 0) {
        showError('This Order ID has already been used on another order. Each order must have a unique Order ID.');
        btn.disabled = false;
        btn.textContent = 'Submit Purchase Proof';
        return;
      }

      const path = `screenshots/${currentUser.id}/${orderId}/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);

      // F5: Status guard
      const { data, error } = await supabase
        .from('orders')
        .update({
          screenshot_url: url,
          amazon_order_id: amazonOrderId,
          upi_id: upiId,
          status: 'screenshot_uploaded',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .in('status', ['interested', 'screenshot_rejected', 'rejected'])
        .select();

      if (error) throw error;

      closeModal();
      showSuccess('Purchase proof submitted successfully! Admin will verify it soon.');
      await loadOrders();
    } catch (error) {
      console.error('Upload error:', error);
      showError(error.message || 'Failed to upload. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Purchase Proof';
    }
  });
};

// ========================================
// SUBMIT REVIEW + REVIEW PROOF
// ========================================
window.submitReview = function(orderId) {
  const bodyHTML = `
    <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-lg);">
      After posting your review on Amazon, fill in the details below and upload a screenshot proving your review is live.
    </p>
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Your Review Text</label>
      <textarea class="form-textarea" id="review-text" placeholder="Paste your Amazon review here..." required></textarea>
    </div>
    <label class="form-label" style="margin-bottom: var(--space-sm); display: block;">Review Proof Screenshot</label>
    <div id="review-proof-upload-area"></div>
    <button class="btn btn-primary btn-lg w-full" id="submit-review-btn" style="margin-top: var(--space-lg);" disabled>
      Submit Review + Proof
    </button>
  `;

  openModal('Submit Review & Proof', bodyHTML);

  let uploader = createUploadArea('review-proof-upload-area', {
    accept: 'image/*',
    sublabel: 'Screenshot of your posted Amazon review',
    onFileSelected: () => {
      checkReviewReady();
    }
  });

  const reviewText = document.getElementById('review-text');
  reviewText.addEventListener('input', checkReviewReady);

  function checkReviewReady() {
    const hasText = reviewText.value.trim().length > 0;
    const hasFile = uploader.getFile() !== null;
    document.getElementById('submit-review-btn').disabled = !(hasText && hasFile);
  }

  document.getElementById('submit-review-btn').addEventListener('click', async () => {
    const file = uploader.getFile();
    const text = reviewText.value.trim();
    if (!file || !text) return;

    const btn = document.getElementById('submit-review-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      const path = `review-proofs/${currentUser.id}/${orderId}/${Date.now()}_${file.name}`;
      const url = await uploadFile(file, path);

      // F5: Status guard — allow from refunded or review_rejected
      const { data, error } = await supabase
        .from('orders')
        .update({
          review_text: text,
          review_proof_url: url,
          status: 'review_submitted',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .in('status', ['refunded', 'review_rejected'])
        .select();

      if (error) throw error;

      closeModal();
      showSuccess('Review & proof submitted!');
      await loadOrders();
    } catch (error) {
      console.error('Submit error:', error);
      showError(error.message || 'Failed to submit. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Review + Proof';
    }
  });
};

// ========================================
// SUBMIT REEL
// ========================================
window.submitReel = function(orderId) {
  const bodyHTML = `
    <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-lg);">
      Upload your reel video or paste a link to your published reel.
    </p>
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Reel Link (Instagram / YouTube)</label>
      <input type="url" class="form-input" id="reel-link" placeholder="https://www.instagram.com/reel/..." />
    </div>
    <div class="auth-divider">OR</div>
    <label class="form-label" style="margin-bottom: var(--space-sm); display: block; margin-top: var(--space-md);">Upload Reel Video</label>
    <div id="reel-upload-area"></div>
    <button class="btn btn-primary btn-lg w-full" id="submit-reel-btn" style="margin-top: var(--space-lg);" disabled>
      Submit Reel
    </button>
  `;

  openModal('Submit Reel', bodyHTML);

  let uploader = createUploadArea('reel-upload-area', {
    accept: 'video/*',
    maxSize: 100 * 1024 * 1024,
    sublabel: 'MP4, MOV (max 100MB)',
    onFileSelected: () => {
      checkReelReady();
    }
  });

  const reelLink = document.getElementById('reel-link');
  reelLink.addEventListener('input', checkReelReady);

  function checkReelReady() {
    const hasLink = reelLink.value.trim().length > 0;
    const hasFile = uploader.getFile() !== null;
    document.getElementById('submit-reel-btn').disabled = !(hasLink || hasFile);
  }

  document.getElementById('submit-reel-btn').addEventListener('click', async () => {
    const file = uploader.getFile();
    const link = reelLink.value.trim();
    if (!file && !link) return;

    const btn = document.getElementById('submit-reel-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      let reelUrl = link;

      if (file) {
        const path = `reels/${currentUser.id}/${orderId}/${Date.now()}_${file.name}`;
        reelUrl = await uploadFile(file, path);
      }

      // F5: Status guard — allow from review_verified or reel_rejected
      const { data, error } = await supabase
        .from('orders')
        .update({
          reel_url: reelUrl,
          status: 'reel_submitted',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .in('status', ['review_verified', 'reel_rejected'])
        .select();

      if (error) throw error;

      closeModal();
      showSuccess('Reel submitted! Payment will be processed after review.');
      await loadOrders();
    } catch (error) {
      console.error('Submit error:', error);
      showError(error.message || 'Failed to submit. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Reel';
    }
  });
};

// ========================================
// HELPERS
// ========================================
window.goToAmazon = async function(productId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('amazon_url, platform')
      .eq('id', productId)
      .single();

    if (data?.amazon_url) {
      // S5: Add noopener
      window.open(data.amazon_url, '_blank', 'noopener');
    } else {
      showInfo(`\${data?.platform || 'Amazon'} link not available for this product.`);
    }
  } catch (error) {
    showError('Could not open product link.');
  }
};

// ========================================
// INBOX
// ========================================
async function loadMessages() {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    // Client-side filtering just in case, though RLS should handle it
    messages = data || [];

    // Count unread messages (where receiver is us and is_read is false, broadcast usually is_read isn't tracked so let's ignore it for count)
    const unreadCount = messages.filter(m => m.receiver_id === currentUser.id && !m.is_read).length;
    
    const countEl = document.getElementById('inbox-count');
    if (unreadCount > 0) {
      countEl.textContent = unreadCount;
      countEl.style.display = 'inline-flex';
    } else {
      countEl.style.display = 'none';
    }

    renderMessages();
  } catch (error) {
    console.error('Error loading messages:', error);
    showError('Failed to load messages.');
  }
}

function renderMessages() {
  const list = document.getElementById('creator-chat-messages');
  
  if (!document.getElementById('creator-chat-send').hasAttribute('data-listener')) {
    document.getElementById('creator-chat-send').addEventListener('click', sendChatMessage);
    document.getElementById('creator-chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
    document.getElementById('creator-chat-send').setAttribute('data-listener', 'true');
  }

  // Reverse to show older at top, newer at bottom
  const chatMsgs = [...messages].reverse();

  if (chatMsgs.length === 0) {
    list.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--color-text-muted);">
        <div>Send a message to start chatting!</div>
      </div>
    `;
    return;
  }

  list.innerHTML = chatMsgs.map(msg => {
    const isBroadcast = msg.message_type === 'broadcast';
    const isFromMe = msg.sender_id === currentUser.id;
    let classes = 'chat-bubble';
    
    if (isBroadcast) classes += ' broadcast';
    else if (isFromMe) classes += ' sent';
    else classes += ' received';

    const timeString = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    let contentHtml = escHtml(msg.content);

    // Parse replies
    if (msg.content.includes('REPLY::[')) {
      const match = msg.content.match(/REPLY::\[(.*?)\]::REPLY_END(.*)/s);
      if (match) {
        const repliedText = escHtml(match[1]);
        const actualText = escHtml(match[2].trim());
        contentHtml = `
          <div class="quoted-reply">${repliedText}</div>
          ${actualText}
        `;
      }
    }

    // Parse edited label
    if (contentHtml.endsWith('(edited)')) {
      contentHtml = contentHtml.replace(/\(edited\)$/, '<span class="chat-edited-label">(edited)</span>');
    }

    return `
      <div class="${classes}">
        ${isBroadcast ? '<strong style="display:block; margin-bottom:4px; font-size:0.75rem;">Broadcast</strong>' : ''}
        ${contentHtml}
        ${msg.attachment_url ? `
          <div class="msg-attachment">
            ${msg.attachment_url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) 
              ? `<img src="${escUrl(msg.attachment_url)}" alt="Attachment" onclick="window.showImagePreview('${escUrl(msg.attachment_url)}')"/>`
              : `<a href="${escUrl(msg.attachment_url)}" target="_blank" rel="noopener noreferrer">📎 View Attachment</a>`
            }
          </div>
        ` : ''}
        <div class="bubble-meta">
          <span class="bubble-time">${timeString}</span>
          ${isFromMe ? `<span class="bubble-status" style="color: ${msg.is_read ? '#4facfe' : '#999'}">${msg.is_read ? '✓✓' : '✓'}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  list.scrollTop = list.scrollHeight;

  // Mark received unread messages as read
  const unreadIds = messages.filter(m => m.receiver_id === currentUser.id && !m.is_read).map(m => m.id);
  if (unreadIds.length > 0) {
    markAsRead(unreadIds);
  }
}

async function markAsRead(ids) {
  try {
    for (const id of ids) {
      await supabase.from('messages').update({ is_read: true }).eq('id', id);
    }
    messages.forEach(m => {
      if (ids.includes(m.id)) m.is_read = true;
    });
    document.getElementById('inbox-count').style.display = 'none';
  } catch(e) {
    console.error(e);
  }
}

async function sendChatMessage() {
  const input = document.getElementById('creator-chat-input');
  const text = input.value.trim();
  
  if (!text && !currentChatAttachment) return;

  const btn = document.getElementById('creator-chat-send');
  btn.disabled = true;

  try {
    let attachmentUrl = null;
    if (currentChatAttachment) {
      const ext = currentChatAttachment.name.split('.').pop();
      const filename = `creator_${currentUser.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      attachmentUrl = await uploadFile(currentChatAttachment, `chat-attachments/${filename}`);
    }

    const { error } = await supabase.from('messages').insert({
      sender_id: currentUser.id,
      message_type: 'to_admin',
      content: text,
      attachment_url: attachmentUrl
    });

    if (error) throw error;
    
    input.value = '';
    window.removeChatAttachment();
    await loadMessages();
  } catch (error) {
    showError('Failed to send message.');
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

window.handleChatAttachmentSelect = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    showError('File too large. Max size is 10MB.');
    return;
  }

  currentChatAttachment = file;
  const previewContainer = document.getElementById('creator-chat-attachment-preview-container');
  const previewContent = document.getElementById('creator-chat-attachment-preview-content');
  
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewContent.innerHTML = `<img src="${e.target.result}" /> <span>${escHtml(file.name)}</span>`;
    };
    reader.readAsDataURL(file);
  } else {
    previewContent.innerHTML = `<img src="/attach-file.png" style="width: 16px; height: 16px; object-fit: contain; opacity: 0.6; margin-right: 4px;" alt="File" /> <span>${escHtml(file.name)}</span>`;
  }
  
  previewContainer.classList.add('active');
  document.getElementById('creator-chat-input').focus();
};

window.removeChatAttachment = function() {
  currentChatAttachment = null;
  const input = document.getElementById('creator-chat-file-input');
  if (input) input.value = '';
  const previewContainer = document.getElementById('creator-chat-attachment-preview-container');
  if (previewContainer) {
    previewContainer.classList.remove('active');
    document.getElementById('creator-chat-attachment-preview-content').innerHTML = '';
  }
};

// Init
init();
