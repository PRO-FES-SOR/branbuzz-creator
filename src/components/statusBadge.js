// Status badge helper — C4: Centralized status config + F10: review_rejected

export const statusConfig = {
  'interested': { label: 'Interested', class: 'badge-info' },
  'screenshot_uploaded': { label: 'Screenshot Uploaded', class: 'badge-pending' },
  'screenshot_rejected': { label: 'Screenshot Rejected', class: 'badge-rejected' },
  'screenshot_verified': { label: 'Screenshot Verified', class: 'badge-verified' },
  'refunded': { label: 'Refunded', class: 'badge-active' },
  'review_submitted': { label: 'Review Submitted', class: 'badge-pending' },
  'review_verified': { label: 'Review Verified', class: 'badge-verified' },
  'review_rejected': { label: 'Review Needs Improvement', class: 'badge-rejected' },
  'reel_submitted': { label: 'Reel Submitted', class: 'badge-pending' },
  'reel_rejected': { label: 'Need Improvement', class: 'badge-rejected' },
  'completed': { label: 'Completed', class: 'badge-completed' },
  'rejected': { label: 'Rejected', class: 'badge-rejected' },
};

// C4: Exported status list for use in other files
export const STATUS_LIST = Object.keys(statusConfig);

// C4: Allowed transitions map
export const STATUS_TRANSITIONS = {
  'interested': ['screenshot_uploaded', 'rejected'],
  'screenshot_uploaded': ['screenshot_verified', 'screenshot_rejected', 'rejected'],
  'screenshot_rejected': ['screenshot_uploaded'],
  'screenshot_verified': ['refunded', 'rejected'],
  'refunded': ['review_submitted', 'rejected'],
  'review_submitted': ['review_verified', 'review_rejected', 'rejected'],
  'review_verified': ['reel_submitted', 'rejected'],
  'review_rejected': ['review_submitted'],
  'reel_submitted': ['completed', 'reel_rejected', 'rejected'],
  'reel_rejected': ['reel_submitted'],
  'completed': [],
  'rejected': [],
};

export function getStatusBadge(status) {
  const config = statusConfig[status] || { label: status, class: 'badge-info' };
  return `<span class="badge ${config.class}">${config.label}</span>`;
}

export function getStatusLabel(status) {
  return (statusConfig[status] || { label: status }).label;
}

// Status timeline for order cards
const timelineSteps = [
  'interested',
  'screenshot_uploaded',
  'screenshot_verified',
  'refunded',
  'review_submitted',
  'review_verified',
  'reel_submitted',
  'completed'
];

export function getStatusTimeline(currentStatus) {
  if (currentStatus === 'rejected') {
    return `<div class="status-timeline"><span class="badge badge-rejected">Rejected</span></div>`;
  }

  // For reel_rejected, show timeline up to reel step with a rejection indicator
  if (currentStatus === 'reel_rejected') {
    const reelIndex = timelineSteps.indexOf('reel_submitted');
    const shortLabels = ['Applied', 'Screenshot', 'Verified', 'Refunded', 'Review', 'Rev. OK', 'Reel', 'Done'];
    let html = '<div class="status-timeline">';
    timelineSteps.forEach((step, i) => {
      if (i > 0) {
        html += `<div class="status-step-line ${i <= reelIndex ? 'completed' : ''}"></div>`;
      }
      const cls = i < reelIndex ? 'completed' : (i === reelIndex ? 'current' : '');
      html += `<div class="status-step ${cls}">`;
      html += `<div class="step-dot"></div>`;
      html += i === reelIndex ? `<span style="color: var(--color-accent-red);">Resubmit</span>` : shortLabels[i];
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // For screenshot_rejected, show timeline up to screenshot step with a rejection indicator
  if (currentStatus === 'screenshot_rejected') {
    const ssIndex = timelineSteps.indexOf('screenshot_uploaded');
    const shortLabels = ['Applied', 'Screenshot', 'Verified', 'Refunded', 'Review', 'Rev. OK', 'Reel', 'Done'];
    let html = '<div class="status-timeline">';
    timelineSteps.forEach((step, i) => {
      if (i > 0) {
        html += `<div class="status-step-line ${i <= ssIndex ? 'completed' : ''}"></div>`;
      }
      const cls = i < ssIndex ? 'completed' : (i === ssIndex ? 'current' : '');
      html += `<div class="status-step ${cls}">`;
      html += `<div class="step-dot"></div>`;
      html += i === ssIndex ? `<span style="color: var(--color-accent-red);">Resubmit</span>` : shortLabels[i];
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  // F10: For review_rejected, show timeline up to review step with a rejection indicator
  if (currentStatus === 'review_rejected') {
    const reviewIndex = timelineSteps.indexOf('review_submitted');
    const shortLabels = ['Applied', 'Screenshot', 'Verified', 'Refunded', 'Review', 'Rev. OK', 'Reel', 'Done'];
    let html = '<div class="status-timeline">';
    timelineSteps.forEach((step, i) => {
      if (i > 0) {
        html += `<div class="status-step-line ${i <= reviewIndex ? 'completed' : ''}"></div>`;
      }
      const cls = i < reviewIndex ? 'completed' : (i === reviewIndex ? 'current' : '');
      html += `<div class="status-step ${cls}">`;
      html += `<div class="step-dot"></div>`;
      html += i === reviewIndex ? `<span style="color: var(--color-accent-red);">Resubmit</span>` : shortLabels[i];
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  const currentIndex = timelineSteps.indexOf(currentStatus);
  const shortLabels = ['Applied', 'Screenshot', 'Verified', 'Refunded', 'Review', 'Rev. OK', 'Reel', 'Done'];

  let html = '<div class="status-timeline">';
  timelineSteps.forEach((step, i) => {
    const cls = i < currentIndex ? 'completed' : (i === currentIndex ? 'current' : '');
    if (i > 0) {
      html += `<div class="status-step-line ${i <= currentIndex ? 'completed' : ''}"></div>`;
    }
    html += `<div class="status-step ${cls}"><div class="step-dot"></div>${shortLabels[i]}</div>`;
  });
  html += '</div>';
  return html;
}
