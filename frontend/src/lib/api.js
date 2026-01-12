import axios from 'axios';

// API Configuration
// Priority: 1) Environment variable  2) Default to localhost:8001
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API_BASE = `${BACKEND_URL}/api`;

// Log API configuration in development
if (process.env.NODE_ENV === 'development') {
  console.log('[API] Backend URL:', BACKEND_URL);
  console.log('[API] API Base:', API_BASE);
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000, // 15 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true, // Enable cookies/credentials for CORS
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('erp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors with detailed logging
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log error details in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[API Error]', {
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        data: error.response?.data,
      });
    }

    // Handle authentication errors
    if (error.response?.status === 401) {
      localStorage.removeItem('erp_token');
      localStorage.removeItem('erp_user');
      window.location.href = '/login';
    }

    // Handle CORS/Network errors
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      console.error('[API] Network error - check if backend is running at', BACKEND_URL);
    }

    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

// Customers
export const customerAPI = {
  getAll: () => api.get('/customers'),
  getOne: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

// Products
export const productAPI = {
  getAll: (category) => api.get('/products', { params: { category } }),
  getOne: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
};

// Quotations
export const quotationAPI = {
  getAll: (status) => api.get('/quotations', { params: { status } }),
  getOne: (id) => api.get(`/quotations/${id}`),
  create: (data) => api.post('/quotations', data),
  update: (id, data) => api.put(`/quotations/${id}`, data),
  approve: (id) => api.put(`/quotations/${id}/approve`),
  reject: (id, rejection_reason) => api.put(`/quotations/${id}/reject`, null, { params: { rejection_reason } }),
  revise: (id) => api.put(`/quotations/${id}/revise`),
  edit: (id) => api.put(`/quotations/${id}/edit`),
  financeApprove: (id) => api.put(`/quotations/${id}/finance-approve`),
  getPendingFinanceApproval: () => api.get('/quotations/pending-finance-approval'),
};

// Sales Orders
export const salesOrderAPI = {
  getAll: (status) => api.get('/sales-orders', { params: { status } }),
  getOne: (id) => api.get(`/sales-orders/${id}`),
  create: (data) => api.post('/sales-orders', data),
};

// Payments
export const paymentAPI = {
  getAll: (salesOrderId) => api.get('/payments', { params: { sales_order_id: salesOrderId } }),
  create: (data) => api.post('/payments', data),
};

// Job Orders
export const jobOrderAPI = {
  getAll: (status) => api.get('/job-orders', { params: { status } }),
  getOne: (id) => api.get(`/job-orders/${id}`),
  create: (data) => api.post('/job-orders', data),
  updateStatus: (id, status) => api.put(`/job-orders/${id}/status`, null, { params: { status } }),
  delete: (id) => api.delete(`/job-orders/${id}`),
};

// GRN (with Payables Review)
export const grnAPI = {
  getAll: () => api.get('/grn'),
  create: (data) => api.post('/grn', data),
  getPendingPayables: () => api.get('/grn/pending-payables'),
  payablesApprove: (id, notes) => api.put(`/grn/${id}/payables-approve`, null, { params: { notes } }),
  payablesHold: (id, reason) => api.put(`/grn/${id}/payables-hold`, null, { params: { reason } }),
  payablesReject: (id, reason) => api.put(`/grn/${id}/payables-reject`, null, { params: { reason } }),
};

// Delivery Orders
export const deliveryOrderAPI = {
  getAll: () => api.get('/delivery-orders'),
  create: (data) => api.post('/delivery-orders', data),
};

// Shipping
export const shippingAPI = {
  getAll: (status) => api.get('/shipping-bookings', { params: { status } }),
  getOne: (id) => api.get(`/shipping-bookings/${id}`),
  create: (data) => api.post('/shipping-bookings', data),
  update: (id, data) => api.put(`/shipping-bookings/${id}`, null, { params: data }),
  updateCRO: (id, data) => api.put(`/shipping-bookings/${id}/cro`, data),
};

// Transport
export const transportAPI = {
  getAll: (status) => api.get('/transport-schedules', { params: { status } }),
  getPending: () => api.get('/transport-schedules/pending'),
  create: (data) => api.post('/transport-schedules', data),
  update: (id, data) => api.put(`/transport-schedules/${id}`, null, { params: data }),
};

// Dispatch (Security View)
export const dispatchAPI = {
  getAll: (status) => api.get('/dispatch-schedules', { params: { status } }),
  getToday: () => api.get('/dispatch-schedules/today'),
  getUpcoming: (days = 7) => api.get('/dispatch-schedules/upcoming', { params: { days } }),
  updateStatus: (id, status) => api.put(`/dispatch-schedules/${id}/status`, null, { params: { status } }),
};

// Documents
export const documentAPI = {
  getAll: (shippingBookingId) => api.get('/export-documents', { params: { shipping_booking_id: shippingBookingId } }),
  create: (data) => api.post('/export-documents', data),
  getJobOrdersWithDocuments: () => api.get('/documents/job-orders'),
  getJobDocuments: (jobId) => api.get(`/documents/export/${jobId}`),
};

// QC
export const qcAPI = {
  getAll: (status) => api.get('/qc-batches', { params: { status } }),
  create: (data) => api.post('/qc-batches', data),
  updateStatus: (id, status) => api.put(`/qc-batches/${id}/status`, null, { params: { status } }),
  createInspection: (data) => api.post('/qc/inspection', null, { params: data }),
  updateResult: (id, status, notes) => api.put(`/qc/inspection/${id}/result`, null, { params: { status, notes } }),
  getInspections: (status) => api.get('/qc/inspections', { params: { status } }),
};

// Inventory
export const inventoryAPI = {
  getAll: (category, lowStock) => api.get('/inventory', { params: { category, low_stock: lowStock } }),
  getMovements: (productId) => api.get('/inventory/movements', { params: { product_id: productId } }),
};

// Dashboard
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentActivities: () => api.get('/dashboard/recent-activities'),
};

