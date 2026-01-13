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
import { Plus, Factory, Eye, Play, CheckCircle, Trash2, AlertTriangle, Check, Loader2, Printer, Download, Search, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '../components/ui/pagination';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['pending', 'approved', 'in_production', 'procurement', 'ready_for_dispatch'];

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
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateButton, setShowCreateButton] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    page_size: 50,
    total_pages: 0,
    has_next: false,
    has_previous: false
  });

  const [form, setForm] = useState({
    sales_order_id: '',
    product_id: '',
    product_name: '',
    product_sku: '',
    quantity: 0,
    packaging: '',
    net_weight_kg: null,  // CRITICAL FIX: Add net_weight_kg to form state
    delivery_date: '',
    priority: 'normal',
    notes: '',
    special_conditions: '',
      bom: [],
      label_confirmation: '',
      schedule_date: '',
      schedule_shift: '',
    });

  useEffect(() => {
    loadData();
  }, [currentPage, pageSize, statusFilter]);

  // Reset to page 1 when status filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const status = statusFilter === 'all' ? null : statusFilter;
      const [jobsRes, ordersRes, productsRes] = await Promise.all([
        jobOrderAPI.getAll(status, currentPage, pageSize),
        salesOrderAPI.getAll('active'),
        productAPI.getAll(),
      ]);
      
      // Handle paginated response
      if (jobsRes.data && jobsRes.data.data) {
        setJobs(jobsRes.data.data);
        setPagination(jobsRes.data.pagination || {
          total: 0,
          page: currentPage,
          page_size: pageSize,
          total_pages: 0,
          has_next: false,
          has_previous: false
        });
      } else {
        // Fallback for non-paginated response (backward compatibility)
        setJobs(jobsRes.data || []);
        setPagination({
          total: jobsRes.data?.length || 0,
          page: currentPage,
          page_size: pageSize,
          total_pages: 1,
          has_next: false,
          has_previous: false
        });
      }
      
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
        net_weight_kg: item.net_weight_kg,  // CRITICAL FIX: Preserve from quotation
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
        net_weight_kg: item.net_weight_kg,  // CRITICAL FIX: Preserve from quotation
        delivery_date: salesOrder.expected_delivery_date || '',
      }));
      
      await loadProductBOM(item.product_id, item.quantity, item.packaging, item.net_weight_kg);
    }
  };

  // Load BOM from BOM Management and check availability
  const loadProductBOM = async (productId, quantity, packaging, netWeightKg = null) => {
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
      // Preserve net_weight_kg from quotation - only default to 200 if not provided and not Bulk
      const effectiveNetWeight = packaging !== 'Bulk' 
        ? (netWeightKg !== null && netWeightKg !== undefined ? netWeightKg : 200)
        : null;
      const totalKgNeeded = packaging !== 'Bulk' 
        ? quantity * effectiveNetWeight 
        : quantity * 1000;
      
      const bomItems = [];
      const availability = [];
      
      for (const bomItem of activeBom.items) {
        const requiredQty = totalKgNeeded * bomItem.qty_kg_per_kg_finished;
        
        // Get material name from nested material object or direct fields
        const materialName = bomItem.material?.name || bomItem.material_name || 'Unknown Material';
        const materialSku = bomItem.material?.sku || bomItem.material_sku || '-';
        const materialUom = bomItem.material?.uom || bomItem.uom || 'KG';
        
        // Check availability
        try {
          const availRes = await api.get(`/inventory-items/${bomItem.material_item_id}/availability`);
          const avail = availRes.data;
          
          const available = avail.available || 0;
          const shortage = Math.max(0, requiredQty - available);
          
          availability.push({
            item_id: bomItem.material_item_id,
            item_name: materialName,
            item_sku: materialSku,
            required_qty: requiredQty,
            available: available,
            shortage: shortage,
            status: shortage > 0 ? 'SHORTAGE' : 'AVAILABLE',
            uom: materialUom,
            item_type: 'RAW' // BOM-derived materials are raw by default
          });
          
          bomItems.push({
            product_id: bomItem.material_item_id,
            product_name: materialName,
            sku: materialSku,
            required_qty: requiredQty,
            available_qty: available,
            shortage_qty: shortage,
            unit: materialUom,
          });
        } catch (err) {
          // If availability check fails, add item anyway
          bomItems.push({
            product_id: bomItem.material_item_id,
            product_name: materialName,
            sku: materialSku,
            required_qty: requiredQty,
            available_qty: 0,
            shortage_qty: requiredQty,
            unit: materialUom,
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

  const handleSelectAllProducts = async () => {
    const items = getSelectedSalesOrderItems();
    if (items.length === 0) {
      toast.error('No products to select');
      return;
    }

    try {
      setLoadingBom(true);
      
      // Process all items and build items array
      const jobOrderItems = [];
      let allMaterialShortages = [];
      let overallNeedsProcurement = false;
      
      for (const item of items) {
        // Check if product is a trading product (doesn't need BOM)
        let productType = 'MANUFACTURED'; // Default
        try {
          const productRes = await api.get(`/products/${item.product_id}`);
          productType = productRes.data?.type || 'MANUFACTURED';
        } catch (err) {
          console.warn(`Failed to get product type for ${item.product_id}:`, err);
        }
        
        // Trading products don't need BOM - add them directly
        if (productType === 'TRADED') {
          const itemNetWeight = item.net_weight_kg !== null && item.net_weight_kg !== undefined
            ? item.net_weight_kg
            : (item.packaging !== 'Bulk' ? 200 : null);
          
          jobOrderItems.push({
            product_id: item.product_id,
            product_name: item.product_name,
            product_sku: item.sku,
            quantity: item.quantity,
            packaging: item.packaging || 'Bulk',
            bom: [], // Trading products don't have BOM
            net_weight_kg: itemNetWeight,
          });
          continue; // Skip BOM processing for trading products
        }
        
        // Manufacturing products need BOM
        const bomRes = await api.get(`/product-boms/${item.product_id}`);
        const boms = bomRes.data || [];
        const activeBom = boms.find(b => b.is_active);
        
        if (!activeBom || !activeBom.items?.length) {
          toast.warning(`No active BOM found for ${item.product_name}. Skipping.`);
          continue;
        }

        // Preserve net_weight_kg from quotation - only default to 200 if not provided and not Bulk
        const effectiveNetWeight = item.packaging !== 'Bulk' 
          ? (item.net_weight_kg !== null && item.net_weight_kg !== undefined ? item.net_weight_kg : 200)
          : null;
        const totalKgNeeded = item.packaging !== 'Bulk' 
          ? item.quantity * effectiveNetWeight 
          : item.quantity * 1000;
        
        const bomItems = [];
        const availability = [];
        
        for (const bomItem of activeBom.items) {
          const requiredQty = totalKgNeeded * bomItem.qty_kg_per_kg_finished;
          
          // Get material name from nested material object or direct fields
          const materialName = bomItem.material?.name || bomItem.material_name || 'Unknown Material';
          const materialSku = bomItem.material?.sku || bomItem.material_sku || '-';
          const materialUom = bomItem.material?.uom || bomItem.uom || 'KG';
          
          let available = 0;
          let shortage = requiredQty;
          let status = 'SHORTAGE';
          
          try {
            const availRes = await api.get(`/inventory-items/${bomItem.material_item_id}/availability`);
            const avail = availRes.data;
            available = avail.available || 0;
            shortage = Math.max(0, requiredQty - available);
            status = shortage > 0 ? 'SHORTAGE' : 'AVAILABLE';
          } catch (err) {
            console.warn(`Failed to check availability for ${bomItem.material_item_id}:`, err);
            available = 0;
            shortage = requiredQty;
            status = 'SHORTAGE';
          }
          
          availability.push({
            item_id: bomItem.material_item_id,
            item_name: materialName,
            item_sku: materialSku,
            required_qty: requiredQty,
            available: available,
            shortage: shortage,
            status: status,
            uom: materialUom
          });
          
          bomItems.push({
            product_id: bomItem.material_item_id,
            product_name: materialName,
            sku: materialSku,
            required_qty: requiredQty,
            available_qty: available,
            shortage_qty: shortage,
            unit: materialUom,
          });
        }

        const hasShortage = availability.some(a => a.status === 'SHORTAGE');
        if (hasShortage) {
          overallNeedsProcurement = true;
          allMaterialShortages.push(...availability.filter(a => a.status === 'SHORTAGE'));
        }
        
        // Preserve net_weight_kg from quotation - only default if not provided and not Bulk
        const itemNetWeight = item.net_weight_kg !== null && item.net_weight_kg !== undefined
          ? item.net_weight_kg
          : (item.packaging !== 'Bulk' ? 200 : null);
        
        jobOrderItems.push({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.sku,
          quantity: item.quantity,
          packaging: item.packaging || 'Bulk',
          bom: bomItems,
          net_weight_kg: itemNetWeight,
        });
      }

      if (jobOrderItems.length === 0) {
        toast.error('No valid products to create job order');
        return;
      }

      // Store selected products for creation
      setSelectedProducts(jobOrderItems);
      setShowCreateButton(true);
      toast.success(`${jobOrderItems.length} product(s) selected. Please enter special conditions and click Create Job Order.`);
    } catch (error) {
      console.error('Failed to select products:', error);
      toast.error(error.response?.data?.detail || 'Failed to select products');
    } finally {
      setLoadingBom(false);
    }
  };

  const handleCreateJobOrderForSelected = async () => {
    if (selectedProducts.length === 0) {
      toast.error('No products selected');
      return;
    }

    try {
      setLoadingBom(true);
      
      // Create ONE job order with all items
      const jobData = {
        sales_order_id: form.sales_order_id,
        items: selectedProducts, // Send items array
        delivery_date: form.delivery_date,
        priority: form.priority,
        notes: form.notes,
        special_conditions: form.special_conditions,
        schedule_date: form.schedule_date,
        schedule_shift: form.schedule_shift,
      };
      
      await jobOrderAPI.create(jobData);
      toast.success(`Successfully created job order with ${selectedProducts.length} product(s)`);
      setCreateOpen(false);
      resetForm();
      setSelectedProducts([]);
      setShowCreateButton(false);
      loadData();
    } catch (error) {
      console.error('Failed to create job order:', error);
      toast.error(error.response?.data?.detail || 'Failed to create job order');
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
      
      // Remove UI-only fields before sending
      delete jobData.label_confirmation;
      // Keep schedule_date and schedule_shift - they should be saved
      
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
      net_weight_kg: null,  // CRITICAL FIX: Reset net_weight_kg
      delivery_date: '',
      priority: 'normal',
      notes: '',
      special_conditions: '',
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

  // Client-side search filter (applied to current page results)
  const filteredJobs = jobs.filter(job => {
    // Search filter
    if (!searchTerm.trim()) {
      return true;
    }
    
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      job.job_number?.toLowerCase().includes(searchLower) ||
      job.customer_name?.toLowerCase().includes(searchLower) ||
      job.product_name?.toLowerCase().includes(searchLower) ||
      job.product_sku?.toLowerCase().includes(searchLower) ||
      job.spa_number?.toLowerCase().includes(searchLower);
    
    return matchesSearch;
  });

  // Reset to page 1 when search term changes
  useEffect(() => {
    if (searchTerm) {
      setCurrentPage(1);
    }
  }, [searchTerm]);

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

      // Check availability for each job
      const checkPromises = jobsNeedingCheck.map(job => 
        api.post(`/job-orders/${job.id}/check-availability`)
          .then(response => {
            console.log(`Successfully checked availability for ${job.job_number}:`, response.data);
            return response.data;
          })
          .catch(err => {
            console.error(`Failed to check availability for ${job.job_number}:`, err);
            toast.error(`Failed to check availability for ${job.job_number}: ${err.response?.data?.detail || err.message}`);
            return null;
          })
      );

      const results = await Promise.all(checkPromises);
      const successCount = results.filter(r => r !== null).length;
      
      if (successCount > 0) {
        toast.success(`Availability checked for ${successCount} job(s)`);
        // Reload data to get updated statuses
        await loadData();
      } else if (successCount === 0 && jobsNeedingCheck.length > 0) {
        toast.error('Failed to check availability for all jobs');
      }
    } catch (error) {
      console.error('Failed to check availability:', error);
      toast.error('Failed to check availability');
    } finally {
      setRefreshing(false);
    }
  };

  // Calculate procurement status
  const getProcurementStatus = (job) => {
    // First check procurement_status field (set by backend when materials are received)
    if (job.procurement_status === 'complete') {
      return { status: 'COMPLETE', label: 'Materials Ready', color: 'bg-green-500/20 text-green-400' };
    }
    
    const shortages = job.material_shortages || [];
    
    // If no shortages and procurement not required, materials are ready
    if (shortages.length === 0 && !job.procurement_required) {
      return { status: 'NOT_REQUIRED', label: 'Materials Ready', color: 'bg-green-500/20 text-green-400' };
    }
    
    // If procurement is required or there are shortages, show procurement needed
    if (job.procurement_required || shortages.length > 0) {
      return { status: 'REQUIRED', label: 'Procurement Required', color: 'bg-amber-500/20 text-amber-400' };
    }
    
    // If procurement_status is pending, show pending
    if (job.procurement_status === 'pending') {
      return { status: 'PENDING', label: 'Procurement Pending', color: 'bg-amber-500/20 text-amber-400' };
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
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by customer, job number, product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="search-job-orders"
            />
          </div>
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
          <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
            <SelectTrigger className="w-32" data-testid="page-size-select">
              <SelectValue placeholder="Per page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
              <SelectItem value="100">100 per page</SelectItem>
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
                  <p className="text-sm text-muted-foreground">
                    Select a Sales Contract (SPA) and product to create a job order. Use "Select All" to create job orders for all products in the SPA.
                  </p>
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
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">2. Products in this SPA ({getSelectedSalesOrderItems().length})</h3>
                        {getSelectedSalesOrderItems().length > 1 && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={handleSelectAllProducts}
                            disabled={loadingBom || showCreateButton}
                          >
                            {loadingBom ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Selecting...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Select All Products
                              </>
                            )}
                          </Button>
                        )}
                      </div>
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
                            {getSelectedSalesOrderItems().map(item => {
                              const isInSelectedProducts = selectedProducts.some(p => p.product_id === item.product_id);
                              const isSelected = form.product_id === item.product_id || isInSelectedProducts;
                              return (
                                <tr key={item.product_id} className={`border-b border-border/30 ${isSelected ? 'bg-green-500/10' : ''}`}>
                                  <td className="p-2 font-medium">{item.product_name}</td>
                                  <td className="p-2 text-muted-foreground">{item.sku}</td>
                                  <td className="p-2 font-mono">{item.quantity}</td>
                                  <td className="p-2">{item.packaging || 'Bulk'}</td>
                                  <td className="p-2">
                                    {isInSelectedProducts ? (
                                      <Badge className="bg-green-500/20 text-green-400">
                                        <Check className="w-3 h-3 mr-1" />
                                        Selected
                                      </Badge>
                                    ) : (
                                      <Button 
                                        size="sm" 
                                        variant={form.product_id === item.product_id ? 'default' : 'outline'}
                                        onClick={() => handleProductFromSPA(item.product_id)}
                                        disabled={showCreateButton}
                                      >
                                        {form.product_id === item.product_id ? 'Selected' : 'Select'}
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Auto-filled Job Details */}
                  {(form.product_id || showCreateButton) && (
                    <div className="p-4 border border-green-500/30 rounded-lg bg-green-500/5">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-400" />
                        {showCreateButton ? `Job Details for ${selectedProducts.length} Product(s)` : 'Job Details (Auto-filled from SPA)'}
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
                          <Label>Schedule Shift</Label>
                          <Select
                            value={form.schedule_shift}
                            onValueChange={(value) => setForm({...form, schedule_shift: value})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select shift" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Day (6AM-2PM)">Day (6AM-2PM)</SelectItem>
                              <SelectItem value="Night (10PM-6AM)">Night (10PM-6AM)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Special Conditions</Label>
                          <textarea
                            className="w-full min-h-[80px] px-3 py-2 bg-background border border-input rounded-md text-sm"
                            value={form.special_conditions}
                            onChange={(e) => setForm({...form, special_conditions: e.target.value})}
                            placeholder="Enter any special handling or production conditions..."
                          />
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
                    <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); setSelectedProducts([]); setShowCreateButton(false); }}>
                      Cancel
                    </Button>
                    {showCreateButton ? (
                      <Button 
                        onClick={handleCreateJobOrderForSelected} 
                        disabled={loadingBom}
                        data-testid="submit-job-btn"
                      >
                        {loadingBom ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Job Order'
                        )}
                      </Button>
                    ) : (
                      <Button 
                        onClick={handleCreate} 
                        disabled={!form.product_id || form.quantity <= 0 || loadingBom}
                        data-testid="submit-job-btn"
                      >
                        Create Job Order
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Jobs List */}
      <div className="data-grid">
        <div className="data-grid-header flex justify-between items-center">
          <h3 className="font-medium">
            Job Orders ({searchTerm ? filteredJobs.length : pagination.total})
            {searchTerm && <span className="text-muted-foreground text-sm ml-2">(filtered from {pagination.total})</span>}
          </h3>
          {!searchTerm && pagination.total_pages > 1 && (
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {pagination.total_pages}
            </div>
          )}
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
                <th>MT</th>
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
                    <td>
                      <div className="text-sm">{job.customer_name || '-'}</div>
                    </td>
                    <td>
                      <div>{job.product_name}</div>
                      <span className="text-xs text-muted-foreground">{job.product_sku}</span>
                    </td>
                    <td className="font-mono">
                      {job.quantity} {job.packaging || 'units'}
                    </td>
                    <td className="font-mono text-muted-foreground">
                      {job.total_weight_mt ? job.total_weight_mt.toFixed(3) : '-'}
                    </td>
                    <td>
                      <Badge className={getPriorityColor(job.priority)}>
                        {job.priority?.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <Badge className={getStatusColor(job.status || 'pending')}>
                        {(job.status || 'pending').replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      {job.material_shortages && job.material_shortages.length > 0 ? (
                        <div className="space-y-1">
                          <Badge className={procStatus.color}>
                            {procStatus.label}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {job.material_shortages.slice(0, 2).map((shortage, idx) => (
                              <div key={idx} className="truncate">
                                {shortage.item_name}: {shortage.shortage?.toFixed(2) || shortage.required_qty?.toFixed(2) || '0'} {shortage.uom || 'KG'}
                              </div>
                            ))}
                            {job.material_shortages.length > 2 && (
                              <div className="text-amber-400">+{job.material_shortages.length - 2} more</div>
                            )}
                          </div>
                        </div>
                      ) : job.procurement_required ? (
                        <Badge className={procStatus.color}>
                          {procStatus.label}
                        </Badge>
                      ) : (
                        <Badge className={procStatus.color}>
                          {procStatus.label}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {job.country_of_destination ? (
                        <Badge variant="outline" className="text-xs">
                          {job.country_of_destination}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td>{formatDate(job.created_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedJob(job); setViewOpen(true); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            const token = localStorage.getItem('erp_token');
                            const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                            window.open(`${backendUrl}/api/pdf/job-order/${job.id}?token=${token}`, '_blank');
                          }}
                        >
                          <Download className="w-4 h-4" />
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
        
        {/* Pagination Controls */}
        {!loading && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, pagination.total)} of {pagination.total} job orders
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (pagination.has_previous) {
                        setCurrentPage(currentPage - 1);
                      }
                    }}
                    className={!pagination.has_previous ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {/* Page Numbers */}
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  let pageNum;
                  if (pagination.total_pages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= pagination.total_pages - 2) {
                    pageNum = pagination.total_pages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(pageNum);
                        }}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                {pagination.total_pages > 5 && currentPage < pagination.total_pages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext 
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (pagination.has_next) {
                        setCurrentPage(currentPage + 1);
                      }
                    }}
                    className={!pagination.has_next ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
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
                  <span className="text-muted-foreground">SKU:</span>
                  <p className="font-medium font-mono">{selectedJob.product_sku}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-medium">{selectedJob.quantity} {selectedJob.packaging}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={getStatusColor(selectedJob.status || 'pending')}>
                    {(selectedJob.status || 'pending').replace(/_/g, ' ').toUpperCase()}
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
                  <span className="text-muted-foreground">SPA Number:</span>
                  <p className="font-medium">{selectedJob.spa_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Incoterm:</span>
                  <p className="font-medium">{selectedJob.incoterm || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Country of Destination:</span>
                  <p className="font-medium">{selectedJob.country_of_destination || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p className="font-medium">{formatDate(selectedJob.created_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Schedule Date:</span>
                  <p className="font-medium">{selectedJob.schedule_date ? formatDate(selectedJob.schedule_date) : 'Not set'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Schedule Shift:</span>
                  <p className="font-medium">{selectedJob.schedule_shift || 'Not set'}</p>
                </div>
              </div>

              {selectedJob.notes && (
                <div>
                  <span className="text-muted-foreground text-sm">Notes:</span>
                  <p className="mt-1 p-2 bg-muted/30 rounded text-sm">{selectedJob.notes}</p>
                </div>
              )}

              {selectedJob.special_conditions && (
                <div>
                  <span className="text-muted-foreground text-sm">Special Conditions:</span>
                  <p className="mt-1 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-sm">{selectedJob.special_conditions}</p>
                </div>
              )}

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

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    window.print();
                  }}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
