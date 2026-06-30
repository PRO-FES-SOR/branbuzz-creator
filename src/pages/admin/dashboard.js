// Admin Dashboard — Supabase
import { requireAuth, signOut } from '../../auth.js';
import { supabase } from '../../supabase.js';
import { showSuccess, showError, showInfo } from '../../components/toast.js';
import { openModal, closeModal, showImagePreview, confirmModal } from '../../components/modal.js';
import { getStatusBadge } from '../../components/statusBadge.js';
import { escHtml, escUrl } from '../../utils.js';

let currentUser = null;
let products = [];
let allOrders = [];
let allProfiles = [];
let allMessages = [];
let activeChatCreatorId = null;
let adminStarredChats = JSON.parse(localStorage.getItem('adminStarredChats') || '[]');
let activeSection = 'dashboard';
let currentReplyContent = null;
const PAGE_SIZE = 100;
let ordersFullyLoaded = false;
let realtimeChannel = null;

// ========================================
// INITIALIZATION
// ========================================
async function init() {
  try {
    currentUser = await requireAuth('admin');
    document.getElementById('page-loader').style.display = 'none';

    // Set admin info
    document.getElementById('sidebar-name').textContent = currentUser.displayName || 'Admin';
    document.getElementById('sidebar-avatar').textContent = (currentUser.displayName || 'A')[0].toUpperCase();

    setupNavigation();
    await loadAllData();
    subscribeToRealtime();
  } catch (error) {
    console.error('Auth error:', error);
  }
}

// ========================================
// NAVIGATION
// ========================================
function setupNavigation() {
  const sidebarLinks = document.querySelectorAll('.sidebar-link[data-section]');
  const sections = ['dashboard', 'products', 'screenshots', 'refunds', 'reviews', 'reels', 'creators', 'orders', 'inbox'];

  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      sections.forEach(s => {
        const el = document.getElementById(`section-${s}`);
        if (el) el.classList.add('hidden');
      });

      const target = document.getElementById(`section-${link.dataset.section}`);
      if (target) target.classList.remove('hidden');

      activeSection = link.dataset.section;
      document.getElementById('admin-sidebar').classList.remove('open');
      refreshSection(link.dataset.section);
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('admin-sidebar').classList.toggle('open');
  });

  document.getElementById('admin-logout-btn').addEventListener('click', async () => {
    await signOut();
    window.location.href = '/admin.html';
  });

  document.getElementById('add-product-btn').addEventListener('click', () => openProductForm());

  document.getElementById('order-status-filter').addEventListener('change', renderAllOrders);
  document.getElementById('order-search').addEventListener('input', renderAllOrders);
  document.getElementById('creator-search').addEventListener('input', renderCreators);
  document.getElementById('load-more-btn').addEventListener('click', loadMoreOrders);
}

// ========================================
// DATA LOADING
// ========================================
async function loadAllData() {
  await Promise.all([loadProducts(), loadOrders(), loadProfiles(), loadMessages()]);
  updateDashboard();
}

async function loadProducts() {
  try {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    products = data || [];
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

async function loadOrders() {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);
    if (error) throw error;
    allOrders = data || [];
    ordersFullyLoaded = (data || []).length < PAGE_SIZE;
  } catch (error) {
    console.error('Error loading orders:', error);
  }
}

async function loadMoreOrders() {
  if (ordersFullyLoaded) return;
  try {
    const from = allOrders.length;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const newRows = data || [];
    allOrders = allOrders.concat(newRows);
    ordersFullyLoaded = newRows.length < PAGE_SIZE;
    updateDashboardStats();
    refreshActiveSection();
  } catch (error) {
    console.error('Error loading more orders:', error);
  }
}

async function loadProfiles() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'creator');
    if (error) throw error;
    allProfiles = data || [];
  } catch (error) {
    console.error('Error loading profiles:', error);
  }
}