// Production Scheduling
export const productionAPI = {
  getSchedule: () => api.get('/production/schedule'),
  getProcurementList: () => api.get('/production/procurement-list'),
};

// Drums Production Scheduling (New)
export const drumScheduleAPI = {
  regenerate: (weekStart) => api.post(`/production/drum-schedule/regenerate?week_start=${weekStart}`),
  getSchedule: (weekStart) => api.get('/production/drum-schedule', { params: { week_start: weekStart } }),
  getCampaign: (campaignId) => api.get(`/production/campaign/${campaignId}`),
  getArrivals: (weekStart) => api.get('/production/arrivals', { params: { week_start: weekStart } }),
  approveSchedule: (weekStart) => api.post(`/production/schedule/approve?week_start=${weekStart}`),
};

// Packaging Management
export const packagingAPI = {
  getAll: (category) => api.get('/packaging', { params: { category } }),
  create: (data) => api.post('/packaging', data),
  update: (id, data) => api.put(`/packaging/${id}`, data),
};

// Inventory Items (RAW + PACK)
export const inventoryItemAPI = {
  getAll: (itemType) => api.get('/inventory-items', { params: { item_type: itemType } }),
  getAvailability: (id) => api.get(`/inventory-items/${id}/availability`),
  create: (data) => api.post('/inventory-items', data),
};

// Purchase Orders
export const purchaseOrderAPI = {
  getAll: (status) => api.get('/purchase-orders', { params: { status } }),
  getOne: (id) => api.get(`/purchase-orders/${id}`),
  getPendingApproval: () => api.get('/purchase-orders/pending-approval'),
  create: (data) => api.post('/purchase-orders', data),
  createLine: (data) => api.post('/purchase-order-lines', data),
  updateStatus: (id, status) => api.put(`/purchase-orders/${id}/status`, null, { params: { status } }),
  financeApprove: (id) => api.put(`/purchase-orders/${id}/finance-approve`),
  financeReject: (id, reason) => api.put(`/purchase-orders/${id}/finance-reject`, null, { params: { reason } }),
  send: (id) => api.put(`/purchase-orders/${id}/send`),
};

// Procurement Requisitions
export const procurementReqAPI = {
  getAll: (status) => api.get('/procurement-requisitions', { params: { status } }),
  autoGenerate: (weekStart) => api.post(`/procurement/auto-generate?week_start=${weekStart}`),
};

