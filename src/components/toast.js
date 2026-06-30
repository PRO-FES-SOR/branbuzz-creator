// Toast notification system
let toastContainer = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

const icons = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠'
};

export function showToast(message, type = 'info', duration = 4000) {
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showSuccess(message) { showToast(message, 'success'); }
export function showError(message) { showToast(message, 'error', 5000); }
export function showInfo(message) { showToast(message, 'info'); }
export function showWarning(message) { showToast(message, 'warning'); }
