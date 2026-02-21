import React, { useState, useEffect } from 'react';
import { jobOrderAPI, salesOrderAPI, productAPI, quotationAPI, productionLogAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatDate, getStatusColor, getPriorityColor, hasPagePermission } from '../lib/utils';
import { Plus, Factory, Eye, Play, Trash2, AlertTriangle, Check, Loader2, Printer, Download, Search, RefreshCw, FileText, Package } from 'lucide-react';
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
const STATUSES = ['pending', 'approved', 'in_production', 'procurement', 'ready_for_dispatch', 'dispatched', 'closed'];

const LABEL_TRANSLATIONS = {
  en: {
    product_name: 'PRODUCT NAME',
    exporter_name: "EXPORTER'S NAME",
    production_date: 'PRODUCTION DATE',
    expiry_date: 'EXPIRY DATE',
    net_weight: 'NET WEIGHT',
    batch_no: 'BATCH NO',
    country_of_origin: 'COUNTRY OF ORIGIN',
    handling_instruction: 'HANDLING INSTRUCTION:',
    handling_text: 'Keep away from heat. Keep away from source of ignition. Ground all equipment containing material. Do not ingest. Do not breathe gas/fumes/vapor/ spray. Wear suitable protective clothing. In case of insufficient ventilation, wear suitable respiratory equipment. If ingested, seek medical advice immediately and show the container or the label. Avoid Contact with skin and eyes'
  },
  ar: {
    product_name: 'اسم المنتج',
    exporter_name: 'اسم المصدر',
    production_date: 'تاريخ الإنتاج',
    expiry_date: 'تاريخ انتهاء الصلاحية',
    net_weight: 'الوزن الصافي',
    batch_no: 'رقم الدفعة',
    country_of_origin: 'بلد المنشأ',
    handling_instruction: 'تعليمات التعامل:',
    handling_text: 'ابتعد عن الحرارة. ابتعد عن مصدر الاشتعال. قم بتأريض جميع المعدات التي تحتوي على المادة. لا تبتلع. لا تستنشق الغاز/الأبخرة/البخار/الرذاذ. ارتدِ ملابس واقية مناسبة. في حالة عدم كفاية التهوية، ارتدِ معدات تنفسية مناسبة. إذا تم ابتلاعها، اطلب المشورة الطبية على الفور وأظهر الحاوية أو الملصق. تجنب ملامسة الجلد والعينين'
  }
};

// Arabic month names
const ARABIC_MONTHS = {
  'JANUARY': 'يناير',
  'FEBRUARY': 'فبراير',
  'MARCH': 'مارس',
  'APRIL': 'أبريل',
  'MAY': 'مايو',
  'JUNE': 'يونيو',
  'JULY': 'يوليو',
  'AUGUST': 'أغسطس',
  'SEPTEMBER': 'سبتمبر',
  'OCTOBER': 'أكتوبر',
  'NOVEMBER': 'نوفمبر',
  'DECEMBER': 'ديسمبر'
};

// Arabic numerals mapping
const ARABIC_NUMERALS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

// Convert English date to Arabic format
const convertDateToArabic = (dateStr) => {
  if (!dateStr) return '';
  
  // Extract month and year from date string like "JANUARY 2026"
  const parts = dateStr.split(' ');
  if (parts.length >= 2) {
    const month = parts[0].toUpperCase();
    const year = parts[1];
    
    // Convert month to Arabic
    const arabicMonth = ARABIC_MONTHS[month] || month;
    
    // Convert year digits to Arabic numerals
    const arabicYear = year.split('').map(digit => {
      const num = parseInt(digit);
      return ARABIC_NUMERALS[num] || digit;
    }).join('');
    
    return `${arabicMonth} ${arabicYear}`;
  }
  
  return dateStr;
};

// Convert number to Arabic numerals
const convertNumberToArabic = (num) => {
  if (num === null || num === undefined) return '';
  return num.toString().split('').map(digit => {
    const num = parseInt(digit);
    return isNaN(num) ? digit : ARABIC_NUMERALS[num];
  }).join('');
};

// Convert net weight display to Arabic
const convertNetWeightToArabic = (netWeightDisplay) => {
  if (!netWeightDisplay) return '';
  
  // If it's just "Bulk" or other text
  if (netWeightDisplay.toUpperCase() === 'BULK') {
    return 'بالك';
  }
  
  // Extract number and text parts - handle formats like "185KG STEEL DRUM" or "185 KG STEEL DRUM"
  const match = netWeightDisplay.match(/(\d+)\s*(KG|kg)?\s*(.*)/i);
  if (match) {
    const number = match[1];
    const unit = match[2] || '';
    const packaging = match[3] || '';
    
    const arabicNumber = convertNumberToArabic(number);
    const arabicUnit = unit ? 'كجم' : '';
    const arabicPackaging = packaging ? packaging : '';
    
    return `${arabicNumber}${arabicUnit ? ' ' + arabicUnit : ''}${arabicPackaging ? ' ' + arabicPackaging : ''}`.trim();
  }
  
  return netWeightDisplay;
};