async function loadMessages() {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    allMessages = data || [];
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// D3: Admin Polling — Avoids Supabase Realtime RLS subquery limitations
function subscribeToRealtime() {
  // Poll every 5 seconds to get live updates for orders and messages
  setInterval(async () => {
    // Only fetch if tab is active to save resources
    if (document.hidden) return;
    
    await Promise.all([loadOrders(), loadMessages()]);
    updateDashboardStats();
    
    // Only refresh the active section if we are on it
    if (activeSection === 'orders') renderAllOrders();
    else if (activeSection === 'inbox' && activeChatCreatorId) {
      // Re-render chat seamlessly
      const msgContainer = document.getElementById('admin-chat-messages');
      const isAtBottom = msgContainer ? (msgContainer.scrollHeight - msgContainer.scrollTop <= msgContainer.clientHeight + 50) : true;
      
      window.selectCreatorChat(activeChatCreatorId);
      
      // Preserve scroll position if they scrolled up
      const newMsgContainer = document.getElementById('admin-chat-messages');
      if (newMsgContainer && !isAtBottom && msgContainer) {
        newMsgContainer.scrollTop = msgContainer.scrollTop;
      }
    } else {
      refreshActiveSection();
    }
  }, 5000);
}

function refreshSection(section) {
  switch (section) {
    case 'dashboard': updateDashboard(); break;
    case 'products': renderProductsTable(); break;
    case 'screenshots': renderScreenshots(); break;
    case 'refunds': renderRefunds(); break;
    case 'reviews': renderReviewProofs(); break;
    case 'reels': renderReels(); break;
    case 'creators': renderCreators(); break;
    case 'orders': renderAllOrders(); break;
    case 'inbox': renderInbox(); break;
  }
}

// ========================================
// DASHBOARD STATS (D4: stats + badges only — no full re-render)
// ========================================
function updateDashboardStats() {
  const activeProducts = products.filter(p => p.is_active).length;
  const pendingScreenshots = allOrders.filter(o => o.status === 'screenshot_uploaded').length;
  const pendingRefunds = allOrders.filter(o => o.status === 'screenshot_verified').length;
  const pendingReviews = allOrders.filter(o => o.status === 'review_submitted').length;
  const pendingReels = allOrders.filter(o => o.status === 'reel_submitted').length;
  // F9: Count all money out, not just completed orders
  const totalRefunds = allOrders
    .filter(o => o.refund_amount && o.refund_amount > 0)
    .reduce((sum, o) => sum + o.refund_amount, 0);
  const totalPayments = allOrders
    .filter(o => o.payment_amount && o.payment_amount > 0)
    .reduce((sum, o) => sum + o.payment_amount, 0);
  const totalPayouts = totalRefunds + totalPayments;

  document.getElementById('stat-products').textContent = activeProducts;
  document.getElementById('stat-orders').textContent = allOrders.length;
  document.getElementById('stat-pending-screenshots').textContent = pendingScreenshots;
  document.getElementById('stat-pending-reviews').textContent = pendingReviews;
  document.getElementById('stat-total-payouts').textContent = `\u20B9${totalPayouts.toLocaleString()}`;

  const unreadMessages = allMessages.filter(m => !m.is_read && m.message_type === 'to_admin').length;

  updateBadge('screenshot-badge', pendingScreenshots);
  updateBadge('refund-badge', pendingRefunds);
  updateBadge('review-badge', pendingReviews);
  updateBadge('reel-badge', pendingReels);
  updateBadge('admin-inbox-badge', unreadMessages);
}

// D4: Backward-compat wrapper — called from loadAllData and nav
function updateDashboard() {
  updateDashboardStats();
  refreshActiveSection();
}

// D4: Only re-render the section the admin is currently looking at
function refreshActiveSection() {
  switch (activeSection) {
    case 'dashboard':
      renderRecentOrders();
      break;
    case 'products':
      renderProductsTable();
      break;
    case 'screenshots':
      renderScreenshots();
      break;
    case 'refunds':
      renderRefunds();
      break;
    case 'reviews':
      renderReviewProofs();
      break;
    case 'reels':
      renderReels();
      break;
    case 'creators':
      renderCreators();
      break;
    case 'orders':
      renderAllOrders();
      break;
    case 'inbox':
      renderInbox();
      break;
  }
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function renderRecentOrders() {
  const body = document.getElementById('recent-orders-body');
  const recent = allOrders.slice(0, 10);

  if (recent.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 2rem; color: var(--color-text-muted);">No orders yet</td></tr>';
    return;
  }

  body.innerHTML = recent.map(order => `
    <tr>
      <td style="font-weight: 500; color: var(--color-text-primary);">${escHtml(order.creator_name)}</td>
      <td>${escHtml(order.product_title || 'Unknown')}</td>
      <td style="color: var(--color-accent-teal);">${escHtml(order.instagram_id)}</td>
      <td>${getStatusBadge(order.status)}</td>
      <td>${new Date(order.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn-eye" data-order-id="${order.id}" aria-label="View order details" title="View Details">\uD83D\uDC41</button>
      </td>
    </tr>
  `).join('');

  // Event delegation for eye buttons
  body.querySelectorAll('.btn-eye[data-order-id]').forEach(btn => {
    btn.addEventListener('click', () => window.viewOrderDetails(btn.dataset.orderId));
  });
}

// ========================================
// PRODUCT MANAGER
// ========================================
function renderProductsTable() {
  const body = document.getElementById('products-table-body');

  if (products.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 2rem; color: var(--color-text-muted);">No products. Click "Add Product" to get started.</td></tr>';
    return;
  }

  body.innerHTML = products.map(product => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap: var(--space-sm);">
          <div style="width: 40px; height: 40px; border-radius: var(--radius-sm); overflow:hidden; background: var(--color-bg-secondary); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${product.image_url ? `<img src="${product.image_url}" style="width:100%;height:100%;object-fit:cover;" />` : '📦'}
          </div>
          <div>
            <div style="font-weight: 600; color: var(--color-text-primary); font-size: 0.85rem;">${product.title}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${product.description || ''}</div>
          </div>
        </div>
      </td>
      <td style="font-weight: 600;">₹${product.price || 0}</td>
      <td style="color: var(--color-accent-green);">₹${product.review_payment || 0}</td>
      <td style="color: var(--color-accent-green);">₹${product.reel_payment || 0}</td>
      <td>${product.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-rejected">Inactive</span>'}</td>
      <td>
        <div style="display:flex; gap: var(--space-xs);">
          <button class="btn btn-secondary btn-sm" onclick="window.editProduct('${product.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="window.deleteProduct('${product.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openProductForm(product = null) {
  const isEdit = !!product;
  const currentPlatform = product?.platform || 'Amazon';
  
  const bodyHTML = `
    <form id="product-form">
      <div class="product-form">
        <div class="form-group full-width">
          <label class="form-label">Product Title</label>
          <input type="text" class="form-input" id="product-title" value="${product?.title || ''}" required />
        </div>
        <div class="form-group full-width">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="product-description">${product?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Price (₹)</label>
          <input type="number" class="form-input" id="product-price" value="${product?.price || ''}" required min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Select Platform</label>
          <select class="form-select" id="product-platform">
            <option value="Amazon" ${currentPlatform === 'Amazon' ? 'selected' : ''}>Amazon</option>
            <option value="Flipkart" ${currentPlatform === 'Flipkart' ? 'selected' : ''}>Flipkart</option>
            <option value="Meesho" ${currentPlatform === 'Meesho' ? 'selected' : ''}>Meesho</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" id="platform-url-label">${currentPlatform} URL</label>
          <input type="url" class="form-input" id="product-amazon-url" value="${product?.amazon_url || ''}" placeholder="https://${currentPlatform.toLowerCase()}..." />
        </div>
        <div class="form-group">
          <label class="form-label">Image URL</label>
          <input type="url" class="form-input" id="product-image-url" value="${product?.image_url || ''}" placeholder="https://..." />
        </div>
        <div class="form-group">
          <label class="form-label">Active</label>
          <select class="form-select" id="product-active">
            <option value="true" ${product?.is_active !== false ? 'selected' : ''}>Active</option>
            <option value="false" ${product?.is_active === false ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Review Payment (₹)</label>
          <input type="number" class="form-input" id="product-review-payment" value="${product?.review_payment || 0}" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Reel Payment (₹)</label>
          <input type="number" class="form-input" id="product-reel-payment" value="${product?.reel_payment || 0}" min="0" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-lg w-full" id="save-product-btn" style="margin-top: var(--space-xl);">
        ${isEdit ? 'Update Product' : 'Add Product'}
      </button>
    </form>
  `;

  openModal(isEdit ? 'Edit Product' : 'Add New Product', bodyHTML);

  // Dynamic label for Platform URL
  document.getElementById('product-platform').addEventListener('change', (e) => {
    const platform = e.target.value;
    document.getElementById('platform-url-label').textContent = `${platform} URL`;
    let placeholder = 'https://...';
    if (platform === 'Amazon') placeholder = 'https://amazon.in/...';
    if (platform === 'Flipkart') placeholder = 'https://flipkart.com/...';
    if (platform === 'Meesho') placeholder = 'https://meesho.com/...';
    document.getElementById('product-amazon-url').placeholder = placeholder;
  });

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-product-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const data = {
      title: document.getElementById('product-title').value,
      description: document.getElementById('product-description').value,
      price: parseFloat(document.getElementById('product-price').value),
      platform: document.getElementById('product-platform').value,
      amazon_url: document.getElementById('product-amazon-url').value,
      image_url: document.getElementById('product-image-url').value,
      is_active: document.getElementById('product-active').value === 'true',
      review_payment: parseFloat(document.getElementById('product-review-payment').value) || 0,
      reel_payment: parseFloat(document.getElementById('product-reel-payment').value) || 0,
      updated_at: new Date().toISOString()
    };

    try {
      if (isEdit) {
        const { error } = await supabase.from('products').update(data).eq('id', product.id);
        if (error) throw error;
        showSuccess('Product updated!');
      } else {
        const { error } = await supabase.from('products').insert(data);
        if (error) throw error;
        showSuccess('Product added!');
      }
      closeModal();
      await loadProducts();
      renderProductsTable();
      updateDashboard();
    } catch (error) {
      console.error('Save error:', error);
      showError('Failed to save product.');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Update Product' : 'Add Product';
    }
  });
}

window.editProduct = function(productId) {
  const product = products.find(p => p.id === productId);
  if (product) openProductForm(product);
};

window.deleteProduct = async function(productId) {
  // F7: Check for active orders before deleting
  const activeOrders = allOrders.filter(o => o.product_id === productId && !['completed', 'rejected'].includes(o.status));
  if (activeOrders.length > 0) {
    // Soft-delete: deactivate instead
    if (!confirm(`This product has ${activeOrders.length} active order(s). It will be deactivated (hidden from creators) instead of deleted. Continue?`)) return;
    try {
      const { error } = await supabase.from('products').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', productId);
      if (error) throw error;
      showSuccess('Product deactivated (hidden from new creators).');
      await loadProducts();
      renderProductsTable();
      updateDashboard();
    } catch (error) {
      showError('Failed to deactivate product.');
    }
    return;
  }

  if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
    showSuccess('Product deleted.');
    await loadProducts();
    renderProductsTable();
    updateDashboard();
  } catch (error) {
    showError('Failed to delete product.');
  }
};

// ========================================
// SCREENSHOT VERIFICATION
// ========================================
function renderScreenshots() {
  const container = document.getElementById('screenshots-list');
  const pending = allOrders.filter(o => o.status === 'screenshot_uploaded');
  const history = allOrders.filter(o => ['screenshot_verified', 'screenshot_rejected'].includes(o.status) || (o.status === 'rejected' && o.screenshot_url));

  let html = '';

  if (pending.length === 0 && history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📸</div>
        <h3>No pending screenshots</h3>
        <p>All purchase screenshots have been reviewed.</p>
      </div>
    `;
    return;
  }

  if (pending.length > 0) {
    html += `<h3 style="margin-bottom: var(--space-md); color: var(--color-text-primary); font-size: 1rem;">⏳ Pending Review (${pending.length})</h3>`;
    html += pending.map((order, i) => renderScreenshotCard(order, i, true)).join('');
  } else {
    html += `<div style="background: var(--color-bg-secondary); padding: var(--space-lg); border-radius: var(--radius-md); margin-bottom: var(--space-xl); text-align: center;"><p style="color: var(--color-text-muted);">✅ No pending screenshots to review</p></div>`;
  }

  if (history.length > 0) {
    html += `<h3 style="margin-top: var(--space-xl); margin-bottom: var(--space-md); color: var(--color-text-muted); font-size: 1rem;">📋 History (${history.length})</h3>`;
    html += history.map((order, i) => renderScreenshotCard(order, i, false)).join('');
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-preview-url]').forEach(el => {
    el.addEventListener('click', () => window.previewImage(el.dataset.previewUrl));
  });
  container.querySelectorAll('[data-action="verify-screenshot"]').forEach(btn => {
    btn.addEventListener('click', () => window.verifyScreenshot(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="reject-screenshot"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectScreenshot(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="reject-order"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectOrder(btn.dataset.id));
  });
}

function renderScreenshotCard(order, i, isPending) {
  return `
    <div class="review-card stagger-${(i % 6) + 1}" style="${!isPending ? 'opacity: 0.75;' : ''}">
      <div class="review-card-header">
        <div class="review-card-creator">
          <div class="creator-avatar">${escHtml((order.creator_name || 'C')[0].toUpperCase())}</div>
          <div>
            <div class="creator-name">${escHtml(order.creator_name)}</div>
            <div class="creator-ig">@${escHtml(order.instagram_id)} \u00B7 ${escHtml(order.contact_number)}</div>
          </div>
        </div>
        ${getStatusBadge(order.status)}
      </div>
      <div class="review-card-content">
        <div>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
            <strong>Product:</strong> ${escHtml(order.product_title || 'Unknown')}
          </p>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
            <strong>Price:</strong> \u20B9${order.product_price || 0}
          </p>
          ${order.amazon_order_id ? `
            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
              <strong>Amazon Order ID:</strong> <span style="font-family: monospace; color: var(--color-accent-orange);">${escHtml(order.amazon_order_id)}</span>
            </p>
          ` : ''}
          ${order.upi_id ? `
            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
              <strong>UPI ID:</strong> <span style="color: var(--color-accent-teal);">${escHtml(order.upi_id)}</span>
            </p>
          ` : ''}
          <p style="font-size: 0.85rem; color: var(--color-text-secondary);">
            <strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString()}
          </p>
          ${order.admin_notes && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-accent-orange); margin-top: var(--space-sm);"><strong>Admin Notes:</strong> ${escHtml(order.admin_notes)}</p>` : ''}
          ${order.updated_at && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: var(--space-xs);"><strong>Actioned:</strong> ${new Date(order.updated_at).toLocaleString()}</p>` : ''}
        </div>
        ${order.screenshot_url ? `
          <div class="review-screenshot" data-preview-url="${escUrl(order.screenshot_url)}">
            <img src="${escUrl(order.screenshot_url)}" alt="Purchase screenshot" onerror="this.onerror=null;this.src='';this.alt='Image unavailable';this.style.padding='1rem';" />
          </div>
        ` : ''}
      </div>
      ${isPending ? `
        <div class="review-card-actions">
          <button class="btn btn-success btn-sm" data-action="verify-screenshot" data-id="${order.id}">\u2713 Verify & Approve</button>
          <button class="btn btn-warning btn-sm" data-action="reject-screenshot" data-id="${order.id}">\u21A9 Reject (Can Resubmit)</button>
          <button class="btn btn-danger btn-sm" data-action="reject-order" data-id="${order.id}">\u2715 Reject Order</button>
        </div>
      ` : ''}
    </div>
  `;
}

window.verifyScreenshot = async function(orderId) {
  // D7: Confirm before verify
  if (!confirm('Verify this purchase screenshot?')) return;
  try {
    // F5: Status guard
    const { data, error } = await supabase.from('orders').update({
      status: 'screenshot_verified',
      updated_at: new Date().toISOString()
    }).eq('id', orderId).eq('status', 'screenshot_uploaded').select();
    if (error) throw error;
    if (!data || data.length === 0) {
      showInfo('Order was already updated. Refreshing...');
      await loadOrders();
      updateDashboard();
      return;
    }
    showSuccess('Screenshot verified!');
    await loadOrders();
    renderScreenshots();
    updateDashboard();
  } catch (error) {
    showError('Failed to verify.');
  }
};

// Screenshot-specific rejection — allows creator to resubmit
window.rejectScreenshot = async function(orderId) {
  const bodyHTML = `
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Reason for rejection (creator will see this)</label>
      <textarea class="form-textarea" id="ss-reject-reason" placeholder="e.g. Screenshot is blurry, wrong order shown, order ID doesn't match..." required></textarea>
    </div>
    <button class="btn btn-danger btn-lg w-full" id="confirm-ss-reject-btn">Reject Screenshot (Creator Can Resubmit)</button>
  `;

  openModal('Reject Screenshot', bodyHTML);

  document.getElementById('confirm-ss-reject-btn').addEventListener('click', async () => {
    const reason = document.getElementById('ss-reject-reason').value.trim();
    if (!reason) {
      showError('Please provide a reason.');
      return;
    }

    try {
      const { data, error } = await supabase.from('orders').update({
        status: 'screenshot_rejected',
        admin_notes: reason,
        screenshot_url: null,
        updated_at: new Date().toISOString()
      }).eq('id', orderId).eq('status', 'screenshot_uploaded').select();
      if (error) throw error;
      if (!data || data.length === 0) {
        showInfo('Order was already updated. Refreshing...');
        closeModal();
        await loadOrders();
        updateDashboard();
        return;
      }
      closeModal();
      showSuccess('Screenshot rejected. Creator can now resubmit.');
      await loadOrders();
      updateDashboard();
      renderScreenshots();
      renderAllOrders();
    } catch (error) {
      showError('Failed to reject screenshot.');
    }
  });
};

// Refund marking
window.markRefunded = async function(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  const bodyHTML = `
    ${order?.upi_id ? `
      <div style="background: var(--color-bg-secondary); padding: var(--space-md); border-radius: var(--radius-md); margin-bottom: var(--space-lg);">
        <p style="font-size: 0.85rem; color: var(--color-text-muted);">Creator's UPI ID: <strong style="color: var(--color-accent-teal);">${order.upi_id}</strong></p>
        ${order.amazon_order_id ? `<p style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: var(--space-xs);">Amazon Order: <strong style="color: var(--color-accent-orange); font-family: monospace;">${order.amazon_order_id}</strong></p>` : ''}
      </div>
    ` : ''}
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Refund Amount (₹)</label>
      <input type="number" class="form-input" id="refund-amount" value="${order?.product_price || ''}" placeholder="Enter refund amount" required min="0" />
    </div>
    <button class="btn btn-success btn-lg w-full" id="confirm-refund-btn">Confirm Refund</button>
  `;

  openModal('Mark as Refunded', bodyHTML);

  document.getElementById('confirm-refund-btn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('refund-amount').value);
    if (!amount || amount <= 0) {
      showError('Please enter a valid amount.');
      return;
    }

    try {
      // F5: Status guard on refund
      const { data, error } = await supabase.from('orders').update({
        status: 'refunded',
        refund_amount: amount,
        updated_at: new Date().toISOString()
      }).eq('id', orderId).eq('status', 'screenshot_verified').select();
      if (error) throw error;
      if (!data || data.length === 0) {
        showInfo('Order was already updated. Refreshing...');
        closeModal();
        await loadOrders();
        updateDashboard();
        return;
      }
      closeModal();
      showSuccess('Marked as refunded!');
      await loadOrders();
      updateDashboard();
      renderRefunds();
      renderAllOrders();
    } catch (error) {
      showError('Failed to update.');
    }
  });
};

// ========================================
// PENDING REFUNDS (F8)
// ========================================
function renderRefunds() {
  const container = document.getElementById('refunds-list');
  if (!container) return;
  const pending = allOrders.filter(o => o.status === 'screenshot_verified');
  const history = allOrders.filter(o => o.status !== 'screenshot_verified' && o.refund_amount && o.refund_amount > 0);

  let html = '';

  if (pending.length === 0 && history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\uD83D\uDCB8</div>
        <h3>No pending refunds</h3>
        <p>All verified screenshots have been refunded.</p>
      </div>
    `;
    return;
  }

  if (pending.length > 0) {
    html += `<h3 style="margin-bottom: var(--space-md); color: var(--color-text-primary); font-size: 1rem;">⏳ Pending Refunds (${pending.length})</h3>`;
    html += pending.map((order, i) => renderRefundCard(order, i, true)).join('');
  } else {
    html += `<div style="background: var(--color-bg-secondary); padding: var(--space-lg); border-radius: var(--radius-md); margin-bottom: var(--space-xl); text-align: center;"><p style="color: var(--color-text-muted);">✅ No pending refunds to process</p></div>`;
  }

  if (history.length > 0) {
    html += `<h3 style="margin-top: var(--space-xl); margin-bottom: var(--space-md); color: var(--color-text-muted); font-size: 1rem;">📋 Refund History (${history.length})</h3>`;
    html += history.map((order, i) => renderRefundCard(order, i, false)).join('');
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-action="mark-refunded"]').forEach(btn => {
    btn.addEventListener('click', () => window.markRefunded(btn.dataset.id));
  });
}

function renderRefundCard(order, i, isPending) {
  return `
    <div class="review-card stagger-${(i % 6) + 1}" style="${!isPending ? 'opacity: 0.75;' : ''}">
      <div class="review-card-header">
        <div class="review-card-creator">
          <div class="creator-avatar">${escHtml((order.creator_name || 'C')[0].toUpperCase())}</div>
          <div>
            <div class="creator-name">${escHtml(order.creator_name)}</div>
            <div class="creator-ig">@${escHtml(order.instagram_id)}</div>
          </div>
        </div>
        ${getStatusBadge(order.status)}
      </div>
      <div class="review-card-content">
        <div>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
            <strong>Product:</strong> ${escHtml(order.product_title || 'Unknown')}
          </p>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm);">
            <strong>Price:</strong> \u20B9${order.product_price || 0}
          </p>
          ${order.upi_id ? `
            <p style="font-size: 0.85rem; margin-bottom: var(--space-sm);">
              <strong>UPI ID:</strong> <span style="color: var(--color-accent-teal); font-weight: 600;">${escHtml(order.upi_id)}</span>
            </p>
          ` : '<p style="font-size: 0.85rem; color: var(--color-accent-red);">\u26A0 No UPI ID provided</p>'}
          ${order.amazon_order_id ? `
            <p style="font-size: 0.85rem; color: var(--color-text-secondary);">
              <strong>Amazon Order:</strong> <span style="font-family: monospace;">${escHtml(order.amazon_order_id)}</span>
            </p>
          ` : ''}
          ${!isPending && order.refund_amount ? `<p style="font-size: 0.85rem; color: var(--color-accent-green); margin-top: var(--space-sm);"><strong>Refunded:</strong> \u20B9${order.refund_amount}</p>` : ''}
          ${order.updated_at && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: var(--space-xs);"><strong>Actioned:</strong> ${new Date(order.updated_at).toLocaleString()}</p>` : ''}
        </div>
      </div>
      ${isPending ? `
        <div class="review-card-actions">
          <button class="btn btn-success btn-sm" data-action="mark-refunded" data-id="${order.id}">\uD83D\uDCB8 Mark Refunded</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ========================================
// REVIEW PROOF VERIFICATION
// ========================================
function renderReviewProofs() {
  const container = document.getElementById('reviews-list');
  const pending = allOrders.filter(o => o.status === 'review_submitted');
  const history = allOrders.filter(o => ['review_verified', 'review_rejected'].includes(o.status) || (o.review_text && ['completed', 'reel_submitted', 'reel_rejected'].includes(o.status)));

  let html = '';

  if (pending.length === 0 && history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⭐</div>
        <h3>No pending review proofs</h3>
        <p>All review proofs have been verified.</p>
      </div>
    `;
    return;
  }

  if (pending.length > 0) {
    html += `<h3 style="margin-bottom: var(--space-md); color: var(--color-text-primary); font-size: 1rem;">⏳ Pending Review (${pending.length})</h3>`;
    html += pending.map((order, i) => renderReviewCard(order, i, true)).join('');
  } else {
    html += `<div style="background: var(--color-bg-secondary); padding: var(--space-lg); border-radius: var(--radius-md); margin-bottom: var(--space-xl); text-align: center;"><p style="color: var(--color-text-muted);">✅ No pending review proofs to verify</p></div>`;
  }

  if (history.length > 0) {
    html += `<h3 style="margin-top: var(--space-xl); margin-bottom: var(--space-md); color: var(--color-text-muted); font-size: 1rem;">📋 History (${history.length})</h3>`;
    html += history.map((order, i) => renderReviewCard(order, i, false)).join('');
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-preview-url]').forEach(el => {
    el.addEventListener('click', () => window.previewImage(el.dataset.previewUrl));
  });
  container.querySelectorAll('[data-action="approve-review"]').forEach(btn => {
    btn.addEventListener('click', () => window.approveReview(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="reject-review"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectReview(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="reject-order"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectOrder(btn.dataset.id));
  });
}

function renderReviewCard(order, i, isPending) {
  return `
    <div class="review-card stagger-${(i % 6) + 1}" style="${!isPending ? 'opacity: 0.75;' : ''}">
      <div class="review-card-header">
        <div class="review-card-creator">
          <div class="creator-avatar">${escHtml((order.creator_name || 'C')[0].toUpperCase())}</div>
          <div>
            <div class="creator-name">${escHtml(order.creator_name)}</div>
            <div class="creator-ig">@${escHtml(order.instagram_id)}</div>
          </div>
        </div>
        ${getStatusBadge(order.status)}
      </div>
      <div style="margin-bottom: var(--space-md);">
        <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: var(--space-xs);">Product: <strong style="color: var(--color-text-secondary);">${escHtml(order.product_title)}</strong></p>
      </div>
      <div class="review-card-content">
        <div>
          <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: var(--space-xs);">Review Text:</p>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); background: var(--color-bg-secondary); padding: var(--space-md); border-radius: var(--radius-md); line-height: 1.6;">
            "${escHtml(order.review_text || 'No review text provided')}"
          </p>
          ${order.admin_notes && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-accent-orange); margin-top: var(--space-sm);"><strong>Admin Notes:</strong> ${escHtml(order.admin_notes)}</p>` : ''}
          ${order.updated_at && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: var(--space-xs);"><strong>Actioned:</strong> ${new Date(order.updated_at).toLocaleString()}</p>` : ''}
        </div>
        <div>
          <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: var(--space-xs);">Review Proof Screenshot:</p>
          ${order.review_proof_url ? `
            <div class="review-screenshot" data-preview-url="${escUrl(order.review_proof_url)}">
              <img src="${escUrl(order.review_proof_url)}" alt="Review proof" onerror="this.onerror=null;this.src='';this.alt='Image unavailable';this.style.padding='1rem';" />
            </div>
          ` : '<p style="color: var(--color-text-muted); font-size: 0.85rem;">No screenshot provided</p>'}
        </div>
      </div>
      ${isPending ? `
        <div class="review-card-actions">
          <button class="btn btn-success btn-sm" data-action="approve-review" data-id="${order.id}">\u2713 Verify Review</button>
          <button class="btn btn-warning btn-sm" data-action="reject-review" data-id="${order.id}">\u21A9 Needs Improvement</button>
          <button class="btn btn-danger btn-sm" data-action="reject-order" data-id="${order.id}">\u2715 Reject Order</button>
        </div>
      ` : ''}
    </div>
  `;
}

window.approveReview = async function(orderId) {
  // D7: Confirm before verify
  const confirmed = await confirmModal('Verify Review', 'Are you sure you want to verify this review?');
  if (!confirmed) return;
  try {
    // F5: Status guard
    const { data, error } = await supabase.from('orders').update({
      status: 'review_verified',
      updated_at: new Date().toISOString()
    }).eq('id', orderId).eq('status', 'review_submitted').select();
    if (error) throw error;
    if (!data || data.length === 0) {
      showInfo('Order was already updated. Refreshing...');
      await loadOrders();
      updateDashboard();
      return;
    }
    showSuccess('Review verified! Creator can now submit their reel.');
    await loadOrders();
    renderReviewProofs();
    updateDashboard();
  } catch (error) {
    showError('Failed to approve.');
  }
};

// F10: Reject review — creator can resubmit
window.rejectReview = async function(orderId) {
  const reason = prompt('Reason for review rejection (will be shown to creator):');
  if (reason === null) return; // cancelled

  try {
    const { data, error } = await supabase.from('orders').update({
      status: 'review_rejected',
      admin_notes: reason || 'Review needs improvement. Please resubmit.',
      review_text: null,
      review_proof_url: null,
      updated_at: new Date().toISOString()
    }).eq('id', orderId).eq('status', 'review_submitted').select();
    if (error) throw error;
    if (!data || data.length === 0) {
      showInfo('Order was already updated. Refreshing...');
      await loadOrders();
      updateDashboard();
      return;
    }
    showSuccess('Review rejected. Creator will be asked to resubmit.');
    await loadOrders();
    renderReviewProofs();
    updateDashboard();
  } catch (error) {
    showError('Failed to reject review.');
  }
};

// ========================================
// REEL REVIEW
// ========================================
function renderReels() {
  const container = document.getElementById('reels-list');
  const pending = allOrders.filter(o => o.status === 'reel_submitted');
  const history = allOrders.filter(o => ['reel_rejected', 'completed'].includes(o.status) && (o.reel_url || o.payment_amount));

  let html = '';

  if (pending.length === 0 && history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎬</div>
        <h3>No pending reels</h3>
        <p>All submitted reels have been reviewed.</p>
      </div>
    `;
    return;
  }

  if (pending.length > 0) {
    html += `<h3 style="margin-bottom: var(--space-md); color: var(--color-text-primary); font-size: 1rem;">⏳ Pending Review (${pending.length})</h3>`;
    html += pending.map((order, i) => renderReelCard(order, i, true)).join('');
  } else {
    html += `<div style="background: var(--color-bg-secondary); padding: var(--space-lg); border-radius: var(--radius-md); margin-bottom: var(--space-xl); text-align: center;"><p style="color: var(--color-text-muted);">✅ No pending reels to review</p></div>`;
  }

  if (history.length > 0) {
    html += `<h3 style="margin-top: var(--space-xl); margin-bottom: var(--space-md); color: var(--color-text-muted); font-size: 1rem;">📋 History (${history.length})</h3>`;
    html += history.map((order, i) => renderReelCard(order, i, false)).join('');
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-action="approve-reel"]').forEach(btn => {
    btn.addEventListener('click', () => window.approveReel(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="reject-reel"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectReel(btn.dataset.id));
  });
}

function renderReelCard(order, i, isPending) {
  const isExternal = order.reel_url && order.reel_url.startsWith('http') && !order.reel_url.includes('supabase');
  return `
    <div class="review-card stagger-${(i % 6) + 1}" style="${!isPending ? 'opacity: 0.75;' : ''}">
      <div class="review-card-header">
        <div class="review-card-creator">
          <div class="creator-avatar">${escHtml((order.creator_name || 'C')[0].toUpperCase())}</div>
          <div>
            <div class="creator-name">${escHtml(order.creator_name)}</div>
            <div class="creator-ig">@${escHtml(order.instagram_id)}</div>
          </div>
        </div>
        ${getStatusBadge(order.status)}
      </div>
      <div style="margin-bottom: var(--space-md);">
        <p style="font-size: 0.8rem; color: var(--color-text-muted);">Product: <strong style="color: var(--color-text-secondary);">${escHtml(order.product_title)}</strong></p>
      </div>
      <div style="margin-bottom: var(--space-md);">
        <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: var(--space-xs);">Reel:</p>
        ${order.reel_url ? (
          isExternal
            ? `<a href="${escUrl(order.reel_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="margin-top: var(--space-xs);">🔗 View Reel on Instagram/YouTube</a>`
            : `<a href="${escUrl(order.reel_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="margin-top: var(--space-xs);">📥 Download Reel Video</a>`
        ) : '<p style="color: var(--color-text-muted);">No reel provided</p>'}
        ${order.admin_notes && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-accent-orange); margin-top: var(--space-sm);"><strong>Admin Notes:</strong> ${escHtml(order.admin_notes)}</p>` : ''}
        ${order.payment_amount && !isPending ? `<p style="font-size: 0.85rem; color: var(--color-accent-green); margin-top: var(--space-sm);"><strong>Payment:</strong> \u20B9${order.payment_amount}</p>` : ''}
        ${order.updated_at && !isPending ? `<p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: var(--space-xs);"><strong>Actioned:</strong> ${new Date(order.updated_at).toLocaleString()}</p>` : ''}
      </div>
      ${isPending ? `
        <div class="review-card-actions">
          <button class="btn btn-success btn-sm" data-action="approve-reel" data-id="${order.id}">\u2713 Approve & Pay</button>
          <button class="btn btn-danger btn-sm" data-action="reject-reel" data-id="${order.id}">\u2715 Reject Reel</button>
        </div>
      ` : ''}
    </div>
  `;
}

window.approveReel = async function(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  // F4: Use snapshotted values first, fall back to product for old orders
  const product = products.find(p => p.id === order.product_id);
  const reviewPay = order.review_payment || product?.review_payment || 0;
  const reelPay = order.reel_payment || product?.reel_payment || 0;
  const totalPay = reviewPay + reelPay;

  const bodyHTML = `
    <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: var(--space-lg);">
      Mark this order as completed and record the payment amount.
    </p>
    ${order.upi_id ? `
      <div style="background: var(--color-bg-secondary); padding: var(--space-md); border-radius: var(--radius-md); margin-bottom: var(--space-lg);">
        <p style="font-size: 0.85rem; color: var(--color-text-muted);">Pay to UPI: <strong style="color: var(--color-accent-teal);">${escHtml(order.upi_id)}</strong></p>
      </div>
    ` : ''}
    <div style="background: var(--color-bg-secondary); padding: var(--space-md); border-radius: var(--radius-md); margin-bottom: var(--space-lg);">
      <p style="font-size: 0.85rem; color: var(--color-text-muted);">Review Payment: <strong style="color: var(--color-accent-green);">₹${reviewPay}</strong></p>
      <p style="font-size: 0.85rem; color: var(--color-text-muted);">Reel Payment: <strong style="color: var(--color-accent-green);">₹${reelPay}</strong></p>
    </div>
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Total Payment Amount (₹)</label>
      <input type="number" class="form-input" id="payment-amount" value="${totalPay}" required min="0" />
    </div>
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Admin Notes (optional)</label>
      <textarea class="form-textarea" id="admin-notes" placeholder="Any notes about this payment..."></textarea>
    </div>
    <button class="btn btn-success btn-lg w-full" id="confirm-payment-btn">✓ Complete & Mark Paid</button>
  `;

  openModal('Complete Order — Payment', bodyHTML);

  document.getElementById('confirm-payment-btn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const notes = document.getElementById('admin-notes').value;

    if (!amount || amount < 0) {
      showError('Please enter a valid payment amount.');
      return;
    }

    const btn = document.getElementById('confirm-payment-btn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      // F5: Status guard on payment
      const { data, error } = await supabase.from('orders').update({
        status: 'completed',
        payment_amount: amount,
        admin_notes: notes,
        updated_at: new Date().toISOString()
      }).eq('id', orderId).eq('status', 'reel_submitted').select();
      if (error) throw error;
      if (!data || data.length === 0) {
        showInfo('Order was already updated. Refreshing...');
        closeModal();
        await loadOrders();
        updateDashboard();
        return;
      }
      closeModal();
      showSuccess(`Order completed! ₹${amount} payment recorded.`);
      await loadOrders();
      renderReels();
      updateDashboard();
    } catch (error) {
      showError('Failed to update order.');
      btn.disabled = false;
      btn.textContent = '✓ Complete & Mark Paid';
    }
  });
};

// ========================================
// REJECT ORDER
// ========================================
window.rejectOrder = async function(orderId) {
  const bodyHTML = `
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Reason for rejection</label>
      <textarea class="form-textarea" id="reject-reason" placeholder="Explain why this is being rejected..." required></textarea>
    </div>
    <button class="btn btn-danger btn-lg w-full" id="confirm-reject-btn">Reject Order</button>
  `;

  openModal('Reject Order', bodyHTML);

  document.getElementById('confirm-reject-btn').addEventListener('click', async () => {
    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) {
      showError('Please provide a reason.');
      return;
    }

    try {
      const { error } = await supabase.from('orders').update({
        status: 'rejected',
        admin_notes: reason,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);
      if (error) throw error;
      closeModal();
      showSuccess('Order rejected.');
      await loadOrders();
      updateDashboard();
      renderScreenshots();
      renderReviewProofs();
      renderReels();
      renderAllOrders();
    } catch (error) {
      showError('Failed to reject.');
    }
  });
};

// Reel-specific rejection — allows creator to resubmit
window.rejectReel = async function(orderId) {
  const bodyHTML = `
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Reason for rejection (creator will see this)</label>
      <textarea class="form-textarea" id="reel-reject-reason" placeholder="e.g. Video quality too low, wrong product shown, reel too short..." required></textarea>
    </div>
    <button class="btn btn-danger btn-lg w-full" id="confirm-reel-reject-btn">Reject Reel (Creator Can Resubmit)</button>
  `;

  openModal('Reject Reel', bodyHTML);

  document.getElementById('confirm-reel-reject-btn').addEventListener('click', async () => {
    const reason = document.getElementById('reel-reject-reason').value.trim();
    if (!reason) {
      showError('Please provide a reason.');
      return;
    }

    try {
      const { error } = await supabase.from('orders').update({
        status: 'reel_rejected',
        admin_notes: reason,
        reel_url: null,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);
      if (error) throw error;
      closeModal();
      showSuccess('Reel rejected. Creator can now resubmit.');
      await loadOrders();
      updateDashboard();
      renderReels();
      renderAllOrders();
    } catch (error) {
      showError('Failed to reject reel.');
    }
  });
};

// ========================================
// ALL ORDERS TABLE
// ========================================
function renderAllOrders() {
  const body = document.getElementById('all-orders-body');
  const statusFilter = document.getElementById('order-status-filter').value;
  const searchQuery = document.getElementById('order-search').value.toLowerCase().trim();

  let filtered = allOrders;

  if (statusFilter) {
    filtered = filtered.filter(o => o.status === statusFilter);
  }

  if (searchQuery) {
    filtered = filtered.filter(o =>
      (o.creator_name || '').toLowerCase().includes(searchQuery) ||
      (o.instagram_id || '').toLowerCase().includes(searchQuery)
    );
  }

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 2rem; color: var(--color-text-muted);">No orders found</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(order => `
    <tr>
      <td style="font-weight: 500; color: var(--color-text-primary);">${escHtml(order.creator_name)}</td>
      <td>${escHtml(order.product_title || 'Unknown')}</td>
      <td>${escHtml(order.contact_number)}</td>
      <td style="color: var(--color-accent-teal);">@${escHtml(order.instagram_id)}</td>
      <td>${order.amazon_order_id ? `<span style="font-family: monospace; font-size: 0.75rem;">${escHtml(order.amazon_order_id)}</span>` : '<span style="color: var(--color-text-muted);">—</span>'}</td>
      <td>${order.upi_id ? `<span style="color: var(--color-accent-teal); font-size: 0.8rem;">${escHtml(order.upi_id)}</span>` : '<span style="color: var(--color-text-muted);">—</span>'}</td>
      <td>${getStatusBadge(order.status)}</td>
      <td>${new Date(order.created_at).toLocaleDateString()}</td>
      <td>
        <div style="display:flex; gap: var(--space-xs); flex-wrap: wrap; align-items: center;">
          <button class="btn-eye" data-order-id="${order.id}" aria-label="View order details" title="View Details">\uD83D\uDC41</button>
          ${getOrderActionButtons(order)}
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.btn-eye[data-order-id]').forEach(btn => {
    btn.addEventListener('click', () => window.viewOrderDetails(btn.dataset.orderId));
  });
  body.querySelectorAll('[data-action="verify-screenshot"]').forEach(btn => {
    btn.addEventListener('click', () => window.verifyScreenshot(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="reject-order"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectOrder(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="mark-refunded"]').forEach(btn => {
    btn.addEventListener('click', () => window.markRefunded(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="approve-review"]').forEach(btn => {
    btn.addEventListener('click', () => window.approveReview(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="reject-review"]').forEach(btn => {
    btn.addEventListener('click', () => window.rejectReview(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="preview-image"]').forEach(btn => {
    btn.addEventListener('click', () => window.previewImage(btn.dataset.url));
  });
  body.querySelectorAll('[data-action="approve-reel"]').forEach(btn => {
    btn.addEventListener('click', () => window.approveReel(btn.dataset.id));
  });

  // D5: Show/hide Load More button
  const loadMoreContainer = document.getElementById('load-more-container');
  if (loadMoreContainer) {
    if (ordersFullyLoaded) {
      loadMoreContainer.classList.add('hidden');
    } else {
      loadMoreContainer.classList.remove('hidden');
    }
  }
}

function getOrderActionButtons(order) {
  switch (order.status) {
    case 'screenshot_uploaded':
      return `
        <button class="btn btn-success btn-sm" data-action="verify-screenshot" data-id="${order.id}">Verify</button>
        <button class="btn btn-danger btn-sm" data-action="reject-order" data-id="${order.id}">Reject</button>
      `;
    case 'screenshot_verified':
      return `<button class="btn btn-primary btn-sm" data-action="mark-refunded" data-id="${order.id}">Mark Refunded</button>`;
    case 'review_submitted':
      return `
        <button class="btn btn-success btn-sm" data-action="approve-review" data-id="${order.id}">Verify Review</button>
        <button class="btn btn-warning btn-sm" data-action="reject-review" data-id="${order.id}">\u21A9</button>
        ${order.review_proof_url ? `<button class="btn btn-secondary btn-sm" data-action="preview-image" data-url="${escUrl(order.review_proof_url)}">View Proof</button>` : ''}
      `;
    case 'reel_submitted':
      return `<button class="btn btn-success btn-sm" data-action="approve-reel" data-id="${order.id}">Approve & Pay</button>`;
    case 'completed':
      return `<span style="font-size: 0.75rem; color: var(--color-accent-green);">₹${order.payment_amount || 0} paid</span>`;
    case 'rejected':
      return `<span style="font-size: 0.75rem; color: var(--color-accent-red);">Rejected</span>`;
    case 'screenshot_rejected':
      return `<span style="font-size: 0.75rem; color: var(--color-accent-orange);">Awaiting Screenshot Resubmit</span>`;
    case 'reel_rejected':
      return `<span style="font-size: 0.75rem; color: var(--color-accent-orange);">Awaiting Reel Resubmit</span>`;
    case 'review_rejected':
      return `<span style="font-size: 0.75rem; color: var(--color-accent-orange);">Awaiting Review Resubmit</span>`;
    default:
      return `<span style="font-size: 0.75rem; color: var(--color-text-muted);">—</span>`;
  }
}

// ========================================
// VIEW ORDER DETAILS
// ========================================
window.viewOrderDetails = function(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;

  const product = products.find(p => p.id === order.product_id);
  const formatDate = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

  // Build activity log
  const logEntries = [];
  if (order.created_at) {
    logEntries.push({ time: order.created_at, label: 'Applied / Interested', icon: '\uD83D\uDCDD', color: '#6366F1' });
  }
  const currentIdx = ['interested','screenshot_uploaded','screenshot_verified','refunded','review_submitted','review_verified','reel_submitted','reel_rejected','completed','rejected'].indexOf(order.status);

  if (order.screenshot_url) {
    logEntries.push({ time: null, label: 'Purchase Screenshot Uploaded', icon: '\uD83D\uDCF8', color: '#F59E0B' });
  }
  if (currentIdx >= 2) {
    logEntries.push({ time: null, label: 'Screenshot Verified by Admin', icon: '\u2705', color: '#10B981' });
  }
  if (order.refund_amount) {
    logEntries.push({ time: null, label: 'Refund of \u20B9' + order.refund_amount + ' Processed', icon: '\uD83D\uDCB8', color: '#0891B2' });
  }
  if (order.review_text) {
    logEntries.push({ time: null, label: 'Review Submitted', icon: '\u2B50', color: '#8B5CF6' });
  }
  if (['review_verified','reel_submitted','reel_rejected','completed'].includes(order.status)) {
    logEntries.push({ time: null, label: 'Review Verified by Admin', icon: '\u2705', color: '#10B981' });
  }
  if (order.reel_url || order.status === 'reel_rejected') {
    logEntries.push({ time: null, label: 'Reel Submitted', icon: '\uD83C\uDFAC', color: '#EC4899' });
  }
  if (order.status === 'reel_rejected') {
    logEntries.push({ time: order.updated_at, label: 'Reel Rejected \u2014 Needs Resubmission', icon: '\u26A0\uFE0F', color: '#EF4444' });
  }
  if (order.status === 'completed') {
    logEntries.push({ time: order.updated_at, label: 'Completed \u2014 \u20B9' + (order.payment_amount || 0) + ' Paid', icon: '\uD83C\uDF89', color: '#059669' });
  }
  if (order.status === 'rejected') {
    logEntries.push({ time: order.updated_at, label: 'Order Rejected', icon: '\u274C', color: '#EF4444' });
  }

  const timelineHTML = logEntries.map((entry, i) => `
    <div class="odm-timeline-item">
      <div class="odm-timeline-dot" style="background: ${entry.color};"></div>
      ${i < logEntries.length - 1 ? '<div class="odm-timeline-line"></div>' : ''}
      <div class="odm-timeline-content">
        <span class="odm-timeline-icon">${entry.icon}</span>
        <span class="odm-timeline-label">${entry.label}</span>
        ${entry.time ? `<span class="odm-timeline-time">${formatDate(entry.time)}</span>` : ''}
      </div>
    </div>
  `).join('');

  const screenshotCard = order.screenshot_url
    ? `<div class="odm-media-card">
        <div class="odm-media-label">\uD83D\uDCF8 Purchase Screenshot</div>
        <div class="odm-media-thumb" onclick="window.previewImage('${order.screenshot_url}')">
          <img src="${order.screenshot_url}" alt="Purchase screenshot" />
          <div class="odm-media-overlay">Click to enlarge</div>
        </div>
      </div>`
    : `<div class="odm-media-card odm-media-empty">
        <div class="odm-media-label">\uD83D\uDCF8 Purchase Screenshot</div>
        <div class="odm-media-placeholder">Not uploaded yet</div>
      </div>`;

  const reviewCard = order.review_proof_url
    ? `<div class="odm-media-card">
        <div class="odm-media-label">\u2B50 Review Proof</div>
        <div class="odm-media-thumb" onclick="window.previewImage('${order.review_proof_url}')">
          <img src="${order.review_proof_url}" alt="Review proof" />
          <div class="odm-media-overlay">Click to enlarge</div>
        </div>
      </div>`
    : `<div class="odm-media-card odm-media-empty">
        <div class="odm-media-label">\u2B50 Review Proof</div>
        <div class="odm-media-placeholder">Not uploaded yet</div>
      </div>`;

  let reelCard;
  if (order.reel_url) {
    const isExternal = order.reel_url.startsWith('http') && !order.reel_url.includes('supabase');
    reelCard = `<div class="odm-media-card">
      <div class="odm-media-label">\uD83C\uDFAC Reel</div>
      <a href="${order.reel_url}" target="_blank" class="odm-reel-link">${isExternal ? '\uD83D\uDD17 View Reel on Instagram/YouTube' : '\uD83D\uDCE5 Download Reel Video'}</a>
    </div>`;
  } else {
    reelCard = `<div class="odm-media-card odm-media-empty">
      <div class="odm-media-label">\uD83C\uDFAC Reel</div>
      <div class="odm-media-placeholder">Not uploaded yet</div>
    </div>`;
  }

  const bodyHTML = `
    <div class="order-detail-modal">
      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDC64 Creator Info</div>
        <div class="odm-grid">
          <div class="odm-field"><span class="odm-label">Name</span><span class="odm-value">${order.creator_name}</span></div>
          <div class="odm-field"><span class="odm-label">Instagram</span><span class="odm-value" style="color: var(--color-accent-teal);">@${order.instagram_id}</span></div>
          <div class="odm-field"><span class="odm-label">Contact</span><span class="odm-value">${order.contact_number || '\u2014'}</span></div>
          <div class="odm-field"><span class="odm-label">UPI ID</span><span class="odm-value" style="color: var(--color-accent-teal);">${order.upi_id || '\u2014'}</span></div>
        </div>
      </div>

      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCE6 Order Info</div>
        <div class="odm-grid">
          <div class="odm-field"><span class="odm-label">Product</span><span class="odm-value">${order.product_title || 'Unknown'}</span></div>
          <div class="odm-field"><span class="odm-label">Product Price</span><span class="odm-value">\u20B9${order.product_price || 0}</span></div>
          <div class="odm-field"><span class="odm-label">Amazon Order ID</span><span class="odm-value" style="font-family: monospace;">${order.amazon_order_id || '\u2014'}</span></div>
          <div class="odm-field"><span class="odm-label">Status</span><span class="odm-value">${getStatusBadge(order.status)}</span></div>
          ${order.refund_amount ? `<div class="odm-field"><span class="odm-label">Refund</span><span class="odm-value" style="color: var(--color-accent-green); font-weight: 600;">\u20B9${order.refund_amount}</span></div>` : ''}
          ${order.payment_amount ? `<div class="odm-field"><span class="odm-label">Payment</span><span class="odm-value" style="color: var(--color-accent-green); font-weight: 600;">\u20B9${order.payment_amount}</span></div>` : ''}
        </div>
      </div>

      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCCB Activity Log</div>
        <div class="odm-timeline">${timelineHTML}</div>
      </div>

      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDDBC\uFE0F Media & Proofs</div>
        <div class="odm-media-grid">${screenshotCard}${reviewCard}${reelCard}</div>
      </div>

      ${order.review_text ? `
      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCDD Review Text</div>
        <div class="odm-review-text">\u201C${order.review_text}\u201D</div>
      </div>` : ''}

      ${order.admin_notes ? `
      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCCC Admin Notes</div>
        <div class="odm-admin-notes">${order.admin_notes}</div>
      </div>` : ''}

      <div class="odm-section odm-timestamps">
        <div class="odm-section-title">\uD83D\uDD52 Timestamps</div>
        <div class="odm-grid">
          <div class="odm-field"><span class="odm-label">Created</span><span class="odm-value">${formatDate(order.created_at)}</span></div>
          <div class="odm-field"><span class="odm-label">Last Updated</span><span class="odm-value">${formatDate(order.updated_at)}</span></div>
        </div>
      </div>
    </div>
  `;

  openModal('Order Details \u2014 ' + order.creator_name, bodyHTML);
};

// ========================================
// IMAGE PREVIEW
// ========================================
window.previewImage = function(url) {
  if (url) showImagePreview(url);
};

// ========================================
// CREATORS PAGE
// ========================================
function renderCreators() {
  const body = document.getElementById('creators-table-body');
  const searchQuery = (document.getElementById('creator-search')?.value || '').toLowerCase().trim();

  // Build unique creators from orders data
  const creatorsMap = {};
  allOrders.forEach(order => {
    const cid = order.creator_id;
    if (!creatorsMap[cid]) {
      // Try to find profile for this creator
      const profile = allProfiles.find(p => p.id === cid);
      creatorsMap[cid] = {
        id: cid,
        name: order.creator_name || profile?.display_name || 'Unknown',
        instagram: order.instagram_id || '',
        contact: order.contact_number || '',
        email: profile?.email || '',
        orders: [],
        totalEarned: 0,
        completedCount: 0,
        firstOrder: order.created_at
      };
    }
    const c = creatorsMap[cid];
    c.orders.push(order);
    // Use latest name/instagram/contact if available
    if (order.creator_name) c.name = order.creator_name;
    if (order.instagram_id) c.instagram = order.instagram_id;
    if (order.contact_number) c.contact = order.contact_number;
    if (order.status === 'completed') {
      c.completedCount++;
      c.totalEarned += (order.payment_amount || 0) + (order.refund_amount || 0);
    } else if (order.refund_amount && order.refund_amount > 0) {
      c.totalEarned += order.refund_amount;
    }
    // Track earliest order
    if (order.created_at < c.firstOrder) c.firstOrder = order.created_at;
  });

  let creators = Object.values(creatorsMap);

  // Sort by most recent first
  creators.sort((a, b) => new Date(b.firstOrder) - new Date(a.firstOrder));

  // Apply search filter
  if (searchQuery) {
    creators = creators.filter(c =>
      c.name.toLowerCase().includes(searchQuery) ||
      c.email.toLowerCase().includes(searchQuery) ||
      c.instagram.toLowerCase().includes(searchQuery) ||
      c.contact.toLowerCase().includes(searchQuery)
    );
  }

  if (creators.length === 0) {
    body.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 2rem; color: var(--color-text-muted);">No creators found</td></tr>';
    return;
  }

  body.innerHTML = creators.map(creator => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 0.75rem; flex-shrink: 0;">${escHtml(creator.name[0].toUpperCase())}</div>
          <span style="font-weight: 600; color: var(--color-text-primary);">${escHtml(creator.name)}</span>
        </div>
      </td>
      <td style="font-size: 0.8rem; color: var(--color-text-secondary);">${escHtml(creator.email || '—')}</td>
      <td style="color: var(--color-accent-teal);">@${escHtml(creator.instagram || '—')}</td>
      <td style="font-size: 0.85rem;">${escHtml(creator.contact || '—')}</td>
      <td style="font-weight: 600;">${creator.orders.length}</td>
      <td style="color: var(--color-accent-green); font-weight: 600;">${creator.completedCount}</td>
      <td style="color: var(--color-accent-green); font-weight: 600;">\u20B9${creator.totalEarned.toLocaleString()}</td>
      <td style="font-size: 0.8rem;">${new Date(creator.firstOrder).toLocaleDateString()}</td>
      <td style="display: flex; gap: var(--space-xs); align-items: center;">
        <button class="btn-eye" data-creator-id="${creator.id}" aria-label="View creator details" title="View Full History">👁️</button>
        <button class="btn-message" data-chat-creator="${creator.id}" data-chat-name="${escHtml(creator.name)}" aria-label="Message Creator" title="Message Creator" style="background: transparent; border: none; cursor: pointer; font-size: 1.1rem; padding: 4px; transition: transform 0.2s;">💬</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.btn-eye[data-creator-id]').forEach(btn => {
    btn.addEventListener('click', () => window.viewCreatorDetails(btn.dataset.creatorId));
  });

  body.querySelectorAll('.btn-message[data-chat-creator]').forEach(btn => {
    btn.addEventListener('click', () => {
      // 1. Switch to Inbox section
      const inboxLink = document.querySelector('.sidebar-link[data-section="inbox"]');
      if (inboxLink) inboxLink.click();
      // 2. Open Chat
      window.openChat(btn.dataset.chatCreator, btn.dataset.chatName);
    });
  });
}

// Creator detail modal with full chronological activity log
window.viewCreatorDetails = function(creatorId) {
  const creatorOrders = allOrders.filter(o => o.creator_id === creatorId);
  if (creatorOrders.length === 0) return;

  // Gather creator info from the most recent order + profile
  const profile = allProfiles.find(p => p.id === creatorId);
  const latestOrder = creatorOrders[0];
  const creatorName = latestOrder.creator_name || profile?.display_name || 'Unknown';
  const creatorEmail = profile?.email || '';
  const creatorPassword = profile?.password_plain || '';
  const instagram = latestOrder.instagram_id || '—';
  const contact = latestOrder.contact_number || '—';
  const upiId = creatorOrders.find(o => o.upi_id)?.upi_id || '—';

  // Stats
  const totalOrders = creatorOrders.length;
  const completed = creatorOrders.filter(o => o.status === 'completed').length;
  const rejected = creatorOrders.filter(o => o.status === 'rejected').length;
  const active = creatorOrders.filter(o => !['completed', 'rejected'].includes(o.status)).length;
  const totalRefunds = creatorOrders.reduce((sum, o) => sum + (o.refund_amount || 0), 0);
  const totalPayments = creatorOrders.reduce((sum, o) => sum + (o.payment_amount || 0), 0);
  const totalEarned = totalRefunds + totalPayments;

  // Build full activity log from ALL orders, sorted by date
  const activities = [];

  const statusLabels = {
    'interested': { icon: '\uD83D\uDCDD', label: 'Applied for product', color: '#6366F1' },
    'screenshot_uploaded': { icon: '\uD83D\uDCF8', label: 'Purchase proof uploaded', color: '#F59E0B' },
    'screenshot_verified': { icon: '\u2705', label: 'Screenshot verified by admin', color: '#10B981' },
    'screenshot_rejected': { icon: '\u26A0\uFE0F', label: 'Screenshot rejected', color: '#EF4444' },
    'refunded': { icon: '\uD83D\uDCB8', label: 'Refund processed', color: '#0891B2' },
    'review_submitted': { icon: '\u2B50', label: 'Review & proof submitted', color: '#8B5CF6' },
    'review_verified': { icon: '\u2705', label: 'Review verified by admin', color: '#10B981' },
    'review_rejected': { icon: '\u26A0\uFE0F', label: 'Review rejected', color: '#EF4444' },
    'reel_submitted': { icon: '\uD83C\uDFAC', label: 'Reel submitted', color: '#EC4899' },
    'reel_rejected': { icon: '\u26A0\uFE0F', label: 'Reel rejected', color: '#EF4444' },
    'completed': { icon: '\uD83C\uDF89', label: 'Order completed', color: '#059669' },
    'rejected': { icon: '\u274C', label: 'Order rejected', color: '#EF4444' }
  };

  // For each order, reconstruct the timeline based on current status and available data
  creatorOrders.forEach(order => {
    const product = escHtml(order.product_title || 'Unknown Product');

    // Application
    activities.push({
      time: order.created_at,
      icon: '\uD83D\uDCDD',
      label: `Applied for <strong>${product}</strong>`,
      color: '#6366F1',
      orderId: order.id
    });

    const statusFlow = ['interested', 'screenshot_uploaded', 'screenshot_verified', 'refunded', 'review_submitted', 'review_verified', 'reel_submitted', 'completed'];
    const currentIdx = statusFlow.indexOf(order.status);

    // Screenshot uploaded
    if (order.screenshot_url || currentIdx >= 1 || ['screenshot_rejected', 'screenshot_verified', 'refunded', 'review_submitted', 'review_verified', 'review_rejected', 'reel_submitted', 'reel_rejected', 'completed', 'rejected'].includes(order.status)) {
      if (currentIdx >= 1 || order.screenshot_url || ['screenshot_rejected', 'rejected'].includes(order.status)) {
        activities.push({
          time: null, sortTime: order.created_at,
          icon: '\uD83D\uDCF8',
          label: `Purchase proof uploaded for <strong>${product}</strong>` + (order.amazon_order_id ? ` <span style="font-family: monospace; font-size: 0.75rem; color: var(--color-accent-orange);">${escHtml(order.amazon_order_id)}</span>` : ''),
          color: '#F59E0B',
          orderId: order.id
        });
      }
    }

    // Screenshot rejected
    if (order.status === 'screenshot_rejected') {
      activities.push({
        time: order.updated_at, sortTime: order.updated_at,
        icon: '\u26A0\uFE0F',
        label: `Screenshot rejected for <strong>${product}</strong>` + (order.admin_notes ? ` — <em>${escHtml(order.admin_notes)}</em>` : ''),
        color: '#EF4444',
        orderId: order.id
      });
    }

    // Screenshot verified
    if (currentIdx >= 2 || ['refunded', 'review_submitted', 'review_verified', 'review_rejected', 'reel_submitted', 'reel_rejected', 'completed'].includes(order.status)) {
      activities.push({
        time: null, sortTime: order.created_at,
        icon: '\u2705',
        label: `Screenshot verified for <strong>${product}</strong>`,
        color: '#10B981',
        orderId: order.id
      });
    }

    // Refunded
    if (order.refund_amount && order.refund_amount > 0) {
      activities.push({
        time: null, sortTime: order.created_at,
        icon: '\uD83D\uDCB8',
        label: `Refund of <strong>\u20B9${order.refund_amount}</strong> processed for <strong>${product}</strong>`,
        color: '#0891B2',
        orderId: order.id
      });
    }

    // Review submitted
    if (order.review_text || ['review_verified', 'review_rejected', 'reel_submitted', 'reel_rejected', 'completed'].includes(order.status)) {
      activities.push({
        time: null, sortTime: order.created_at,
        icon: '\u2B50',
        label: `Review submitted for <strong>${product}</strong>`,
        color: '#8B5CF6',
        orderId: order.id
      });
    }

    // Review rejected
    if (order.status === 'review_rejected') {
      activities.push({
        time: order.updated_at, sortTime: order.updated_at,
        icon: '\u26A0\uFE0F',
        label: `Review rejected for <strong>${product}</strong>` + (order.admin_notes ? ` — <em>${escHtml(order.admin_notes)}</em>` : ''),
        color: '#EF4444',
        orderId: order.id
      });
    }

    // Review verified
    if (['review_verified', 'reel_submitted', 'reel_rejected', 'completed'].includes(order.status)) {
      activities.push({
        time: null, sortTime: order.created_at,
        icon: '\u2705',
        label: `Review verified for <strong>${product}</strong>`,
        color: '#10B981',
        orderId: order.id
      });
    }

    // Reel submitted
    if (order.reel_url || ['reel_rejected', 'completed'].includes(order.status)) {
      activities.push({
        time: null, sortTime: order.created_at,
        icon: '\uD83C\uDFAC',
        label: `Reel submitted for <strong>${product}</strong>` + (order.reel_url ? ` <a href="${escUrl(order.reel_url)}" target="_blank" rel="noopener" style="color: var(--color-accent-teal); font-size: 0.8rem;">\uD83D\uDD17 View</a>` : ''),
        color: '#EC4899',
        orderId: order.id
      });
    }

    // Reel rejected
    if (order.status === 'reel_rejected') {
      activities.push({
        time: order.updated_at, sortTime: order.updated_at,
        icon: '\u26A0\uFE0F',
        label: `Reel rejected for <strong>${product}</strong>` + (order.admin_notes ? ` — <em>${escHtml(order.admin_notes)}</em>` : ''),
        color: '#EF4444',
        orderId: order.id
      });
    }

    // Completed
    if (order.status === 'completed') {
      activities.push({
        time: order.updated_at, sortTime: order.updated_at,
        icon: '\uD83C\uDF89',
        label: `<strong>${product}</strong> completed — <strong style="color: var(--color-accent-green);">\u20B9${order.payment_amount || 0}</strong> paid`,
        color: '#059669',
        orderId: order.id
      });
    }

    // Rejected (terminal)
    if (order.status === 'rejected') {
      activities.push({
        time: order.updated_at, sortTime: order.updated_at,
        icon: '\u274C',
        label: `<strong>${product}</strong> rejected` + (order.admin_notes ? ` — <em>${escHtml(order.admin_notes)}</em>` : ''),
        color: '#EF4444',
        orderId: order.id
      });
    }
  });

  // Sort activities by time (use sortTime as fallback)
  activities.sort((a, b) => {
    const tA = new Date(a.time || a.sortTime || 0);
    const tB = new Date(b.time || b.sortTime || 0);
    return tA - tB;
  });

  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

  // Build the timeline HTML
  const timelineHTML = activities.map((entry, i) => `
    <div class="odm-timeline-item">
      <div class="odm-timeline-dot" style="background: ${entry.color};"></div>
      ${i < activities.length - 1 ? '<div class="odm-timeline-line"></div>' : ''}
      <div class="odm-timeline-content">
        <span class="odm-timeline-icon">${entry.icon}</span>
        <span class="odm-timeline-label">${entry.label}</span>
        ${entry.time ? `<span class="odm-timeline-time">${formatDateTime(entry.time)}</span>` : ''}
      </div>
    </div>
  `).join('');

  // Build orders summary cards
  const orderCardsHTML = creatorOrders.map(order => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-md); background: var(--color-bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--space-sm);">
      <div>
        <p style="font-weight: 600; font-size: 0.85rem; color: var(--color-text-primary); margin-bottom: 2px;">${escHtml(order.product_title || 'Unknown')}</p>
        <p style="font-size: 0.75rem; color: var(--color-text-muted);">${new Date(order.created_at).toLocaleDateString()} ${order.amazon_order_id ? '· ' + escHtml(order.amazon_order_id) : ''}</p>
      </div>
      <div style="display: flex; align-items: center; gap: var(--space-sm);">
        ${getStatusBadge(order.status)}
        <button class="btn-eye" style="font-size: 0.9rem;" onclick="window.viewOrderDetails('${order.id}')" title="View Order">\uD83D\uDC41</button>
      </div>
    </div>
  `).join('');

  const bodyHTML = `
    <div class="order-detail-modal">
      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDC64 Creator Info</div>
        <div class="odm-grid">
          <div class="odm-field"><span class="odm-label">Name</span><span class="odm-value">${escHtml(creatorName)}</span></div>
          <div class="odm-field"><span class="odm-label">Email (Login)</span><span class="odm-value" style="color: var(--color-accent-violet); font-weight: 600;">${escHtml(creatorEmail || '—')}</span></div>
          <div class="odm-field"><span class="odm-label">Password</span><span class="odm-value" style="font-family: monospace;"><span id="pwd-masked">${creatorPassword ? '••••••••' : '—'}</span><span id="pwd-plain" style="display:none;">${escHtml(creatorPassword)}</span>${creatorPassword ? ` <button onclick="document.getElementById('pwd-masked').style.display=document.getElementById('pwd-masked').style.display==='none'?'inline':'none';document.getElementById('pwd-plain').style.display=document.getElementById('pwd-plain').style.display==='none'?'inline':'none';this.textContent=this.textContent==='\uD83D\uDC41'?'\uD83D\uDE48':'\uD83D\uDC41'" style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0 4px;" title="Toggle password">\uD83D\uDC41</button>` : ''}</span></div>
          <div class="odm-field"><span class="odm-label">Instagram</span><span class="odm-value" style="color: var(--color-accent-teal);">@${escHtml(instagram)}</span></div>
          <div class="odm-field"><span class="odm-label">Contact</span><span class="odm-value">${escHtml(contact)}</span></div>
          <div class="odm-field"><span class="odm-label">UPI ID</span><span class="odm-value" style="color: var(--color-accent-teal);">${escHtml(upiId)}</span></div>
        </div>
      </div>

      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCCA Stats</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-md);">
          <div style="text-align: center; padding: var(--space-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary);">${totalOrders}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Total Orders</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-accent-green);">${completed}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Completed</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-accent-orange);">${active}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Active</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-accent-red);">${rejected}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Rejected</div>
          </div>
          <div style="text-align: center; padding: var(--space-md); background: var(--color-bg-secondary); border-radius: var(--radius-md);">
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-accent-green);">\u20B9${totalEarned.toLocaleString()}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Total Earned</div>
          </div>
        </div>
      </div>

      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCE6 Orders (${totalOrders})</div>
        ${orderCardsHTML}
      </div>

      <div class="odm-section">
        <div class="odm-section-title">\uD83D\uDCCB Full Activity Log</div>
        <div class="odm-timeline">${timelineHTML || '<p style="color: var(--color-text-muted); font-size: 0.85rem;">No activity recorded.</p>'}</div>
      </div>
    </div>
  `;

  openModal('\uD83D\uDC64 Creator — ' + creatorName, bodyHTML);
};

// ========================================
// ========================================
// INBOX
// ========================================
function renderInbox() {
  const contactsContainer = document.getElementById('admin-chat-contacts');
  
  if (!document.getElementById('admin-broadcast-btn').hasAttribute('data-listener')) {
    document.getElementById('admin-broadcast-btn').addEventListener('click', openBroadcastModal);
    document.getElementById('admin-broadcast-btn').setAttribute('data-listener', 'true');
  }

  // Get distinct creators from messages
  const creatorIds = [...new Set(allMessages.filter(m => m.message_type !== 'broadcast').map(m => m.sender_id === currentUser.id ? m.receiver_id : m.sender_id))].filter(Boolean);

  if (creatorIds.length === 0) {
    contactsContainer.innerHTML = '<div class="empty-state" style="padding: 2rem;">No messages yet.</div>';
    return;
  }

  // Map to contacts and sort by latest message time
  const contacts = creatorIds.map(id => {
    const profile = allProfiles.find(p => p.id === id);
    const msgs = allMessages.filter(m => 
      (m.sender_id === id && (m.receiver_id === currentUser.id || m.message_type === 'to_admin')) || 
      (m.sender_id === currentUser.id && m.receiver_id === id)
    );
    // get latest message
    msgs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = msgs[0];
    const unreadCount = msgs.filter(m => m.sender_id === id && m.message_type === 'to_admin' && !m.is_read).length;
    
    let statusIcon = '';
    if (latest && latest.sender_id === currentUser.id) {
      statusIcon = `<span style="color: ${latest.is_read ? '#4facfe' : '#999'}; margin-right: 4px; font-size: 0.8rem;">${latest.is_read ? '✓✓' : '✓'}</span>`;
    } else if (unreadCount > 0) {
       // Also bold the text if it's an unread incoming message
       statusIcon = `<span style="color: var(--color-accent-green); margin-right: 4px; font-size: 0.6rem;">🟢</span>`;
    }

    return {
      id,
      name: profile?.display_name || 'Creator',
      latestMsg: latest?.content || '',
      latestTime: latest?.created_at || 0,
      unreadCount,
      statusIcon,
      isUnread: unreadCount > 0
    };
  }).sort((a,b) => new Date(b.latestTime) - new Date(a.latestTime));

  contactsContainer.innerHTML = contacts.map(c => {
    const isStarred = adminStarredChats.includes(c.id);
    return `
      <div class="chat-contact ${c.id === activeChatCreatorId ? 'active' : ''}" onclick="window.openChat('${c.id}', '${escHtml(c.name)}')">
        <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="contact-info">
          <div class="contact-name" style="${c.isUnread ? 'font-weight: 700;' : ''}">${escHtml(c.name)} ${isStarred ? '⭐' : ''}</div>
          <div class="contact-preview" style="${c.isUnread ? 'font-weight: 600; color: var(--color-text-primary);' : ''}">
            ${c.statusIcon}${escHtml(c.latestMsg)}
          </div>
        </div>
        <div class="contact-meta">
          <div class="contact-time" style="${c.isUnread ? 'color: var(--color-accent-green); font-weight: 600;' : ''}">${c.latestTime ? new Date(c.latestTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}</div>
          ${c.unreadCount > 0 ? `<div class="unread-badge" style="background: var(--color-accent-green);">${c.unreadCount}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (activeChatCreatorId) {
    const name = contacts.find(c => c.id === activeChatCreatorId)?.name || 'Creator';
    window.openChat(activeChatCreatorId, name, false);
  } else {
    document.getElementById('admin-chat-main').innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--color-text-muted);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💬</div>
        <p>Select a creator to start chatting</p>
      </div>
    `;
  }
}

