// Modal system — D2: Focus management, aria attributes

let previouslyFocused = null;

export function openModal(title, bodyHTML, footerHTML = '') {
  // Remove existing modal
  closeModal();

  // D2: Store focus trigger for restoration
  previouslyFocused = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  // D2: Add dialog role and aria-modal
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" id="modal-close-btn" aria-label="Close dialog">\u2715</button>
      </div>
      <div class="modal-body" id="modal-body">
        ${bodyHTML}
      </div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Close button
  overlay.querySelector('#modal-close-btn').addEventListener('click', closeModal);

  // Close on Escape + D2: Tab trap
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', keyHandler);
      return;
    }

    // D2: Trap Tab within modal
    if (e.key === 'Tab') {
      const focusable = overlay.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };
  document.addEventListener('keydown', keyHandler);

  // D2: Focus first focusable element inside modal
  requestAnimationFrame(() => {
    const firstFocusable = overlay.querySelector(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      overlay.querySelector('#modal-close-btn')?.focus();
    }
  });

  return overlay;
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.remove();
    document.body.style.overflow = '';
  }

  // D2: Restore focus to trigger element
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
    previouslyFocused = null;
  }
}

export function getModalBody() {
  return document.getElementById('modal-body');
}

// Image preview modal
export function showImagePreview(src) {
  const preview = document.createElement('div');
  preview.className = 'image-preview-modal';
  preview.setAttribute('role', 'dialog');
  preview.setAttribute('aria-label', 'Image preview');
  preview.innerHTML = `<img src="${src}" alt="Preview" />`;
  preview.addEventListener('click', () => preview.remove());
  document.body.appendChild(preview);
}

// Custom Confirm Modal
export function confirmModal(title, message) {
  return new Promise((resolve) => {
    previouslyFocused = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    
    overlay.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" id="confirm-close-btn" aria-label="Close dialog">\u2715</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.95rem; color: var(--color-text-secondary); margin-bottom: 0;">${message}</p>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: var(--space-sm); border-top: 1px solid var(--color-border); padding-top: var(--space-md); margin-top: var(--space-md);">
          <button class="btn btn-secondary btn-sm" id="confirm-cancel-btn">Cancel</button>
          <button class="btn btn-primary btn-sm" id="confirm-ok-btn">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const cleanup = (result) => {
      overlay.remove();
      document.body.style.overflow = '';
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
        previouslyFocused = null;
      }
      resolve(result);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    
    overlay.querySelector('#confirm-close-btn').addEventListener('click', () => cleanup(false));
    overlay.querySelector('#confirm-cancel-btn').addEventListener('click', () => cleanup(false));
    overlay.querySelector('#confirm-ok-btn').addEventListener('click', () => cleanup(true));
  });
}
