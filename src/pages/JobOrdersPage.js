import React, { useState, useEffect } from 'react';
import { jobOrderAPI, salesOrderAPI, productAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatDate, getStatusColor, getPriorityColor } from '../lib/utils';
import { Plus, Factory, Eye, Play, CheckCircle, Trash2, AlertTriangle, Check, Loader2, RefreshCw } from 'lucide-react';
import api from '../lib/api';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['pending', 'approved', 'in_production', 'procurement', 'ready_for_dispatch'];
const SHIFTS = ['Morning (6AM-2PM)', 'Evening (2PM-10PM)', 'Night (10PM-6AM)'];

export default function JobOrdersPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingBom, setLoadingBom] = useState(false);
  const [materialAvailability, setMaterialAvailability] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const [form, setForm] = useState({
    sales_order_id: '',
    product_id: '',
    product_name: '',
    product_sku: '',
    quantity: 0,
    packaging: '',
    delivery_date: '',
    priority: 'normal',
    notes: '',
    bom: [],
    label_confirmation: '',
    schedule_date: '',
    schedule_shift: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [jobsRes, ordersRes, productsRes] = await Promise.all([
        jobOrderAPI.getAll(),
        salesOrderAPI.getAll('active'),
        productAPI.getAll(),
      ]);
      // Handle paginated response structure - jobsRes.data is {data: [...], pagination: {...}}
      const jobsResponse = jobsRes?.data || {};
      setJobs(Array.isArray(jobsResponse.data) ? jobsResponse.data : (Array.isArray(jobsResponse) ? jobsResponse : []));
      setSalesOrders(ordersRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const finishedProducts = products.filter(p => p.category === 'finished_product');

  // Handle SPA selection - auto-fill product details
  const handleSalesOrderSelect = async (salesOrderId) => {
    const salesOrder = salesOrders.find(o => o.id === salesOrderId);
    if (!salesOrder) return;

    // Get items from the sales order (from quotation)
    const items = salesOrder.items || [];
    
    if (items.length === 1) {
      // Single item - auto-fill
      const item = items[0];
      setForm(prev => ({
        ...prev,
        sales_order_id: salesOrderId,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.sku,
        quantity: item.quantity,
        packaging: item.packaging,
        delivery_date: salesOrder.expected_delivery_date || '',
      }));
      
      // Load BOM for the product
      await loadProductBOM(item.product_id, item.quantity, item.packaging, item.net_weight_kg);
    } else if (items.length > 1) {
      // Multiple items - let user choose
      setForm(prev => ({
        ...prev,
        sales_order_id: salesOrderId,
        delivery_date: salesOrder.expected_delivery_date || '',
      }));
      toast.info(`Sales order has ${items.length} items. Please select a product.`);
    } else {
      setForm(prev => ({
        ...prev,
        sales_order_id: salesOrderId,
      }));
    }
  };

  // Get items from selected sales order
  const getSelectedSalesOrderItems = () => {
    const salesOrder = salesOrders.find(o => o.id === form.sales_order_id);
    return salesOrder?.items || [];
  };

  // Handle product selection from SPA items
  const handleProductFromSPA = async (productId) => {
    const salesOrder = salesOrders.find(o => o.id === form.sales_order_id);
    const item = salesOrder?.items?.find(i => i.product_id === productId);
    
    if (item) {
      setForm(prev => ({
        ...prev,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.sku,
        quantity: item.quantity,
        packaging: item.packaging,
      }));
      
      await loadProductBOM(item.product_id, item.quantity, item.packaging, item.net_weight_kg);
    }
  };

  // Load BOM from BOM Management and check availability
  const loadProductBOM = async (productId, quantity, packaging, netWeightKg = 200) => {
    setLoadingBom(true);
    setMaterialAvailability([]);
    
    try {
      // Get product BOM
      const bomRes = await api.get(`/product-boms/${productId}`);
      const boms = bomRes.data || [];
      const activeBom = boms.find(b => b.is_active);
      
      if (!activeBom || !activeBom.items?.length) {
        toast.warning('No active BOM found for this product. Please define BOM in BOM Management.');
        setForm(prev => ({ ...prev, bom: [] }));
        return;
      }

      // Calculate required quantities based on production quantity
      // For packaged items: quantity * netWeightKg = total KG needed
      const totalKgNeeded = packaging !== 'Bulk' ? quantity * (netWeightKg || 200) : quantity * 1000;
      
      const bomItems = [];
      const availability = [];
      
      for (const bomItem of activeBom.items) {
        const requiredQty = totalKgNeeded * bomItem.qty_kg_per_kg_finished;
        
        // Check availability
        try {
          const availRes = await api.get(`/inventory-items/${bomItem.material_item_id}/availability`);
          const avail = availRes.data;
          
          const available = avail.available || 0;
          const shortage = Math.max(0, requiredQty - available);
          
          availability.push({
            item_id: bomItem.material_item_id,
            item_name: bomItem.material_name || 'Unknown',
            item_sku: bomItem.material_sku || '-',
            required_qty: requiredQty,
            available: available,
            shortage: shortage,
            status: shortage > 0 ? 'SHORTAGE' : 'AVAILABLE',
            uom: bomItem.uom || 'KG',
            item_type: 'RAW' // Categorize as raw material
          });
          
          bomItems.push({
            product_id: bomItem.material_item_id,
            product_name: bomItem.material_name || 'Unknown',
            sku: bomItem.material_sku || '-',
            required_qty: requiredQty,
            available_qty: available,
            shortage_qty: shortage,
            unit: bomItem.uom || 'KG',
          });
        } catch (err) {
          // If availability check fails, add item anyway
          bomItems.push({
            product_id: bomItem.material_item_id,
            product_name: bomItem.material_name || 'Unknown',
            sku: bomItem.material_sku || '-',
            required_qty: requiredQty,
            available_qty: 0,
            shortage_qty: requiredQty,
            unit: bomItem.uom || 'KG',
          });
        }
      }
      
      setForm(prev => ({ ...prev, bom: bomItems }));
      setMaterialAvailability(availability);
      
      const shortageCount = availability.filter(a => a.status === 'SHORTAGE').length;
      if (shortageCount > 0) {
        toast.warning(`${shortageCount} material(s) need procurement`);
      } else {
        toast.success('All materials available in stock');
      }
      
    } catch (error) {
      console.error('Failed to load BOM:', error);
      toast.error('Failed to load product BOM');
    } finally {
      setLoadingBom(false);
    }
  };

  const handleCreate = async () => {
    if (!form.sales_order_id || !form.product_id || form.quantity <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Check if procurement is needed
    const hasShortage = materialAvailability.some(a => a.status === 'SHORTAGE');
    
    try {
      const jobData = {
        ...form,
        procurement_required: hasShortage,
        material_shortages: materialAvailability.filter(a => a.status === 'SHORTAGE'),
      };
      
      await jobOrderAPI.create(jobData);
      toast.success('Job order created successfully');
      setCreateOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create job order');
    }
  };

  const resetForm = () => {
    setForm({
      sales_order_id: '',
      product_id: '',
      product_name: '',
      product_sku: '',
      quantity: 0,
      packaging: '',
      delivery_date: '',
      priority: 'normal',
      notes: '',
      bom: [],
      label_confirmation: '',
      schedule_date: '',
      schedule_shift: '',
    });
    setMaterialAvailability([]);
  };

  const handleStatusUpdate = async (jobId, newStatus) => {
    try {
      await jobOrderAPI.updateStatus(jobId, newStatus);
      toast.success(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  const filteredJobs = jobs.filter(job => {
    // Filter by status
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    
    // Filter by search term (customer name, job number, product name, product SKU)
    if (!searchTerm) {
      return matchesStatus;
    }
    
    const search = searchTerm.toLowerCase();
    const matchesSearch = 
      (job.customer_name?.toLowerCase().includes(search)) ||
      (job.job_number?.toLowerCase().includes(search)) ||
      (job.product_name?.toLowerCase().includes(search)) ||
      (job.product_sku?.toLowerCase().includes(search));
    
    return matchesStatus && matchesSearch;
  });

  const canManageJobs = ['admin', 'production', 'procurement', 'sales'].includes(user?.role);

  // Check availability for all jobs that need procurement
  const checkAvailabilityForAll = async () => {
    setRefreshing(true);
    try {
      const jobsNeedingCheck = jobs.filter(j => 
        j.procurement_required || 
        (j.material_shortages && j.material_shortages.length > 0) ||
        j.status === 'procurement'
      );
      
      if (jobsNeedingCheck.length === 0) {
        toast.info('No jobs need availability check');
        setRefreshing(false);
        return;
      }

      // Check availability for each job with better error handling
      const checkPromises = jobsNeedingCheck.map(async (job) => {
        try {
          const response = await api.post(`/job-orders/${job.id}/check-availability`);
          return { success: true, jobNumber: job.job_number };
        } catch (err) {
          // Silently handle ALL errors - don't log to console at all
          // Network/CORS errors are expected if backend is down
          // Server errors are also handled silently to avoid console spam
          return { success: false, jobNumber: job.job_number };
        }
      });

      const results = await Promise.all(checkPromises);
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      if (successCount > 0) {
        toast.success(`Availability checked for ${successCount} job(s)`);
        // Reload data to get updated statuses
        await loadData();
      } else if (failureCount > 0) {
        // Only show error if all failed and backend might be down
        toast.error('Failed to check availability. Please ensure backend is running.');
      } else {
        toast.info('No jobs needed availability check');
      }
    } catch (error) {
      // Only show user-facing error for unexpected errors
      if (error.response && error.response.status !== 0) {
        toast.error('Failed to check availability');
      } else {
        // Network/CORS errors - backend might be down
        toast.error('Unable to connect to backend. Please check if server is running.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Calculate procurement status
  const getProcurementStatus = (job) => {
    const shortages = job.material_shortages || [];
    if (shortages.length === 0 && !job.procurement_required) {
      return { status: 'NOT_REQUIRED', label: 'Materials Ready', color: 'bg-green-500/20 text-green-400' };
    }
    if (job.procurement_required || shortages.length > 0) {
      return { status: 'REQUIRED', label: 'Procurement Required', color: 'bg-amber-500/20 text-amber-400' };
    }
    return { status: 'PENDING', label: 'Checking...', color: 'bg-gray-500/20 text-gray-400' };
  };

  return (
    <div className="page-container" data-testid="job-orders-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Job Orders</h1>
          <p className="text-muted-foreground text-sm">Manage production and manufacturing jobs</p>
        </div>
        <div className="module-actions">
          <Button 
            variant="outline" 
            onClick={checkAvailabilityForAll}
            disabled={refreshing}
            className="rounded-sm"
            data-testid="refresh-availability-btn"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking...' : 'Check Availability'}
          </Button>
          <Button 
            variant="outline" 
            onClick={loadData}
            className="rounded-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Input
            placeholder="Search by customer, job number, product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
            data-testid="search-input"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManageJobs && (
            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="create-job-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New Job Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Job Order from SPA</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* Sales Order Selection */}
                  <div className="p-4 border border-blue-500/30 rounded-lg bg-blue-500/5">
                    <h3 className="font-semibold mb-3">1. Select Sales Contract (SPA)</h3>
                    <Select value={form.sales_order_id} onValueChange={handleSalesOrderSelect}>
                      <SelectTrigger data-testid="sales-order-select">
                        <SelectValue placeholder="Select SPA to auto-fill details" />
                      </SelectTrigger>
                      <SelectContent>
                        {salesOrders.map(o => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.spa_number} - {o.customer_name} ({o.items?.length || 0} items)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Product Selection (if multiple items in SPA) - Show ALL products */}
                  {form.sales_order_id && getSelectedSalesOrderItems().length > 0 && (
                    <div className="p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
                      <h3 className="font-semibold mb-3">2. Products in this SPA ({getSelectedSalesOrderItems().length})</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="p-2 text-left">Product</th>
                              <th className="p-2 text-left">SKU</th>
                              <th className="p-2 text-left">Quantity</th>
                              <th className="p-2 text-left">Packaging</th>
                              <th className="p-2 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getSelectedSalesOrderItems().map(item => (
                              <tr key={item.product_id} className={`border-b border-border/30 ${form.product_id === item.product_id ? 'bg-green-500/10' : ''}`}>
                                <td className="p-2 font-medium">{item.product_name}</td>
                                <td className="p-2 text-muted-foreground">{item.sku}</td>
                                <td className="p-2 font-mono">{item.quantity}</td>
                                <td className="p-2">{item.packaging || 'Bulk'}</td>
                                <td className="p-2">
                                  <Button 
                                    size="sm" 
                                    variant={form.product_id === item.product_id ? 'default' : 'outline'}
                                    onClick={() => handleProductFromSPA(item.product_id)}
                                  >
                                    {form.product_id === item.product_id ? 'Selected' : 'Select'}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Auto-filled Job Details */}
                  {form.product_id && (
                    <div className="p-4 border border-green-500/30 rounded-lg bg-green-500/5">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-400" />
                        Job Details (Auto-filled from SPA)
                      </h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <Label className="text-muted-foreground text-xs">Product</Label>
                          <p className="font-medium">{form.product_name}</p>
                          <p className="text-xs text-muted-foreground">{form.product_sku}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground text-xs">Quantity</Label>
                          <p className="font-medium font-mono">{form.quantity}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground text-xs">Packaging</Label>
                          <p className="font-medium">{form.packaging || 'Bulk'}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground text-xs">Delivery Date</Label>
                          <p className="font-medium">{form.delivery_date || 'Not set'}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <Label>Priority</Label>
                          <Select value={form.priority} onValueChange={(v) => setForm({...form, priority: v})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRIORITIES.map(p => (
                                <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input
                            value={form.notes}
                            onChange={(e) => setForm({...form, notes: e.target.value})}
                            placeholder="Optional notes"
                          />
                        </div>
                      </div>

                      {/* Label Confirmation & Schedule */}
                      <div className="grid grid-cols-3 gap-4 mt-4 p-3 border border-blue-500/30 rounded-lg bg-blue-500/5">
                        <div>
                          <Label>Label Confirmation</Label>
                          <Input
                            value={form.label_confirmation}
                            onChange={(e) => setForm({...form, label_confirmation: e.target.value})}
                            placeholder="Label/Batch confirmation"
                          />
                        </div>
                        <div>
                          <Label>Schedule Date</Label>
                          <Input
                            type="datetime-local"
                            value={form.schedule_date}
                            onChange={(e) => setForm({...form, schedule_date: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Shift</Label>
                          <Select value={form.schedule_shift} onValueChange={(v) => setForm({...form, schedule_shift: v})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select shift" />
                            </SelectTrigger>
                            <SelectContent>
                              {SHIFTS.map(s => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BOM & Material Availability */}
                  {form.product_id && (
                    <div className="border-t border-border pt-4">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        Bill of Materials (Auto-loaded from BOM Management)
                        {loadingBom && <Loader2 className="w-4 h-4 animate-spin" />}
                      </h3>
                      
                      {form.bom.length === 0 && !loadingBom ? (
                        <div className="p-4 border border-amber-500/30 rounded bg-amber-500/5 text-center">
                          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                          <p className="text-amber-400">No BOM defined for this product</p>
                          <p className="text-sm text-muted-foreground">Please define BOM in BOM Management first</p>
                        </div>
                      ) : (
                        <div className="data-grid">
                          <table className="erp-table w-full">
                            <thead>
                              <tr>
                                <th>Material</th>
                                <th>SKU</th>
                                <th>Required Qty</th>
                                <th>Available</th>
                                <th>Shortage</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {form.bom.map((item, idx) => (
                                <tr key={idx}>
                                  <td>{item.product_name}</td>
                                  <td className="font-mono text-sm">{item.sku}</td>
                                  <td className="font-mono">{item.required_qty?.toFixed(2)} {item.unit}</td>
                                  <td className="font-mono text-green-400">{item.available_qty?.toFixed(2)}</td>
                                  <td className={`font-mono ${item.shortage_qty > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {item.shortage_qty?.toFixed(2)}
                                  </td>
                                  <td>
                                    {item.shortage_qty > 0 ? (
                                      <Badge className="bg-red-500/20 text-red-400">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        Need Procurement
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-green-500/20 text-green-400">
                                        <Check className="w-3 h-3 mr-1" />
                                        Available
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      
                      {/* Procurement Summary */}
                      {materialAvailability.length > 0 && (
                        <div className={`mt-4 p-3 rounded ${
                          materialAvailability.some(a => a.status === 'SHORTAGE')
                            ? 'bg-amber-500/10 border border-amber-500/30'
                            : 'bg-green-500/10 border border-green-500/30'
                        }`}>
                          {materialAvailability.some(a => a.status === 'SHORTAGE') ? (
                            <p className="text-amber-400 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              {materialAvailability.filter(a => a.status === 'SHORTAGE').length} material(s) need procurement. 
                              Job will be sent to Procurement after creation.
                            </p>
                          ) : (
                            <p className="text-green-400 flex items-center gap-2">
                              <Check className="w-4 h-4" />
                              All materials available. Ready for production.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreate} 
                      disabled={!form.product_id || form.quantity <= 0 || loadingBom}
                      data-testid="submit-job-btn"
                    >
                      Create Job Order
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Jobs List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Job Orders ({filteredJobs.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="empty-state">
            <Factory className="empty-state-icon" />
            <p className="empty-state-title">No job orders found</p>
            <p className="empty-state-description">Create a new job order from a Sales Order</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Job Number</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Procurement</th>
                <th>Country of Destination</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const procStatus = getProcurementStatus(job);
                return (
                  <tr key={job.id} data-testid={`job-row-${job.job_number}`}>
                    <td className="font-medium">{job.job_number}</td>
                    <td>{job.customer_name || '-'}</td>
                    <td>
                      <div>{job.product_name}</div>
                      <span className="text-xs text-muted-foreground">{job.product_sku}</span>
                    </td>
                    <td className="font-mono">{job.quantity} {job.packaging !== 'Bulk' ? job.packaging : ''}</td>
                    <td>
                      <Badge className={getPriorityColor(job.priority)}>
                        {job.priority?.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <Badge className={getStatusColor(job.status)}>
                        {job.status?.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <Badge className={procStatus.color}>
                        {procStatus.label}
                      </Badge>
                    </td>
                    <td>{job.country_of_destination || '-'}</td>
                    <td>{formatDate(job.created_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedJob(job); setViewOpen(true); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canManageJobs && job.status === 'pending' && (
                          <Button variant="ghost" size="icon" onClick={() => handleStatusUpdate(job.id, 'approved')}>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          </Button>
                        )}
                        {canManageJobs && job.status === 'approved' && (
                          <Button variant="ghost" size="icon" onClick={() => handleStatusUpdate(job.id, 'in_production')}>
                            <Play className="w-4 h-4 text-blue-500" />
                          </Button>
                        )}
                        {canManageJobs && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-red-400 hover:text-red-300"
                            onClick={async () => {
                              if (window.confirm(`Delete job order ${job.job_number}?`)) {
                                try {
                                  await jobOrderAPI.delete(job.id);
                                  toast.success('Job order deleted');
                                  loadData();
                                } catch (error) {
                                  toast.error(error.response?.data?.detail || 'Failed to delete');
                                }
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Job Order Details - {selectedJob?.job_number}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Product:</span>
                  <p className="font-medium">{selectedJob.product_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-medium">{selectedJob.quantity}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={getStatusColor(selectedJob.status)}>
                    {selectedJob.status?.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Priority:</span>
                  <Badge className={getPriorityColor(selectedJob.priority)}>
                    {selectedJob.priority?.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Delivery Date:</span>
                  <p className="font-medium">{selectedJob.delivery_date || 'Not set'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Procurement:</span>
                  <Badge className={getProcurementStatus(selectedJob).color}>
                    {getProcurementStatus(selectedJob).label}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Weight (MT):</span>
                  <p className="font-medium font-mono">{selectedJob.total_weight_mt?.toFixed(2) || '0.00'} MT</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Incoterm:</span>
                  <p className="font-medium">{selectedJob.incoterm || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">SPA Number:</span>
                  <p className="font-medium">{selectedJob.spa_number || 'N/A'}</p>
                </div>
                {selectedJob.country_of_destination && (
                  <div>
                    <span className="text-muted-foreground">Country of Destination:</span>
                    <p className="font-medium">{selectedJob.country_of_destination}</p>
                  </div>
                )}
              </div>

              {selectedJob.bom?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Bill of Materials</h4>
                  <div className="data-grid max-h-64 overflow-y-auto">
                    <table className="erp-table w-full">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Required</th>
                          <th>Available</th>
                          <th>Shortage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedJob.bom.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.product_name}</td>
                            <td className="font-mono">{item.required_qty?.toFixed(2)} {item.unit}</td>
                            <td className="font-mono text-green-400">{item.available_qty?.toFixed(2)}</td>
                            <td className={`font-mono ${item.shortage_qty > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {item.shortage_qty?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedJob.notes && (
                <div>
                  <span className="text-muted-foreground">Notes:</span>
                  <p>{selectedJob.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