window.openChat = function(creatorId, creatorName, markActive = true) {
  if (markActive) {
    activeChatCreatorId = creatorId;
    renderInbox(); // re-render sidebar to update active state
  }

  const mainArea = document.getElementById('admin-chat-main');
  
  // Filter messages for this chat (and broadcasts)
  const chatMsgs = allMessages.filter(m => 
    (m.sender_id === creatorId && (m.receiver_id === currentUser.id || m.message_type === 'to_admin')) || 
    (m.sender_id === currentUser.id && m.receiver_id === creatorId) ||
    m.message_type === 'broadcast'
  ).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  const isStarred = adminStarredChats.includes(creatorId);

  mainArea.innerHTML = `
    <div class="chat-header">
      <div class="contact-avatar" style="width: 36px; height: 36px; margin-right: 12px; font-size:1rem;">${creatorName.charAt(0).toUpperCase()}</div>
      <h3>${escHtml(creatorName)}</h3>
      <div class="chat-actions">
        <button class="chat-action-btn" title="Delete Chat" onclick="window.deleteChat('${creatorId}')"><img src="/delete.png" style="width: 20px; height: 20px; object-fit: contain;" alt="Delete" /></button>
        <button class="chat-action-btn ${isStarred ? 'active' : ''}" title="Star Chat" onclick="window.toggleStarChat('${creatorId}')">
          <img src="/star.png" style="width: 20px; height: 20px; object-fit: contain; ${isStarred ? 'filter: brightness(0) saturate(100%) invert(60%) sepia(80%) saturate(300%) hue-rotate(350deg);' : ''}" alt="Star" />
        </button>
        <button class="chat-action-btn" title="Mark as Unread" onclick="window.markChatUnread('${creatorId}')"><img src="/unread.png" style="width: 20px; height: 20px; object-fit: contain;" alt="Unread" /></button>
      </div>
    </div>
    <div class="chat-messages" id="admin-chat-messages">
      ${chatMsgs.length === 0 ? '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--color-text-muted);">No messages yet</div>' : 
        chatMsgs.map(msg => {
          const isBroadcast = msg.message_type === 'broadcast';
          const isFromAdmin = msg.sender_id === currentUser.id || isBroadcast;
          let classes = 'chat-bubble';
          
          if (isBroadcast) classes += ' broadcast';
          else if (isFromAdmin) classes += ' sent';
          else classes += ' received';

          const timeString = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

          // Parse Reply Blocks
          let displayContent = escHtml(msg.content).replace(/\n/g, '<br />');
          if (displayContent.startsWith('REPLY::[')) {
            const endIdx = displayContent.indexOf(']::REPLY_END<br />');
            if (endIdx > -1) {
              const originalText = displayContent.substring(8, endIdx).replace(/<br \/>/g, ' ');
              const replyText = displayContent.substring(endIdx + 18);
              displayContent = `<div class="quoted-reply">${originalText}</div>${replyText}`;
            }
          }

          return `
            <div class="chat-bubble-wrapper ${isFromAdmin ? 'sent' : 'received'}">
              <div class="${classes}" onmouseleave="this.querySelector('.msg-dropdown')?.classList.remove('show')">
                ${isBroadcast ? '<strong style="display:block; margin-bottom:4px; font-size:0.75rem;">Broadcast</strong>' : ''}
                ${displayContent}
                <div class="bubble-meta">
                  <span class="bubble-time">${timeString}</span>
                  ${isFromAdmin && !isBroadcast ? `<span class="bubble-status" style="color: ${msg.is_read ? '#4facfe' : '#999'}">${msg.is_read ? '✓✓' : '✓'}</span>` : ''}
                </div>
              </div>
              <button class="msg-actions-trigger" onclick="this.nextElementSibling.classList.toggle('show')">⋮</button>
              <div class="msg-dropdown">
                <button onclick="window.prepareReply('${escHtml(msg.content).replace(/'/g, "\\'")}')">Reply</button>
                ${isFromAdmin ? `<button onclick="window.editMessage('${msg.id}', '${escHtml(msg.content).replace(/'/g, "\\'")}')">Edit</button>` : ''}
                <button class="danger" onclick="window.unsendMessage('${msg.id}')">Unsend</button>
              </div>
            </div>
          `;
        }).join('')
      }
    </div>
    <div class="reply-preview-container" id="reply-preview-container">
      <div class="reply-preview-content" id="reply-preview-content"></div>
      <button class="btn-cancel-reply" onclick="window.cancelReply()">×</button>
    </div>
    <div class="chat-input-area">
      <input type="text" class="chat-input" id="admin-chat-input" placeholder="Type a reply..." autocomplete="off" />
      <button class="btn-send" id="admin-chat-send" title="Send">
        <img src="/send.png" style="width: 20px; height: 20px; object-fit: contain; margin-left: -2px; margin-top: 2px;" alt="Send" />
      </button>
    </div>
  `;

  const msgContainer = document.getElementById('admin-chat-messages');
  msgContainer.scrollTop = msgContainer.scrollHeight;

  document.getElementById('admin-chat-send').addEventListener('click', () => sendDirectMessage(creatorId));
  document.getElementById('admin-chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendDirectMessage(creatorId);
  });

  // Mark received messages as read
  const unreadIds = chatMsgs.filter(m => m.sender_id === creatorId && m.message_type === 'to_admin' && !m.is_read).map(m => m.id);
  if (unreadIds.length > 0) {
    markAsReadAdmin(unreadIds);
  }
};

