import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount, currency = 'USD') {
  const symbols = {
    USD: '$',
    AED: 'AED ',
    EUR: '€',
  };
  return `${symbols[currency] || ''}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status) {
  const colors = {
    pending: 'status-pending',
    approved: 'status-approved',
    rejected: 'status-rejected',
    converted: 'status-active',
    active: 'status-active',
    completed: 'status-approved',
    cancelled: 'status-rejected',
    paid: 'status-approved',
    partial: 'status-warning',
    in_production: 'status-active',
    procurement: 'status-warning',
    ready_for_dispatch: 'status-approved',
    dispatched: 'status-approved',
    passed: 'status-approved',
    failed: 'status-rejected',
    hold: 'status-warning',
    confirmed: 'status-active',
    loaded: 'status-warning',
    shipped: 'status-approved',
    delivered: 'status-approved',
    draft: 'status-pending',
    issued: 'status-active',
    sent: 'status-approved',
  };
  return colors[status] || 'status-pending';
}

export function getPriorityColor(priority) {
  const colors = {
    low: 'priority-low',
    normal: 'priority-normal',
    high: 'priority-high',
    urgent: 'priority-urgent',
  };
  return colors[priority] || 'priority-normal';
}

export function truncateText(text, maxLength = 50) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Check if a user has permission to perform actions on a page
 * @param {Object} user - The user object from useAuth
 * @param {string} pagePath - The route path of the page (e.g., '/production-schedule')
 * @param {Array<string>} allowedRoles - Array of role names that have access (e.g., ['admin', 'production'])
 * @returns {boolean} - True if user has permission
 */
export function hasPagePermission(user, pagePath, allowedRoles = []) {
  // Admin always has access
  if (user?.role === 'admin') return true;
  
  // Check if user has allowed_pages (custom role)
  if (user?.allowed_pages && user.allowed_pages.length > 0) {
    // If allowed_pages includes "all", they have full access
    if (user.allowed_pages.includes('all')) return true;
    // If allowed_pages includes the specific page, they have access
    if (user.allowed_pages.includes(pagePath)) return true;
  }
  
  // Fallback to role-based check
  return allowedRoles.includes(user?.role);
}