// Convert country name to Arabic
const convertCountryToArabic = (country) => {
  if (!country) return '';
  
  const countryMap = {
    'UAE': 'الإمارات',
    'UNITED ARAB EMIRATES': 'الإمارات',
    'EMIRATES': 'الإمارات'
  };
  
  return countryMap[country.toUpperCase()] || country;
};

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
  const [bomAvailability, setBomAvailability] = useState({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [labelInfo, setLabelInfo] = useState(null);
  const [loadingLabelInfo, setLoadingLabelInfo] = useState(false);
  const [companySettings, setCompanySettings] = useState(null);
  const [editLabelOpen, setEditLabelOpen] = useState(false);
  const [editableLabel, setEditableLabel] = useState(null);
  const [labelLanguage, setLabelLanguage] = useState('en'); // 'en' or 'ar'
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

  // Load company settings for label
  useEffect(() => {
    const loadCompanySettings = async () => {
      try {
        const settingsRes = await api.get('/settings/all').catch(() => ({ data: {} }));
        setCompanySettings(settingsRes.data);
      } catch (error) {
        console.error('Failed to load company settings:', error);
      }
    };
    loadCompanySettings();
  }, []);

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

  const syncPackaging = async (jobId) => {
    try {
      const response = await api.post(`/job-orders/${jobId}/sync-packaging`);
      if (response.data.success) {
        toast.success(response.data.message);
        // Reload the data to show updated packaging info
        loadData();
        // If viewing this job, refresh the view
        if (selectedJob && selectedJob.id === jobId) {
          const jobRes = await jobOrderAPI.getOne(jobId);
          setSelectedJob(jobRes.data);
        }
      } else {
        toast.error(response.data.message || 'Failed to sync packaging');
      }
    } catch (error) {
      console.error('Failed to sync packaging:', error);
      toast.error('Failed to sync packaging');
    }
  };

  const recalculateBomShortages = async (jobId) => {
    try {
      setLoadingAvailability(true);
      const response = await api.post(`/job-orders/${jobId}/recalculate-bom-shortages`);
      if (response.data.success) {
        toast.success(`BOM shortages recalculated: ${response.data.raw_shortages_found} RAW material(s) found`);
        // Reload the data to show updated shortages
        loadData();
        // If viewing this job, refresh the view
        if (selectedJob && selectedJob.id === jobId) {
          const jobRes = await jobOrderAPI.getOne(jobId);
          setSelectedJob(jobRes.data);
        }
      } else {
        toast.error(response.data.message || 'Failed to recalculate BOM shortages');
      }
    } catch (error) {
      console.error('Failed to recalculate BOM shortages:', error);
      toast.error('Failed to recalculate BOM shortages: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoadingAvailability(false);
    }
  };

  const finishedProducts = products.filter(p => p.category === 'finished_product');

  // Handle SPA selection - auto-fill product details
  const handleSalesOrderSelect = async (salesOrderId) => {
    const salesOrder = salesOrders.find(o => o.id === salesOrderId);
    if (!salesOrder) return;

    // Get expected_delivery_date from quotation if available
    let expectedDeliveryDate = salesOrder.expected_delivery_date || '';
    if (salesOrder.quotation_id && !expectedDeliveryDate) {
      try {
        const quotationRes = await quotationAPI.getOne(salesOrder.quotation_id);
        expectedDeliveryDate = quotationRes.data?.expected_delivery_date || '';
      } catch (error) {
        console.error('Failed to fetch quotation:', error);
      }
    }

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
        delivery_date: expectedDeliveryDate,
      }));
      
      // Load BOM for the product
      await loadProductBOM(item.product_id, item.quantity, item.packaging, item.net_weight_kg);
    } else if (items.length > 1) {
      // Multiple items - let user choose
      setForm(prev => ({
        ...prev,
        sales_order_id: salesOrderId,
        delivery_date: expectedDeliveryDate,
      }));
      toast.info(`Sales order has ${items.length} items. Please select a product.`);
    } else {
      setForm(prev => ({
        ...prev,
        sales_order_id: salesOrderId,
        delivery_date: expectedDeliveryDate,
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
      // Get expected_delivery_date from quotation if available
      let expectedDeliveryDate = salesOrder.expected_delivery_date || '';
      if (salesOrder.quotation_id && !expectedDeliveryDate) {
        try {
          const quotationRes = await quotationAPI.getOne(salesOrder.quotation_id);
          expectedDeliveryDate = quotationRes.data?.expected_delivery_date || '';
        } catch (error) {
          console.error('Failed to fetch quotation:', error);
        }
      }

      setForm(prev => ({
        ...prev,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.sku,
        quantity: item.quantity,
        packaging: item.packaging,
        net_weight_kg: item.net_weight_kg,  // CRITICAL FIX: Preserve from quotation
        delivery_date: expectedDeliveryDate,
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

  const canManageJobs = hasPagePermission(user, '/job-orders', ['admin', 'production', 'procurement', 'sales']);

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

  // Refresh BOM availability for a job order
  // Checks in order: 1) product_packaging (filled drums), 2) product (bulk stock), 3) BOM items (raw materials), 4) packaging items (empty drums)
  const refreshBomAvailability = async (job) => {
    setLoadingAvailability(true);
    const availabilityMap = {};
    
    try {
      // FIRST: Check product_packaging availability (filled drums) - highest priority
      if (job?.product_id && job?.packaging && job?.packaging !== 'Bulk') {
        try {
          const productPackagingRes = await api.get(
            `/products/${job.product_id}/packaging/${encodeURIComponent(job.packaging)}`
          );
          const productPackaging = productPackagingRes.data;
          if (productPackaging) {
            availabilityMap['product_packaging'] = productPackaging.quantity || 0;
          } else {
            availabilityMap['product_packaging'] = 0;
          }
        } catch (err) {
          console.warn('Failed to check product_packaging:', err);
          availabilityMap['product_packaging'] = 0;
        }
      }
      
      // SECOND: Check product availability (bulk stock)
      if (job?.product_id) {
        try {
          const productRes = await api.get(`/products/${job.product_id}`);
          availabilityMap['product'] = productRes.data?.current_stock || 0;
        } catch (err) {
          console.warn('Failed to check product stock:', err);
          availabilityMap['product'] = 0;
        }
      }
      
      // THIRD: Check BOM items (raw materials)
      const bomItems = job?.bom || [];
      const bomPromises = bomItems.map(async (item) => {
        try {
          const itemId = item.product_id || item.material_item_id;
          if (!itemId) return null;
          
          const availRes = await api.get(`/inventory-items/${itemId}/availability`);
          return {
            itemId: itemId,
            available: availRes.data?.available || 0
          };
        } catch (err) {
          console.warn(`Failed to check availability for ${item.itemId}:`, err);
          return {
            itemId: item.product_id || item.material_item_id,
            available: 0
          };
        }
      });
      
      // FOURTH: Check packaging items (empty drums)
      const packagingItems = (job?.material_shortages || []).filter(s => s.item_type === 'PACK');
      const packagingPromises = packagingItems.map(async (item) => {
        try {
          if (!item.item_id) return null;
          
          const availRes = await api.get(`/inventory-items/${item.item_id}/availability`);
          return {
            itemId: item.item_id,
            available: availRes.data?.available || 0
          };
        } catch (err) {
          console.warn(`Failed to check packaging availability:`, err);
          return {
            itemId: item.item_id,
            available: 0
          };
        }
      });
      
      const results = await Promise.all([...bomPromises, ...packagingPromises]);
      results.forEach(result => {
        if (result) {
          availabilityMap[result.itemId] = result.available;
        }
      });
      
      setBomAvailability(availabilityMap);
    } catch (error) {
      console.error('Failed to refresh availability:', error);
      setBomAvailability({});
    } finally {
      setLoadingAvailability(false);
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

  // Fetch label information from PFI/quotation or job order
  const fetchLabelInfo = async (job) => {
    setLoadingLabelInfo(true);
    try {
      let quotation = null;
      
      // Try to get quotation via sales order
      if (job?.sales_order_id) {
        try {
          const salesOrderRes = await salesOrderAPI.getOne(job.sales_order_id);
          const salesOrder = salesOrderRes.data;
          
          if (salesOrder?.quotation_id) {
            const quotationRes = await quotationAPI.getOne(salesOrder.quotation_id);
            quotation = quotationRes.data;
          }
        } catch (error) {
          console.warn('Failed to fetch sales order or quotation:', error);
        }
      }
      
      // Fetch batch number from production log for this job order
      let batchNo = null;
      try {
        if (job.id) {
          const productId = job.product_id || (job.items && job.items.length > 0 ? job.items[0].product_id : null);
          // Fetch production logs - if productId is available, filter by it; otherwise get all logs for the job
          const logsRes = productId 
            ? await productionLogAPI.getAll(job.id, productId)
            : await productionLogAPI.getAll(job.id, null);
          const logs = logsRes.data || [];
          
          // Get batch number from the most recent production log
          if (logs.length > 0) {
            // Sort by production_date descending to get the most recent
            const sortedLogs = [...logs].sort((a, b) => {
              const dateA = new Date(a.production_date || a.created_at || 0);
              const dateB = new Date(b.production_date || b.created_at || 0);
              return dateB - dateA;
            });
            batchNo = sortedLogs[0].batch_number;
          }
        }
      } catch (error) {
        console.warn('Failed to fetch production logs:', error);
      }
      
      // Fall back to job order's batch_number field if no production log found
      if (!batchNo && job.batch_number) {
        batchNo = job.batch_number;
      }
      
      // Fall back to generating batch number if still not found
      if (!batchNo) {
        const now = new Date();
        batchNo = `APCTTEG${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      }
      
      // Calculate production date (current month/year)
      const now = new Date();
      const productionDate = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      
      // Calculate expiry date (2 years from production, same month)
      const expiryDate = new Date(now);
      expiryDate.setFullYear(expiryDate.getFullYear() + 2);
      const expiryDateStr = expiryDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      
      // Format net weight with packaging - from job order or quotation
      let netWeightDisplay = '';
      const netWeightKg = job.net_weight_kg || quotation?.items?.[0]?.net_weight_kg || null;
      if (job.packaging && job.packaging !== 'Bulk') {
        if (netWeightKg) {
          netWeightDisplay = `${netWeightKg}KG ${job.packaging}`;
        } else {
          netWeightDisplay = job.packaging;
        }
      } else {
        netWeightDisplay = 'Bulk';
      }
      
          // Extract label information from quotation (priority) or job order
          const customerName = quotation?.customer_name || job.customer_name || 'N/A';
          const labelData = {
            pfi_number: quotation?.pfi_number || 'N/A',
            customer_name: customerName,
            exporter_name: 'Asia petrochem LLC', // Fixed exporter name
            product_name: job.product_name || quotation?.items?.[0]?.product_name || 'N/A',
        product_sku: job.product_sku || quotation?.items?.[0]?.sku || 'N/A',
        quantity: job.quantity || 0,
        packaging: job.packaging || 'Bulk',
        net_weight_kg: netWeightKg,
        net_weight_display: netWeightDisplay,
        country_of_origin: quotation?.country_of_origin || job.country_of_origin || 'UAE',
        country_of_destination: quotation?.country_of_destination || job.country_of_destination || 'N/A',
        batch_number: batchNo,
        production_date: productionDate,
        expiry_date: expiryDateStr,
        handling_instruction: 'Keep away from heat. Keep away from source of ignition. Ground all equipment containing material. Do not ingest. Do not breathe gas/fumes/vapor/ spray. Wear suitable protective clothing. In case of insufficient ventilation, wear suitable respiratory equipment. If ingested, seek medical advice immediately and show the container or the label. Avoid Contact with skin and eyes'
      };
      
      setLabelInfo(labelData);
    } catch (error) {
      console.error('Failed to fetch label information:', error);
      setLabelInfo(null);
    } finally {
      setLoadingLabelInfo(false);
    }
  };

  // Print label function
  const handlePrintLabel = () => {
    if (!labelInfo) return;
    
    const lang = labelLanguage; // Use current selected language
    const isArabic = lang === 'ar';
    const dir = isArabic ? 'rtl' : 'ltr';
    const textAlign = isArabic ? 'right' : 'left';
    const fontFamily = isArabic ? "'Arial', 'Tahoma', sans-serif" : 'Arial, sans-serif';
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Product Label</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 20mm;
              }
            }
            body {
              font-family: ${fontFamily};
              margin: 0;
              padding: 20px;
              background: #f5f5f5;
            }
            .label-container {
              background: white;
              border-radius: 8px;
              padding: 30px;
              max-width: 600px;
              margin: 0 auto;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              direction: ${dir};
            }
            .company-name {
              color: #dc2626;
              font-size: 24px;
              font-weight: bold;
              text-transform: uppercase;
              margin-bottom: 20px;
              letter-spacing: 1px;
              text-align: center;
            }
            .product-info {
              margin-bottom: 20px;
            }
            .product-info p {
              margin: 8px 0;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 12px;
              line-height: 1.6;
              color: #111827;
              text-align: ${textAlign};
            }
            .product-row {
              margin-bottom: 8px;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 8px;
            }
            .product-row:last-child {
              border-bottom: none;
            }
            .handling-section {
              margin-top: 20px;
              border-top: 2px solid #e5e7eb;
              padding-top: 15px;
            }
            .handling-title {
              font-weight: bold;
              text-transform: uppercase;
              margin-bottom: 10px;
              font-size: 12px;
              color: #111827;
              text-align: ${textAlign};
            }
            .handling-text {
              font-size: 11px;
              line-height: 1.6;
              text-transform: none;
              color: #111827;
              text-align: ${textAlign};
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div class="company-name">${labelInfo.customer_name}</div>
            <div class="product-info">
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].product_name}: ${labelInfo.product_name}</p>
              </div>
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].exporter_name}: ${labelInfo.exporter_name}</p>
              </div>
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].production_date}: ${lang === 'ar' ? convertDateToArabic(labelInfo.production_date) : labelInfo.production_date}</p>
              </div>
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].expiry_date}: ${lang === 'ar' ? convertDateToArabic(labelInfo.expiry_date) : labelInfo.expiry_date}</p>
              </div>
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].net_weight}: ${lang === 'ar' ? convertNetWeightToArabic(labelInfo.net_weight_display) : labelInfo.net_weight_display}</p>
              </div>
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].batch_no}: ${labelInfo.batch_number}</p>
              </div>
              <div class="product-row">
                <p>${LABEL_TRANSLATIONS[lang].country_of_origin}: ${lang === 'ar' ? convertCountryToArabic(labelInfo.country_of_origin) : labelInfo.country_of_origin}</p>
              </div>
            </div>
            <div class="handling-section">
              <div class="handling-title">${LABEL_TRANSLATIONS[lang].handling_instruction}</div>
              <div class="handling-text">${lang === 'en' ? (labelInfo.handling_instruction || LABEL_TRANSLATIONS.en.handling_text) : LABEL_TRANSLATIONS.ar.handling_text}</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleOpenEditLabel = () => {
    if (labelInfo) {
      setEditableLabel({ ...labelInfo });
      setEditLabelOpen(true);
    }
  };

  const handleSaveLabel = () => {
    if (!editableLabel) return;
    
    // Update the labelInfo with edited values
    setLabelInfo({ ...editableLabel });
    setEditLabelOpen(false);
    toast.success('Label information updated successfully');
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
        </div>
      </div>

      {/* Job Status Counters */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Open Job Orders</p>
              <p className="text-xs text-muted-foreground mt-1">Not yet dispatched</p>
            </div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {new Set(jobs.filter(j => j.status !== 'dispatched' && j.status !== 'closed').map(j => j.job_number)).size}
            </div>
          </div>
        </div>
        
        <div className="border rounded-lg p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Closed Job Orders</p>
              <p className="text-xs text-muted-foreground mt-1">Dispatched</p>
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {new Set(jobs.filter(j => j.status === 'closed').map(j => j.job_number)).size}
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="module-header mb-6">
        <div className="module-actions w-full">
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
          <div className="overflow-x-auto">
            <table className="erp-table w-full">
              <thead>
                <tr>
                  <th>Job Number</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Ordered Qty</th>
                  <th>Dispatched Qty</th>
                  <th>Pending Qty</th>
                  <th>MT</th>
                  <th>MT Product</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Procurement</th>
                  <th>Country of Destination</th>
                  <th>Created</th>
                  <th className="sticky right-0 bg-background z-10">Actions</th>
                </tr>
              </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const procStatus = getProcurementStatus(job);
                // Calculate pending quantity: use remaining_qty if defined, otherwise calculate from quantity - dispatched_qty
                const pendingQty = job.remaining_qty !== undefined 
                  ? job.remaining_qty 
                  : Math.max(0, (job.quantity || 0) - (job.dispatched_qty || 0));
                
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
                      {job.quantity} {job.unit || job.packaging || 'MT'}
                    </td>
                    <td className="font-mono text-blue-600 dark:text-blue-400">
                      {job.dispatched_qty || 0} {job.unit || job.packaging || 'MT'}
                    </td>
                    <td className={`font-mono ${pendingQty > 0 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : 'text-green-600 dark:text-green-400'}`}>
                      {pendingQty} {job.unit || job.packaging || 'MT'}
                      {pendingQty > 0 && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Pending
                        </Badge>
                      )}
                    </td>
                    <td className="font-mono text-muted-foreground">
                      {job.total_weight_mt ? job.total_weight_mt.toFixed(3) : '-'}
                    </td>
                    <td className="font-mono text-cyan-400">
                      {(() => {
                        // Calculate MT for individual product/item
                        if (job.items && job.items.length > 0) {
                          // If job has items array, calculate MT for each item
                          const itemMTs = job.items.map(item => {
                            // For packaged items: (net_weight_kg * quantity) / 1000
                            // For bulk: quantity is already in MT
                            if (item.packaging && item.packaging !== 'Bulk' && item.net_weight_kg) {
                              return ((item.net_weight_kg * (item.quantity || 0)) / 1000).toFixed(3);
                            } else {
                              // Bulk or quantity is already in MT
                              return (item.quantity || 0).toFixed(3);
                            }
                          });
                          
                          // Show individual MTs separated by comma if multiple items
                          if (itemMTs.length === 1) {
                            return itemMTs[0];
                          } else {
                            return itemMTs.join(', ');
                          }
                        }
                        
                        // Fallback: calculate from job-level data if no items array
                        if (job.packaging && job.packaging !== 'Bulk' && job.net_weight_kg) {
                          return (((job.net_weight_kg * (job.quantity || 0)) / 1000)).toFixed(3);
                        }
                        
                        // Last fallback: if quantity exists but no net_weight_kg, assume bulk
                        if (job.quantity) {
                          return job.quantity.toFixed(3);
                        }
                        
                        return '-';
                      })()}
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
                    <td className="sticky right-0 bg-background z-10">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={async () => { 
                          setSelectedJob(job); 
                          setViewOpen(true);
                          // Refresh availability when opening modal
                          await refreshBomAvailability(job);
                          // Fetch label info when opening modal
                          await fetchLabelInfo(job);
                        }}>
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
                        {/* Removed: Approve button (tick button) - status transitions are now automatic */}
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
          </div>
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
      <Dialog open={viewOpen} onOpenChange={(open) => {
        setViewOpen(open);
        if (!open) {
          // Reset availability when modal closes
          setBomAvailability({});
          setLoadingAvailability(false);
          setLabelInfo(null);
          setLabelLanguage('en'); // Reset to English when dialog closes
        } else if (open && selectedJob) {
          // Fetch label info when dialog opens
          fetchLabelInfo(selectedJob);
          setLabelLanguage('en'); // Reset to English when dialog opens
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Order Details - {selectedJob?.job_number}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              {/* Label Information Section - Above Label Confirmation */}
              {loadingLabelInfo ? (
                <div className="p-4 border border-blue-500/30 rounded-lg bg-blue-500/5 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading label information...</span>
                </div>
              ) : labelInfo ? (
                <div className="relative">
                  <div className="absolute top-2 right-2 z-10">
                    <Button
                      onClick={handlePrintLabel}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print Label
                    </Button>
                  </div>
                  
                  {/* Language Tabs */}
                  <div className="flex gap-2 mb-4 border-b border-gray-300">
                    <button
                      onClick={() => setLabelLanguage('en')}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        labelLanguage === 'en'
                          ? 'border-b-2 border-blue-600 text-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => setLabelLanguage('ar')}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        labelLanguage === 'ar'
                          ? 'border-b-2 border-blue-600 text-blue-600'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Arabic
                    </button>
                  </div>
                  
                  <div className="p-6 border-2 border-gray-900 rounded-lg bg-white shadow-sm" style={{ minHeight: '400px' }}>
                    {/* Customer Name - Red, Bold, Uppercase */}
                    <div className="text-red-600 text-2xl font-bold uppercase mb-6 tracking-wide text-center">
                      {labelInfo.customer_name}
                    </div>
                    
                    {/* Product Information - Single Language */}
                    <div className="space-y-2 mb-6">
                      {/* Product Name */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].product_name}: {labelInfo.product_name}
                        </p>
                      </div>
                      
                      {/* Exporter's Name */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].exporter_name}: {labelInfo.exporter_name}
                        </p>
                      </div>
                      
                      {/* Production Date */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].production_date}: {labelLanguage === 'ar' ? convertDateToArabic(labelInfo.production_date) : labelInfo.production_date}
                        </p>
                      </div>
                      
                      {/* Expiry Date */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].expiry_date}: {labelLanguage === 'ar' ? convertDateToArabic(labelInfo.expiry_date) : labelInfo.expiry_date}
                        </p>
                      </div>
                      
                      {/* Net Weight */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].net_weight}: {labelLanguage === 'ar' ? convertNetWeightToArabic(labelInfo.net_weight_display) : labelInfo.net_weight_display}
                        </p>
                      </div>
                      
                      {/* Batch Number */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].batch_no}: {labelInfo.batch_number}
                        </p>
                      </div>
                      
                      {/* Country of Origin */}
                      <div className="border-b border-gray-200 pb-2">
                        <p className={`font-bold uppercase text-sm leading-relaxed text-gray-900 ${labelLanguage === 'ar' ? 'text-right' : ''}`} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                          {LABEL_TRANSLATIONS[labelLanguage].country_of_origin}: {labelLanguage === 'ar' ? convertCountryToArabic(labelInfo.country_of_origin) : labelInfo.country_of_origin}
                        </p>
                      </div>
                    </div>
                    
                    {/* Handling Instruction - Single Language */}
                    <div className="mt-6 pt-4 border-t-2 border-gray-300">
                      <div className={labelLanguage === 'ar' ? 'text-right' : ''} dir={labelLanguage === 'ar' ? 'rtl' : 'ltr'} style={labelLanguage === 'ar' ? { fontFamily: 'Arial, Tahoma, sans-serif' } : {}}>
                        <p className="font-bold uppercase text-sm mb-2 text-gray-900">
                          {LABEL_TRANSLATIONS[labelLanguage].handling_instruction}
                        </p>
                        <p className="text-sm leading-relaxed text-gray-900">
                          {labelLanguage === 'en' 
                            ? (labelInfo.handling_instruction || LABEL_TRANSLATIONS.en.handling_text)
                            : LABEL_TRANSLATIONS.ar.handling_text}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Edit Label Button */}
              {labelInfo && (
                <div className="p-3 border border-blue-500/30 rounded-lg bg-blue-500/5">
                  <Button
                    onClick={handleOpenEditLabel}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    variant="default"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Edit Label Information
                  </Button>
                </div>
              )}

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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Bill of Materials</h4>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => refreshBomAvailability(selectedJob)}
                        disabled={loadingAvailability}
                        className="h-7"
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${loadingAvailability ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => recalculateBomShortages(selectedJob.id)}
                        disabled={loadingAvailability}
                        className="h-7 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400"
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${loadingAvailability ? 'animate-spin' : ''}`} />
                        Recalculate from BOM
                      </Button>
                    </div>
                  </div>
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
                        {selectedJob.bom.map((item, idx) => {
                          const itemId = item.product_id || item.material_item_id;
                          // Use refreshed availability if available, otherwise fall back to stored value
                          const currentAvailable = bomAvailability[itemId] !== undefined 
                            ? bomAvailability[itemId] 
                            : (item.available_qty || 0);
                          const requiredQty = item.required_qty || 0;
                          const currentShortage = Math.max(0, requiredQty - currentAvailable);
                          
                          return (
                            <tr key={idx}>
                              <td>{item.product_name}</td>
                              <td className="font-mono">{requiredQty.toFixed(2)} {item.unit}</td>
                              <td className="font-mono text-green-400">
                                {loadingAvailability ? (
                                  <Loader2 className="w-4 h-4 animate-spin inline" />
                                ) : (
                                  currentAvailable.toFixed(2)
                                )}
                              </td>
                              <td className={`font-mono ${currentShortage > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {loadingAvailability ? (
                                  <Loader2 className="w-4 h-4 animate-spin inline" />
                                ) : (
                                  currentShortage.toFixed(2)
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

              {/* Packaging Requirements Section */}
              {selectedJob.material_shortages && selectedJob.material_shortages.filter(s => s.item_type === 'PACK').length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Packaging Requirements
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshBomAvailability(selectedJob)}
                      disabled={loadingAvailability}
                      className="h-7"
                    >
                      <RefreshCw className={`w-3 h-3 mr-1 ${loadingAvailability ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                  <div className="data-grid max-h-64 overflow-y-auto">
                    <table className="erp-table w-full">
                      <thead>
                        <tr>
                          <th>Packaging Material</th>
                          <th>SKU</th>
                          <th>Required</th>
                          <th>Available</th>
                          <th>Shortage</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedJob.material_shortages
                          .filter(s => s.item_type === 'PACK')
                          .map((shortage, idx) => {
                            // Use refreshed availability if available
                            const currentAvailable = bomAvailability[shortage.item_id] !== undefined 
                              ? bomAvailability[shortage.item_id] 
                              : (shortage.available || 0);
                            const requiredQty = shortage.required_qty || 0;
                            const currentShortage = Math.max(0, requiredQty - currentAvailable);
                            const hasShortage = currentShortage > 0;
                            
                            return (
                              <tr key={idx} className={hasShortage ? 'bg-red-500/10' : ''}>
                                <td className="font-medium">{shortage.item_name}</td>
                                <td className="font-mono text-xs">{shortage.item_sku}</td>
                                <td className="font-mono">{requiredQty.toFixed(0)} {shortage.uom}</td>
                                <td className={`font-mono ${hasShortage ? 'text-red-400' : 'text-green-400'}`}>
                                  {loadingAvailability ? (
                                    <Loader2 className="w-4 h-4 animate-spin inline" />
                                  ) : (
                                    `${currentAvailable.toFixed(0)} ${shortage.uom}`
                                  )}
                                </td>
                                <td className={`font-mono font-bold ${hasShortage ? 'text-red-400' : 'text-green-400'}`}>
                                  {loadingAvailability ? (
                                    <Loader2 className="w-4 h-4 animate-spin inline" />
                                  ) : (
                                    hasShortage ? `${currentShortage.toFixed(0)} ${shortage.uom}` : '✓'
                                  )}
                                </td>
                                <td>
                                  {hasShortage ? (
                                    <Badge className="status-rejected">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Short
                                    </Badge>
                                  ) : (
                                    <Badge className="status-approved">
                                      <Check className="w-3 h-3 mr-1" />
                                      Available
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Packaging Summary */}
                  {selectedJob.packaging && selectedJob.packaging !== 'Bulk' && (
                    <div className="mt-2 p-3 bg-muted/20 rounded-lg border border-border">
                      <div className="flex items-center gap-2 text-sm">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Packaging Type:</span>
                        <span className="font-medium">{selectedJob.packaging}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Show message if no packaging required */}
              {(!selectedJob.material_shortages || selectedJob.material_shortages.filter(s => s.item_type === 'PACK').length === 0) && 
               selectedJob.packaging && selectedJob.packaging !== 'Bulk' && (
                <div className="p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-amber-400">
                        Packaging: {selectedJob.packaging} - Stock check not available. Run sync to update.
                      </span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => syncPackaging(selectedJob.id)}
                      className="border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Sync
                    </Button>
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

      {/* Edit Label Dialog */}
      <Dialog open={editLabelOpen} onOpenChange={setEditLabelOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Label Information</DialogTitle>
          </DialogHeader>
          
          {editableLabel && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_name">Customer Name</Label>
                  <Input
                    id="customer_name"
                    value={editableLabel.customer_name || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, customer_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="exporter_name">Exporter's Name</Label>
                  <Input
                    id="exporter_name"
                    value={editableLabel.exporter_name || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, exporter_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="product_name">Product Name</Label>
                  <Input
                    id="product_name"
                    value={editableLabel.product_name || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, product_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pfi_number">PFI Number</Label>
                  <Input
                    id="pfi_number"
                    value={editableLabel.pfi_number || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, pfi_number: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="production_date">Production Date</Label>
                  <Input
                    id="production_date"
                    value={editableLabel.production_date || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, production_date: e.target.value })}
                    className="mt-1"
                    placeholder="e.g., JANUARY 2026"
                  />
                </div>
                <div>
                  <Label htmlFor="expiry_date">Expiry Date</Label>
                  <Input
                    id="expiry_date"
                    value={editableLabel.expiry_date || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, expiry_date: e.target.value })}
                    className="mt-1"
                    placeholder="e.g., JANUARY 2028"
                  />
                </div>
                <div>
                  <Label htmlFor="net_weight_display">Net Weight</Label>
                  <Input
                    id="net_weight_display"
                    value={editableLabel.net_weight_display || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, net_weight_display: e.target.value })}
                    className="mt-1"
                    placeholder="e.g., 180KG STEEL DRUM"
                  />
                </div>
                <div>
                  <Label htmlFor="batch_number">Batch Number</Label>
                  <Input
                    id="batch_number"
                    value={editableLabel.batch_number || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, batch_number: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="country_of_origin">Country of Origin</Label>
                  <Input
                    id="country_of_origin"
                    value={editableLabel.country_of_origin || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, country_of_origin: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="country_of_destination">Country of Destination</Label>
                  <Input
                    id="country_of_destination"
                    value={editableLabel.country_of_destination || ''}
                    onChange={(e) => setEditableLabel({ ...editableLabel, country_of_destination: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="handling_instruction">Handling Instruction</Label>
                <Textarea
                  id="handling_instruction"
                  value={editableLabel.handling_instruction || ''}
                  onChange={(e) => setEditableLabel({ ...editableLabel, handling_instruction: e.target.value })}
                  className="mt-1"
                  rows={5}
                />
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setEditLabelOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveLabel} className="bg-blue-600 hover:bg-blue-700">
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