async function sendDirectMessage(creatorId) {
  const input = document.getElementById('admin-chat-input');
  let text = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('admin-chat-send');
  btn.disabled = true;

  if (currentReplyContent) {
    // Clean original message if it was already a reply itself
    let cleanReply = currentReplyContent;
    if (cleanReply.startsWith('REPLY::[')) {
      const endIdx = cleanReply.indexOf(']::REPLY_END\\n');
      if (endIdx > -1) cleanReply = cleanReply.substring(endIdx + 13);
    }
    // Truncate if too long
    if (cleanReply.length > 100) cleanReply = cleanReply.substring(0, 97) + '...';
    
    text = `REPLY::[${cleanReply}]::REPLY_END\n${text}`;
    cancelReply();
  }

  try {
    const { error } = await supabase.from('messages').insert({
      sender_id: currentUser.id,
      receiver_id: creatorId,
      message_type: 'direct',
      content: text
    });
    if (error) throw error;
    
    input.value = '';
    await loadMessages(); // This will auto refresh because of activeChatCreatorId and loadAllData flow
    if (activeSection === 'inbox') renderInbox();
  } catch (error) {
    showError('Failed to send message.');
  } finally {
    if(btn) btn.disabled = false;
    if(input) input.focus();
  }
}

async function markAsReadAdmin(ids) {
  try {
    for (const id of ids) {
      await supabase.from('messages').update({ is_read: true }).eq('id', id);
    }
    allMessages.forEach(m => {
      if (ids.includes(m.id)) m.is_read = true;
    });
    updateDashboardStats();
    // No need to re-render inbox sidebar completely just for badge, but it's safe to do
    // However, it might reset focus. Let's just update the side badge.
    if(activeSection === 'inbox') renderInbox();
  } catch(e) {
    console.error(e);
  }
}