// RFQ (Request for Quotation)
export const rfqAPI = {
  getAll: (status) => api.get('/rfq', { params: { status } }),
  getOne: (id) => api.get(`/rfq/${id}`),
  create: (data) => api.post('/rfq', data),
  send: (id) => api.put(`/rfq/${id}/send`),
  updateQuote: (id, data) => api.put(`/rfq/${id}/quote`, data),
  convertToPO: (id) => api.post(`/rfq/${id}/convert-to-po`),
};

// Email Outbox
export const emailAPI = {
  getOutbox: (status) => api.get('/email/outbox', { params: { status } }),
  queue: (data) => api.post('/email/queue', data),
  processQueue: () => api.post('/email/process-queue'),
};

// Blend Reports
export const blendReportAPI = {
  getOne: (id) => api.get(`/blend-reports/${id}`),
  create: (data) => api.post('/blend-reports', data),
  approve: (id) => api.put(`/blend-reports/${id}/approve`),
  downloadPDF: (id) => `${API_BASE}/pdf/blend-report/${id}`,
};

// PDF Downloads
export const pdfAPI = {
  getQuotationUrl: (quotationId, print = false) => `${API_BASE}/pdf/quotation/${quotationId}${print ? '?print=true' : ''}`,
  getCROUrl: (bookingId) => `${API_BASE}/pdf/cro/${bookingId}`,
  getBlendReportUrl: (reportId) => `${API_BASE}/pdf/blend-report/${reportId}`,
};

// Notifications (Event-Based Bell)
export const notificationAPI = {
  getBell: () => api.get('/notifications/bell'),
  getRecent: () => api.get('/notifications/bell'), // Alias for getBell
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

// Procurement Shortages (from BOMs)
export const procurementShortagesAPI = {
  getShortages: () => api.get('/procurement/shortages'),
  autoGenerate: () => api.post('/procurement/auto-generate'),
};

// Payables
export const payablesAPI = {
  getBills: (status) => api.get('/payables/bills', { params: { status } }),
  createBill: (data) => api.post('/payables/bills', data),
  approveBill: (id) => api.put(`/payables/bills/${id}/approve`),
  payBill: (id) => api.put(`/payables/bills/${id}/pay`),
};

// Receivables
export const receivablesAPI = {
  getInvoices: (status, invoiceType) => api.get('/receivables/invoices', { params: { status, invoice_type: invoiceType } }),
  createInvoice: (data) => api.post('/receivables/invoices', data),
  recordPayment: (id, data) => api.put(`/receivables/invoices/${id}/record-payment`, data),
  getPayments: (id) => api.get(`/receivables/invoices/${id}/payments`),
  sendReminders: () => api.post('/receivables/send-payment-reminders'),
  financeApprove: (id) => api.put(`/receivables/invoices/${id}/finance-approve`),
  downloadPDF: (id, print = false) => {
    const token = localStorage.getItem('erp_token');
    const baseUrl = `${API_BASE}/pdf/invoice/${id}`;
    const params = [];
    if (print) params.push('print=true');
    if (token) params.push(`token=${token}`);
    const queryString = params.length > 0 ? `?${params.join('&')}` : '';
    return `${baseUrl}${queryString}`;
  },
};

// Security
export const securityAPI = {
  createInwardChecklist: (data) => api.post('/security/inward-checklist', null, { params: data }),
  completeChecklist: (id, weightOut) => api.put(`/security/checklist/${id}/complete`, null, { params: { weight_out: weightOut } }),
  getChecklists: (status) => api.get('/security/checklists', { params: { status } }),
};

// Logistics Routing
export const logisticsAPI = {
  getRoutingOptions: () => api.get('/logistics/routing-options'),
  routePO: (poId, incoterm) => api.post(`/logistics/route-po/${poId}`, null, { params: { incoterm } }),
  getRouting: (status) => api.get('/logistics/routing', { params: { status } }),
};

// User Management
export const userAPI = {
  getAll: () => api.get('/users'),
  getOne: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/auth/register', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  changePassword: (id, newPassword) => api.put(`/users/${id}/password`, { new_password: newPassword }),
  delete: (id) => api.delete(`/users/${id}`),
};

export default api;