function openBroadcastModal() {
  const bodyHTML = `
    <div class="form-group" style="margin-bottom: var(--space-lg);">
      <label class="form-label">Broadcast Message (Sent to all Creators)</label>
      <textarea class="form-textarea" id="broadcast-text" placeholder="Write your broadcast here..." required rows="4"></textarea>
    </div>
    <button class="btn btn-primary btn-lg w-full" id="send-broadcast-btn">Send Broadcast</button>
  `;
  openModal('Broadcast Message', bodyHTML);

  document.getElementById('send-broadcast-btn').addEventListener('click', async () => {
    const text = document.getElementById('broadcast-text').value.trim();
    if (!text) return;
    const btn = document.getElementById('send-broadcast-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const { error } = await supabase.from('messages').insert({
        sender_id: currentUser.id,
        receiver_id: null,
        message_type: 'broadcast',
        content: text
      });
      if (error) throw error;
      closeModal();
      showSuccess('Broadcast sent!');
      await loadMessages();
      if (activeSection === 'inbox') renderInbox();
    } catch(e) {
      showError('Failed to send broadcast');
      btn.disabled = false;
      btn.textContent = 'Send Broadcast';
    }
  });
}

window.deleteChat = async function(creatorId) {
  if (!confirm('Are you sure you want to permanently delete all direct messages with this creator? This cannot be undone.')) return;
  try {
    const { error } = await supabase.from('messages').delete().or(`and(sender_id.eq.${creatorId},message_type.eq.to_admin),and(sender_id.eq.${currentUser.id},receiver_id.eq.${creatorId})`);
    if (error) throw error;
    showSuccess('Chat deleted successfully');
    activeChatCreatorId = null;
    await loadMessages();
    updateDashboardStats();
    if (activeSection === 'inbox') renderInbox();
  } catch(e) {
    console.error(e);
    showError('Failed to delete chat');
  }
};

window.toggleStarChat = function(creatorId) {
  if (adminStarredChats.includes(creatorId)) {
    adminStarredChats = adminStarredChats.filter(id => id !== creatorId);
  } else {
    adminStarredChats.push(creatorId);
  }
  localStorage.setItem('adminStarredChats', JSON.stringify(adminStarredChats));
  renderInbox(); // re-render to update star icon in sidebar and header
};

window.markChatUnread = async function(creatorId) {
  // Find the last incoming message from this creator
  const incomingMsgs = allMessages.filter(m => m.sender_id === creatorId && m.message_type === 'to_admin').sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  if (incomingMsgs.length === 0) return;
  
  const lastMsg = incomingMsgs[0];
  try {
    const { error } = await supabase.from('messages').update({ is_read: false }).eq('id', lastMsg.id);
    if (error) throw error;
    
    // Clear active chat so we don't immediately mark it as read again!
    activeChatCreatorId = null;
    
    await loadMessages();
    updateDashboardStats();
    if (activeSection === 'inbox') renderInbox();
    showSuccess('Marked as unread');
  } catch(e) {
    console.error(e);
    showError('Failed to mark as unread');
  }
};

window.unsendMessage = async function(msgId) {
  if (!confirm('Are you sure you want to unsend this message?')) return;
  try {
    const { error } = await supabase.from('messages').delete().eq('id', msgId);
    if (error) throw error;
    showSuccess('Message unsent');
    await loadMessages();
    if (activeSection === 'inbox' && activeChatCreatorId) {
      const name = allProfiles.find(p => p.id === activeChatCreatorId)?.display_name || 'Creator';
      window.openChat(activeChatCreatorId, name, false);
    }
  } catch (e) {
    console.error(e);
    showError('Failed to unsend message');
  }
};

window.editMessage = async function(msgId, currentContent) {
  // Remove reply prefix for editing
  let cleanContent = currentContent;
  let replyPrefix = '';
  if (cleanContent.startsWith('REPLY::[')) {
    const endIdx = cleanContent.indexOf(']::REPLY_END\\n');
    if (endIdx > -1) {
      replyPrefix = cleanContent.substring(0, endIdx + 13);
      cleanContent = cleanContent.substring(endIdx + 13);
    }
  }
  
  // Also remove trailing (edited) if present
  cleanContent = cleanContent.replace(/ \\(edited\\)$/, '');

  const newText = prompt('Edit your message:', cleanContent);
  if (newText === null || newText.trim() === '') return;
  if (newText.trim() === cleanContent) return;

  const finalContent = replyPrefix + newText.trim() + ' (edited)';

  try {
    const { error } = await supabase.from('messages').update({ content: finalContent }).eq('id', msgId);
    if (error) throw error;
    showSuccess('Message edited');
    await loadMessages();
    if (activeSection === 'inbox' && activeChatCreatorId) {
      const name = allProfiles.find(p => p.id === activeChatCreatorId)?.display_name || 'Creator';
      window.openChat(activeChatCreatorId, name, false);
    }
  } catch (e) {
    console.error(e);
    showError('Failed to edit message');
  }
};

window.prepareReply = function(content) {
  currentReplyContent = content;
  
  // Clean original message if it was already a reply itself
  let cleanReply = currentReplyContent;
  if (cleanReply.startsWith('REPLY::[')) {
    const endIdx = cleanReply.indexOf(']::REPLY_END\\n');
    if (endIdx > -1) cleanReply = cleanReply.substring(endIdx + 13);
  }
  
  document.getElementById('reply-preview-content').textContent = cleanReply;
  document.getElementById('reply-preview-container').classList.add('active');
  document.getElementById('admin-chat-input').focus();
};

window.cancelReply = function() {
  currentReplyContent = null;
  document.getElementById('reply-preview-container').classList.remove('active');
};

// Init
init();
