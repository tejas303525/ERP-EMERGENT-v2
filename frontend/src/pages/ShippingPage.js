import React, { useState, useEffect } from 'react';
import { shippingAPI, jobOrderAPI, purchaseOrderAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { formatDate, getStatusColor, hasPagePermission } from '../lib/utils';
import { Plus, Ship, Edit2, FileText, AlertTriangle, Package } from 'lucide-react';

const CONTAINER_TYPES = ['20ft', '40ft', '40ft_hc'];
const STATUSES = ['pending_details', 'pending', 'cro_received', 'transport_scheduled', 'loaded', 'shipped'];

export default function ShippingPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [jobOrders, setJobOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [bookingType, setBookingType] = useState(null); // 'import' or 'export'
  const [activeTab, setActiveTab] = useState('export'); // 'import' or 'export'
  const [croOpen, setCroOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
    po_ids: [],
    job_order_ids: [],
    shipping_line: '',
    container_type: '20ft',
    container_count: 1,
    port_of_loading: '',
    port_of_discharge: '',
    cargo_description: '',
    cargo_weight: 0,
    is_dg: false,
    dg_class: '',
    notes: '',
    // CRO fields for FOB (customer-provided)
    cro_number: '',
    vessel_name: '',
    vessel_date: '',
    cutoff_date: '',
    gate_cutoff: '',
    vgm_cutoff: '',
    freight_rate: 0,
    freight_currency: 'USD',
    freight_charges: 0,
    pull_out_date: '',
    si_cutoff: '',
    gate_in_date: '',
    booking_source: 'SELLER', // 'SELLER' or 'CUSTOMER'
  });

  const [croForm, setCroForm] = useState({
    cro_number: '',
    vessel_name: '',
    vessel_date: '',
    cutoff_date: '',
    gate_cutoff: '',
    vgm_cutoff: '',
    freight_rate: 0,
    freight_currency: 'USD',
    freight_charges: 0,
    thc_charges: 0,
    tluc_charges: 0,
    ed_charges: 0,
    pull_out_date: '',
    si_cutoff: '',
    gate_in_date: '',
  });

  const [editForm, setEditForm] = useState({
    shipping_line: '',
    container_type: '20ft',
    container_count: 1,
    port_of_loading: '',
    port_of_discharge: '',
    cargo_description: '',
    cargo_weight: 0,
    is_dg: false,
    dg_class: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load job orders with both 'ready_for_dispatch' and 'dispatched' statuses
      // 'dispatched' jobs might still need container shipping bookings
      const [bookingsRes, posRes, readyJobsRes, dispatchedJobsRes] = await Promise.all([
        shippingAPI.getAll(),
        // Load approved FOB POs for import bookings
        purchaseOrderAPI.getReadyForImportBooking(),
        // Load job orders ready for dispatch
        jobOrderAPI.getAll('ready_for_dispatch'),
        // Also load dispatched jobs (they might need container shipping)
        jobOrderAPI.getAll('dispatched'),
      ]);
      
      // Combine both job order responses
      const readyJobsResponse = readyJobsRes?.data || {};
      const dispatchedJobsResponse = dispatchedJobsRes?.data || {};
      const readyJobsData = Array.isArray(readyJobsResponse.data) ? readyJobsResponse.data : (Array.isArray(readyJobsResponse) ? readyJobsResponse : []);
      const dispatchedJobsData = Array.isArray(dispatchedJobsResponse.data) ? dispatchedJobsResponse.data : (Array.isArray(dispatchedJobsResponse) ? dispatchedJobsResponse : []);
      const allJobsData = [...readyJobsData, ...dispatchedJobsData];
      // Ensure data is always an array to prevent .map() and .filter() errors
      const bookingsData = Array.isArray(bookingsRes?.data) ? bookingsRes.data : [];
      
      // Enrich bookings with job order details (for exports) or PO details (for imports)
      const enrichedBookings = await Promise.all(
        bookingsData.map(async (booking) => {
          // Detect PO import bookings: ref_type === 'PO_IMPORT' OR has po_id/po_ids but no job_order_ids
          const hasPO = booking.po_id || (booking.po_ids && booking.po_ids.length > 0);
          const hasJobs = booking.job_order_ids && booking.job_order_ids.length > 0;
          const isPOImport = booking.ref_type === 'PO_IMPORT' || (hasPO && !hasJobs);
          
          // Handle PO import bookings differently
          if (isPOImport) {
            let poNumber = booking.po_number || '';
            let supplierName = booking.supplier_name || '';
            
            // Get PO ID - could be po_id (singular) or first from po_ids (array)
            const poId = booking.po_id || (booking.po_ids && booking.po_ids.length > 0 ? booking.po_ids[0] : null);
            
            // If PO number is missing but we have po_id, fetch PO data
            if (!poNumber && poId) {
              try {
                const poRes = await purchaseOrderAPI.getOne(poId);
                if (poRes?.data) {
                  poNumber = poRes.data.po_number || poNumber;
                  supplierName = poRes.data.supplier_name || supplierName;
                }
              } catch (error) {
                console.error(`Failed to fetch PO ${poId}:`, error);
              }
            }
            
            // If still missing, try to get from booking object's other fields
            if (!poNumber) {
              poNumber = booking.po_number || poId || '';
            }
            if (!supplierName) {
              supplierName = booking.supplier_name || booking.supplier || 'Supplier';
            }
            
            return {
              ...booking,
              ref_type: 'PO_IMPORT', // Ensure ref_type is set
              job_orders: [],
              customer_name: 'Asia Petrochemicals LLC', // APC is the buyer for imports
              supplier_name: supplierName,
              po_number: poNumber,
              po_id: poId || booking.po_id, // Ensure po_id is set
              job_numbers: '', // No job numbers for PO imports
              is_po_import: true
            };
          }
          
          // Handle export bookings (with job orders)
          const jobOrderIds = booking.job_order_ids || [];
          const jobOrders = [];
          const customerNames = new Set();
          const jobNumbers = [];
          
          for (const jobId of jobOrderIds) {
            try {
              const jobRes = await jobOrderAPI.getOne(jobId);
              if (jobRes?.data) {
                jobOrders.push(jobRes.data);
                if (jobRes.data.customer_name) {
                  customerNames.add(jobRes.data.customer_name);
                }
                if (jobRes.data.job_number) {
                  jobNumbers.push(jobRes.data.job_number);
                }
              }
            } catch (error) {
              // Silently handle 404 errors for deleted job orders - don't spam console
              if (error?.response?.status !== 404) {
                console.error(`Failed to fetch job order ${jobId}:`, error);
              }
              // Continue processing other job orders even if one is missing
            }
          }
          
          return {
            ...booking,
            job_orders: jobOrders,
            customer_name: Array.from(customerNames).join(', ') || booking.customer_name || '',
            job_numbers: jobNumbers.join(', '),
            is_po_import: false
          };
        })
      );
      
      setBookings(enrichedBookings);
      
      // Filter POs that can be used for import bookings (approved POs without shipping booking)
      const posData = Array.isArray(posRes?.data) ? posRes.data : [];
      
      // IMPORTANT: Use ALL bookings from API (not just enriched ones) to check for PO references
      // This ensures we catch bookings that might have failed enrichment but still reference POs
      const allBookingsData = Array.isArray(bookingsRes?.data) ? bookingsRes.data : [];
      
      console.log(`Total bookings from API: ${allBookingsData.length}, Enriched bookings: ${enrichedBookings.length}`);
      console.log('All booking numbers:', allBookingsData.map(b => b.booking_number || b.id).slice(0, 10));
      
      // Log bookings with PO references for debugging
      const bookingsWithPOs = allBookingsData.filter(b => b.po_id || b.po_number || (b.po_ids && b.po_ids.length > 0));
      if (bookingsWithPOs.length > 0) {
        console.log('Bookings with PO references:', bookingsWithPOs.map(b => ({
          booking: b.booking_number,
          status: b.status,
          po_id: b.po_id,
          po_number: b.po_number,
          po_ids: b.po_ids
        })));
      }
      
      // Collect all PO IDs and PO numbers from existing bookings (check both po_id and po_ids array)
      const bookingsPOIds = new Set();
      const bookingReferences = new Map(); // Track which booking references which PO
      
      // Check ALL bookings (including those that might have failed enrichment)
      // IMPORTANT: Only consider active bookings (exclude cancelled/deleted)
      allBookingsData.forEach(b => {
        // Skip cancelled or deleted bookings
        const status = b.status?.toLowerCase() || '';
        if (status === 'cancelled' || status === 'deleted') {
          return; // Skip this booking
        }
        
        if (b.po_id) {
          bookingsPOIds.add(b.po_id);
          if (!bookingReferences.has(b.po_id)) {
            bookingReferences.set(b.po_id, []);
          }
          bookingReferences.get(b.po_id).push({
            booking_number: b.booking_number,
            booking_id: b.id,
            field: 'po_id',
            status: b.status
          });
        }
        if (b.po_number) {
          bookingsPOIds.add(b.po_number);
          if (!bookingReferences.has(b.po_number)) {
            bookingReferences.set(b.po_number, []);
          }
          bookingReferences.get(b.po_number).push({
            booking_number: b.booking_number,
            booking_id: b.id,
            field: 'po_number',
            status: b.status
          });
        }
        if (b.po_ids && Array.isArray(b.po_ids)) {
          b.po_ids.forEach(id => {
            bookingsPOIds.add(id);
            if (!bookingReferences.has(id)) {
              bookingReferences.set(id, []);
            }
            bookingReferences.get(id).push({
              booking_number: b.booking_number,
              booking_id: b.id,
              field: 'po_ids',
              status: b.status
            });
          });
        }
      });
      
      // Show POs that are approved and don't already have a shipping booking
      const availablePOs = posData.filter(po => {
        if (po.status !== 'APPROVED') {
          console.log(`PO ${po.po_number} filtered out: status is ${po.status}, not APPROVED`);
          return false;
        }
        // Exclude POs that already have a booking
        if (bookingsPOIds.has(po.id) || bookingsPOIds.has(po.po_number)) {
          const refs = bookingReferences.get(po.id) || bookingReferences.get(po.po_number) || [];
          console.log(`PO ${po.po_number} filtered out: already has booking`, {
            po_id: po.id,
            po_number: po.po_number,
            referenced_by: refs
          });
          return false;
        }
        return true;
      });
      
      console.log(`Total POs from API: ${posData.length}, Available POs after filtering: ${availablePOs.length}`);
      console.log('Available POs:', availablePOs.map(po => ({ po_number: po.po_number, status: po.status, id: po.id })));
      
      setPurchaseOrders(availablePOs);
      
      // Get all existing booking job IDs to filter them out
      const bookedJobIds = new Set();
      allBookingsData.forEach(booking => {
        if (booking.job_order_ids && Array.isArray(booking.job_order_ids)) {
          booking.job_order_ids.forEach(jobId => {
            // Only exclude jobs from active bookings (not cancelled/deleted)
            const status = booking.status?.toLowerCase() || '';
            if (status !== 'cancelled' && status !== 'deleted') {
              bookedJobIds.add(jobId);
            }
          });
        }
      });
      
      // Filter jobs for Shipping window:
      // 1. Must be export incoterm (FOB, CFR, CIF, CIP) - for export bookings
      // 2. Must not already have a shipping booking
      // 3. Must be ready_for_dispatch or dispatched
      const availableExportJobs = allJobsData.filter(job => {
        // Get incoterm from job (should be enriched by backend now)
        const incoterm = (job.incoterm || '').toUpperCase();
        
        // Only show export incoterms that require shipping bookings
        // FOB: Customer books, CFR/CIF/CIP: Seller books
        if (!['FOB', 'CFR', 'CIF', 'CIP'].includes(incoterm)) {
          return false;
        }
        
        // Exclude jobs that already have a shipping booking
        if (bookedJobIds.has(job.id) || job.shipping_booking_id) {
          return false;
        }
        
        return true;
      });
      
      setJobOrders(availableExportJobs);
      setBookings(enrichedBookings);
    } catch (error) {
      toast.error('Failed to load data');
      // Set empty arrays on error to prevent rendering issues
      setBookings([]);
      setPurchaseOrders([]);
      setJobOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePOSelection = (poId) => {
    setForm(prev => ({
      ...prev,
      po_ids: prev.po_ids.includes(poId)
        ? prev.po_ids.filter(id => id !== poId)
        : [...prev.po_ids, poId]
    }));
  };

  const toggleJobSelection = (jobId) => {
    setForm(prev => ({
      ...prev,
      job_order_ids: prev.job_order_ids.includes(jobId)
        ? prev.job_order_ids.filter(id => id !== jobId)
        : [...prev.job_order_ids, jobId]
    }));
  };

  const handleCreate = async () => {
    if (bookingType === 'import') {
      // Import booking (PO-based)
      if (form.po_ids.length === 0) {
        toast.error('Please select purchase orders');
        return;
      }

      // Check if selected POs are FOB (require customer CRO)
      const selectedPOs = purchaseOrders.filter(po => form.po_ids.includes(po.id));
      const isFOB = selectedPOs.some(po => po.incoterm?.toUpperCase() === 'FOB');
      const isMixed = selectedPOs.some(po => po.incoterm?.toUpperCase() === 'FOB') && 
                      selectedPOs.some(po => po.incoterm?.toUpperCase() !== 'FOB');

      if (isMixed) {
        toast.error('Cannot mix FOB and non-FOB POs in same booking. FOB requires customer CRO.');
        return;
      }

      // For PO imports: Require basic shipping details
      if (!form.shipping_line) {
        toast.error('Please provide shipping line');
        return;
      }
      if (!form.port_of_loading) {
        toast.error('Please provide port of loading');
        return;
      }
      if (!form.port_of_discharge) {
        toast.error('Please provide port of discharge');
        return;
      }
      
      if (isFOB) {
        form.booking_source = 'CUSTOMER';
      } else {
        form.booking_source = 'SELLER';
      }

      try {
        const { po_ids, job_order_ids, ...formWithoutIds } = form;
        const payload = {
          ...formWithoutIds,
          job_order_ids: [], // Empty for PO_IMPORT bookings
          po_ids: po_ids // Include PO IDs for import bookings
        };
        
        await shippingAPI.create(payload);
        toast.success('Import booking created. Please add CRO details when received from shipping line or customer.');
        setCreateOpen(false);
        resetForm();
        loadData();
      } catch (error) {
        // Show detailed error message from backend validation
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to create booking';
        if (error.response?.status === 400) {
          // Validation error - show specific message
          toast.error(errorMessage);
        } else if (error.response?.status === 404) {
          // Not found error
          toast.error(`Resource not found: ${errorMessage}`);
        } else {
          // Other errors
          toast.error(`Failed to create booking: ${errorMessage}`);
        }
        console.error('Booking creation error:', error);
      }
    } else if (bookingType === 'export') {
      // Export booking (Job Order-based)
      if (form.job_order_ids.length === 0) {
        toast.error('Please select job orders');
        return;
      }

      // Check if selected jobs are FOB
      const selectedJobs = jobOrders.filter(job => form.job_order_ids.includes(job.id));
      const isFOB = selectedJobs.length > 0 && selectedJobs.every(job => (job.incoterm || '').toUpperCase() === 'FOB');
      const isMixed = selectedJobs.some(job => (job.incoterm || '').toUpperCase() === 'FOB') && 
                      selectedJobs.some(job => (job.incoterm || '').toUpperCase() !== 'FOB');

      if (isMixed) {
        toast.error('Cannot mix FOB and non-FOB jobs in same booking. FOB requires customer CRO.');
        return;
      }

      if (isFOB) {
        // FOB: Require CRO details
        if (!form.cro_number || !form.cro_number.trim()) {
          toast.error('Please enter CRO number (required for FOB)');
          return;
        }
        if (!form.shipping_line || !form.shipping_line.trim()) {
          toast.error('Please enter shipping line');
          return;
        }
        if (!form.vessel_name || !form.vessel_name.trim()) {
          toast.error('Please enter vessel name');
          return;
        }
        if (!form.vessel_date) {
          toast.error('Please enter vessel date');
          return;
        }
        if (!form.cutoff_date) {
          toast.error('Please enter cutoff date');
          return;
        }
        if (!form.port_of_loading) {
          toast.error('Please provide port of loading');
          return;
        }
        if (!form.port_of_discharge) {
          toast.error('Please provide port of discharge');
          return;
        }
        form.booking_source = 'CUSTOMER';
      } else {
        // CFR/CIF/CIP: Require basic shipping details
        if (!form.shipping_line || !form.shipping_line.trim()) {
          toast.error('Please enter shipping line');
          return;
        }
        if (!form.port_of_loading) {
          toast.error('Please provide port of loading');
          return;
        }
        if (!form.port_of_discharge) {
          toast.error('Please provide port of discharge');
          return;
        }
        form.booking_source = 'SELLER';
      }

      try {
        const { po_ids, job_order_ids, ...formWithoutIds } = form;
        const payload = {
          ...formWithoutIds,
          job_order_ids: job_order_ids, // Job order IDs for export bookings
          po_ids: [] // Empty for export bookings
        };
        
        await shippingAPI.create(payload);
        toast.success(isFOB 
          ? 'Export booking created with CRO details.' 
          : 'Export booking created. Please add CRO details when received from shipping line.');
        setCreateOpen(false);
        resetForm();
        loadData();
      } catch (error) {
        // Show detailed error message from backend validation
        const errorMessage = error.response?.data?.detail || error.message || 'Failed to create booking';
        if (error.response?.status === 400) {
          // Validation error - show specific message
          toast.error(errorMessage);
        } else if (error.response?.status === 404) {
          // Not found error
          toast.error(`Resource not found: ${errorMessage}`);
        } else {
          // Other errors
          toast.error(`Failed to create booking: ${errorMessage}`);
        }
        console.error('Booking creation error:', error);
      }
    }
  };

  const handleCROUpdate = async () => {
    if (!croForm.cro_number || !croForm.cutoff_date || !croForm.vessel_date) {
      toast.error('Please fill CRO number, cutoff date, and vessel date');
      return;
    }
    try {
      console.log('📦 Updating CRO with data:', croForm);
      console.log('📦 CRO Details:', {
        si_cutoff: croForm.si_cutoff,
        pull_out_date: croForm.pull_out_date,
        gate_in_date: croForm.gate_in_date,
        vgm_cutoff: croForm.vgm_cutoff
      });
      
      await shippingAPI.updateCRO(selectedBooking.id, croForm);
      const isPOImport = selectedBooking?.is_po_import || selectedBooking?.ref_type === 'PO_IMPORT';
      if (isPOImport) {
        toast.success('CRO details saved. Import record created - Go to Import Window to track shipment!');
      } else {
        toast.success('CRO details saved. Transport schedule auto-generated!');
      }
      setCroOpen(false);
      loadData();
    } catch (error) {
      console.error('❌ CRO Update Error:', error.response?.data);
      toast.error(error.response?.data?.detail || 'Failed to update CRO');
    }
  };

  const openCRODialog = (booking) => {
    setSelectedBooking(booking);
    setCroForm({
      cro_number: booking.cro_number || '',
      vessel_name: booking.vessel_name || '',
      vessel_date: booking.vessel_date || '',
      cutoff_date: booking.cutoff_date || '',
      gate_cutoff: booking.gate_cutoff || '',
      vgm_cutoff: booking.vgm_cutoff || '',
      freight_rate: booking.freight_rate || 0,
      freight_currency: booking.freight_currency || 'USD',
      freight_charges: booking.freight_charges || 0,
      thc_charges: booking.thc_charges || 0,
      tluc_charges: booking.tluc_charges || 0,
      ed_charges: booking.ed_charges || 0,
      pull_out_date: booking.pull_out_date || '',
      si_cutoff: booking.si_cutoff || '',
      gate_in_date: booking.gate_in_date || '',
    });
    setCroOpen(true);
  };

  const openEditDialog = (booking) => {
    setSelectedBooking(booking);
    setEditForm({
      shipping_line: booking.shipping_line || '',
      container_type: booking.container_type || '20ft',
      container_count: booking.container_count || 1,
      port_of_loading: booking.port_of_loading || '',
      port_of_discharge: booking.port_of_discharge || '',
      cargo_description: booking.cargo_description || '',
      cargo_weight: booking.cargo_weight || 0,
      is_dg: booking.is_dg || false,
      dg_class: booking.dg_class || '',
      notes: booking.notes || '',
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await shippingAPI.update(selectedBooking.id, editForm);
      toast.success('Booking details updated successfully');
      setEditOpen(false);
      loadData();
    } catch (error) {
      toast.error('Failed to update booking: ' + (error.response?.data?.detail || error.message));
    }
  };

  const resetForm = () => {
    setForm({
      po_ids: [],
      job_order_ids: [],
      shipping_line: '',
      container_type: '20ft',
      container_count: 1,
      port_of_loading: '',
      port_of_discharge: '',
      cargo_description: '',
      cargo_weight: 0,
      is_dg: false,
      dg_class: '',
      notes: '',
      cro_number: '',
      vessel_name: '',
      vessel_date: '',
      cutoff_date: '',
      gate_cutoff: '',
      vgm_cutoff: '',
      freight_rate: 0,
      freight_currency: 'USD',
      freight_charges: 0,
      pull_out_date: '',
      si_cutoff: '',
      gate_in_date: '',
      booking_source: 'SELLER',
    });
    setBookingType(null);
  };


  // Check if selected POs are FOB
  const selectedPOs = purchaseOrders.filter(po => form.po_ids.includes(po.id));
  const isFOBBooking = selectedPOs.length > 0 && selectedPOs.every(po => po.incoterm?.toUpperCase() === 'FOB');
  
  // Check if selected jobs are FOB
  const selectedJobs = jobOrders.filter(job => form.job_order_ids.includes(job.id));
  const isFOBExportBooking = selectedJobs.length > 0 && selectedJobs.every(job => (job.incoterm || '').toUpperCase() === 'FOB');

  // Separate bookings into Import and Export
  const importBookings = bookings
    .filter(b => b.ref_type === 'PO_IMPORT' || b.po_id || (b.po_ids && b.po_ids.length > 0))
    .sort((a, b) => {
      const dateA = new Date(a.created_at || a.vessel_date || 0);
      const dateB = new Date(b.created_at || b.vessel_date || 0);
      return dateB - dateA; // Descending (newest first)
    });
  
  // Get booked job IDs to identify unbooked jobs
  const bookedJobIds = new Set();
  bookings
    .filter(b => b.ref_type !== 'PO_IMPORT' && !b.po_id && (!b.po_ids || b.po_ids.length === 0))
    .forEach(booking => {
      if (booking.job_order_ids && Array.isArray(booking.job_order_ids)) {
        booking.job_order_ids.forEach(jobId => {
          const status = booking.status?.toLowerCase() || '';
          if (status !== 'cancelled' && status !== 'deleted') {
            bookedJobIds.add(jobId);
          }
        });
      }
    });

  // Helper function to get delivery date from booking (from job orders)
  const getDeliveryDateFromBooking = (booking) => {
    // Check if booking has job_orders array with delivery_date
    if (booking.job_orders && Array.isArray(booking.job_orders) && booking.job_orders.length > 0) {
      // Get the earliest delivery date from all job orders
      const deliveryDates = booking.job_orders
        .map(job => job.delivery_date || job.expected_delivery_date)
        .filter(Boolean)
        .map(date => new Date(date))
        .filter(date => !isNaN(date.getTime()));
      
      if (deliveryDates.length > 0) {
        return new Date(Math.min(...deliveryDates.map(d => d.getTime())));
      }
    }
    // Fallback to created_at or vessel_date if no delivery date found
    return new Date(booking.created_at || booking.vessel_date || 0);
  };

  // Combine existing bookings with unbooked jobs
  const existingExportBookings = bookings
    .filter(b => b.ref_type !== 'PO_IMPORT' && !b.po_id && (!b.po_ids || b.po_ids.length === 0))
    .sort((a, b) => {
      // Sort by delivery date from job orders (ascending - earliest first)
      const dateA = getDeliveryDateFromBooking(a);
      const dateB = getDeliveryDateFromBooking(b);
      return dateA - dateB; // Ascending (earliest delivery date first)
    });

  // Convert unbooked jobs to booking-like objects for display
  const unbookedJobs = jobOrders
    .filter(job => {
      const incoterm = (job.incoterm || '').toUpperCase();
      return ['FOB', 'CFR', 'CIF', 'CIP'].includes(incoterm) && 
             !bookedJobIds.has(job.id) && 
             !job.shipping_booking_id;
    })
    .map(job => ({
      id: `job-${job.id}`, // Prefix to distinguish from bookings
      booking_number: null, // No booking number yet
      job_number: job.job_number,
      job_numbers: job.job_number,
      job_order_ids: [job.id],
      customer_name: job.customer_name || 'Unknown',
      shipping_line: null,
      container_type: null,
      container_count: null,
      cro_number: null,
      vessel_name: null,
      vessel_date: null,
      status: 'unbooked',
      incoterm: job.incoterm,
      isUnbookedJob: true, // Flag to identify unbooked jobs
      jobData: job // Store full job data
    }))
    .sort((a, b) => {
      // Sort by delivery date from job data (ascending - earliest first)
      const dateA = a.jobData?.delivery_date || a.jobData?.expected_delivery_date;
      const dateB = b.jobData?.delivery_date || b.jobData?.expected_delivery_date;
      
      if (dateA && dateB) {
        return new Date(dateA) - new Date(dateB);
      }
      if (dateA) return -1; // A has date, B doesn't - A comes first
      if (dateB) return 1;  // B has date, A doesn't - B comes first
      // Both missing dates - fallback to job number
      return (a.job_number || '').localeCompare(b.job_number || '');
    });

  // Combine bookings and unbooked jobs, then sort by delivery date
  const exportBookings = [...existingExportBookings, ...unbookedJobs].sort((a, b) => {
    // Get delivery dates
    const dateA = a.isUnbookedJob 
      ? (a.jobData?.delivery_date || a.jobData?.expected_delivery_date)
      : getDeliveryDateFromBooking(a);
    const dateB = b.isUnbookedJob
      ? (b.jobData?.delivery_date || b.jobData?.expected_delivery_date)
      : getDeliveryDateFromBooking(b);
    
    // Convert to Date objects for comparison
    const dateAObj = dateA ? new Date(dateA) : new Date(0);
    const dateBObj = dateB ? new Date(dateB) : new Date(0);
    
    // Sort ascending (earliest delivery date first)
    return dateAObj - dateBObj;
  });

  // Apply status filter to active tab
  const filteredBookings = activeTab === 'import' 
    ? (statusFilter === 'all' ? importBookings : importBookings.filter(b => b.status === statusFilter))
    : (statusFilter === 'all' ? exportBookings : exportBookings.filter(b => b.status === statusFilter));
  
  const pendingCRO = bookings.filter(b => b.status === 'pending').length;
  const canCreate = hasPagePermission(user, '/shipping', ['admin', 'shipping']);

  return (
    <div className="page-container" data-testid="shipping-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Shipping - Container Booking</h1>
          <p className="text-muted-foreground text-sm">Book containers and manage CRO details</p>
        </div>
        <div className="module-actions">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) {
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="create-booking-btn" className="rounded-sm" onClick={() => {
                  setCreateOpen(true);
                  setBookingType(null);
                }}>
                  <Plus className="w-4 h-4 mr-2" /> New Booking
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {!bookingType ? 'Select Booking Type' : 
                     bookingType === 'import' ? (isFOBBooking ? 'Create Import Booking from Customer CRO (FOB)' : 'Create Import Container Booking Request') :
                     (isFOBExportBooking ? 'Create Export Booking from Customer CRO (FOB)' : 'Create Export Container Booking Request')}
                  </DialogTitle>
                  {bookingType === 'import' && isFOBBooking && (
                    <p className="text-sm text-amber-400 mt-2">
                      ⚠️ FOB Incoterm: Customer is responsible for booking. Enter CRO details provided by customer.
                    </p>
                  )}
                  {bookingType === 'export' && isFOBExportBooking && (
                    <p className="text-sm text-amber-400 mt-2">
                      ⚠️ FOB Incoterm: Customer is responsible for booking. Enter CRO details provided by customer.
                    </p>
                  )}
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* Booking Type Selection */}
                  {!bookingType && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">Choose the type of booking you want to create:</p>
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          variant="outline"
                          className="h-24 flex flex-col items-center justify-center gap-2"
                          onClick={() => setBookingType('import')}
                        >
                          <Ship className="w-6 h-6 text-blue-400" />
                          <span className="font-medium">Import Booking (PO)</span>
                          <span className="text-xs text-muted-foreground">For purchase orders</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="h-24 flex flex-col items-center justify-center gap-2"
                          onClick={() => setBookingType('export')}
                        >
                          <Package className="w-6 h-6 text-amber-400" />
                          <span className="font-medium">Export Booking (Job Order)</span>
                          <span className="text-xs text-muted-foreground">For job orders</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Purchase Orders Selection for Import */}
                  {bookingType === 'import' && (
                    <div>
                      <Label className="mb-2 block">
                        Select Purchase Orders {isFOBBooking ? '(Awaiting Customer Booking)' : '(Ready for Import Booking)'}
                      </Label>
                      <div className="border border-border rounded-sm max-h-48 overflow-y-auto">
                        {purchaseOrders.length > 0 ? purchaseOrders.map(po => (
                          <div key={po.id} className="flex items-center gap-3 p-3 border-b border-border last:border-0 hover:bg-muted/30">
                            <Checkbox
                              checked={form.po_ids.includes(po.id)}
                              onCheckedChange={() => togglePOSelection(po.id)}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-mono text-sm">{po.po_number}</p>
                                {po.incoterm && (
                                  <Badge variant="outline" className="text-xs">
                                    {po.incoterm}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">{po.supplier_name || 'Supplier'} - </span>
                                {po.lines && po.lines.length > 0 ? (
                                  <span>{po.lines[0].item_name} - Qty: {po.lines[0].qty} {po.lines[0].uom}</span>
                                ) : (
                                  <span>Total: {po.currency} {po.total_amount?.toFixed(2)}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        )) : (
                          <p className="p-4 text-center text-muted-foreground text-sm">No purchase orders available for booking</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Job Order Selection for Export */}
                  {bookingType === 'export' && (
                    <div>
                      {form.job_order_ids.length > 0 ? (
                        // Job already selected - show selected job info
                        <div>
                          <Label className="mb-2 block">Selected Job Order</Label>
                          <div className="border border-border rounded-sm bg-muted/20 p-4">
                            {jobOrders.filter(job => form.job_order_ids.includes(job.id)).map(job => (
                              <div key={job.id} className="flex items-center gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-sm font-medium">{job.job_number}</p>
                                    {job.incoterm && (
                                      <Badge variant="outline" className="text-xs">
                                        {job.incoterm}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    <span className="font-medium">{job.customer_name || 'Customer'}</span>
                                    {job.delivery_date && (
                                      <span> • Delivery: {new Date(job.delivery_date).toLocaleDateString()}</span>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setForm(prev => ({ ...prev, job_order_ids: [] }))}
                                  title="Change job order"
                                >
                                  Change
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        // No job selected - show selection list
                        <div>
                          <Label className="mb-2 block">
                            Select Job Orders (Ready for Dispatch)
                          </Label>
                          <div className="border border-border rounded-sm max-h-48 overflow-y-auto">
                            {jobOrders.length > 0 ? jobOrders.map(job => (
                              <div key={job.id} className="flex items-center gap-3 p-3 border-b border-border last:border-0 hover:bg-muted/30">
                                <Checkbox
                                  checked={form.job_order_ids.includes(job.id)}
                                  onCheckedChange={() => toggleJobSelection(job.id)}
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-mono text-sm">{job.job_number}</p>
                                    {job.status && (
                                      <Badge variant="outline" className="text-xs">
                                        {job.status}
                                      </Badge>
                                    )}
                                    {job.incoterm && (
                                      <Badge variant="outline" className="text-xs">
                                        {job.incoterm}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium">{job.customer_name || 'Customer'} - </span>
                                    {job.delivery_date ? (
                                      <span>Delivery: {new Date(job.delivery_date).toLocaleDateString()}</span>
                                    ) : (
                                      <span>No delivery date</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            )) : (
                              <p className="p-4 text-center text-muted-foreground text-sm">No export job orders (FOB/CFR/CIF/CIP) ready for shipping</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show form fields only when booking type is selected */}
                  {bookingType && (
                    <>
                  {bookingType === 'import' && isFOBBooking && (
                    <>
                      <div className="border-t border-border pt-4 mt-4">
                        <h3 className="font-medium mb-4 text-blue-400">Customer CRO Details (Required for FOB)</h3>
                        <div className="form-grid">
                          <div className="form-field">
                            <Label>CRO Number *</Label>
                            <Input
                              value={form.cro_number}
                              onChange={(e) => setForm({...form, cro_number: e.target.value})}
                              placeholder="Container Release Order number"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Shipping Line *</Label>
                            <Input
                              value={form.shipping_line}
                              onChange={(e) => setForm({...form, shipping_line: e.target.value})}
                              placeholder="e.g., MSC, Maersk, Hapag"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Vessel Name *</Label>
                            <Input
                              value={form.vessel_name}
                              onChange={(e) => setForm({...form, vessel_name: e.target.value})}
                              placeholder="Vessel name"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Vessel Date *</Label>
                            <Input
                              type="date"
                              value={form.vessel_date}
                              onChange={(e) => setForm({...form, vessel_date: e.target.value})}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Cutoff Date *</Label>
                            <Input
                              type="date"
                              value={form.cutoff_date}
                              onChange={(e) => setForm({...form, cutoff_date: e.target.value})}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Gate Cutoff</Label>
                            <Input
                              type="datetime-local"
                              value={form.gate_cutoff}
                              onChange={(e) => setForm({...form, gate_cutoff: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>VGM Cutoff</Label>
                            <Input
                              type="datetime-local"
                              value={form.vgm_cutoff}
                              onChange={(e) => setForm({...form, vgm_cutoff: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>SI Cutoff</Label>
                            <Input
                              type="datetime-local"
                              value={form.si_cutoff}
                              onChange={(e) => setForm({...form, si_cutoff: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>Gate In Date</Label>
                            <Input
                              type="date"
                              value={form.gate_in_date}
                              onChange={(e) => setForm({...form, gate_in_date: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>Pull Out Date</Label>
                            <Input
                              type="date"
                              value={form.pull_out_date}
                              onChange={(e) => setForm({...form, pull_out_date: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>Freight Rate</Label>
                            <Input
                              type="number"
                              value={form.freight_rate || ''}
                              onChange={(e) => setForm({...form, freight_rate: parseFloat(e.target.value) || 0})}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="form-field">
                            <Label>Freight Currency</Label>
                            <Select value={form.freight_currency} onValueChange={(v) => setForm({...form, freight_currency: v})}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="AED">AED</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="form-field">
                            <Label>Freight Charges (Total)</Label>
                            <Input
                              type="number"
                              value={form.freight_charges || ''}
                              onChange={(e) => setForm({...form, freight_charges: parseFloat(e.target.value) || 0})}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {bookingType === 'import' && !(selectedPOs.length > 0 && selectedPOs.every(po => po.incoterm?.toUpperCase() === 'FOB')) && (
                    <div className="form-grid">
                      <div className="form-field">
                        <Label>Shipping Line *</Label>
                        <Input
                          value={form.shipping_line}
                          onChange={(e) => setForm({...form, shipping_line: e.target.value})}
                          placeholder="e.g., MSC, Maersk, Hapag"
                          data-testid="shipping-line-input"
                          required
                        />
                      </div>
                      <div className="form-field">
                        <Label>Container Type</Label>
                        <Select value={form.container_type} onValueChange={(v) => setForm({...form, container_type: v})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTAINER_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="form-field">
                        <Label>Container Count</Label>
                        <Input
                          type="number"
                          min="1"
                          value={form.container_count}
                          onChange={(e) => setForm({...form, container_count: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                  )}

                  {bookingType === 'import' && selectedPOs.length > 0 && selectedPOs.every(po => po.incoterm?.toUpperCase() === 'FOB') && (
                    <div className="form-grid">
                      <div className="form-field">
                        <Label>Container Type</Label>
                        <Select value={form.container_type} onValueChange={(v) => setForm({...form, container_type: v})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTAINER_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="form-field">
                        <Label>Container Count</Label>
                        <Input
                          type="number"
                          min="1"
                          value={form.container_count}
                          onChange={(e) => setForm({...form, container_count: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                  )}

                  {/* FOB Export Booking - CRO Details */}
                  {bookingType === 'export' && isFOBExportBooking && (
                    <>
                      <div className="border-t border-border pt-4 mt-4">
                        <h3 className="font-medium mb-4 text-amber-400">Customer CRO Details (Required for FOB)</h3>
                        <div className="form-grid">
                          <div className="form-field">
                            <Label>CRO Number *</Label>
                            <Input
                              value={form.cro_number}
                              onChange={(e) => setForm({...form, cro_number: e.target.value})}
                              placeholder="Container Release Order number"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Shipping Line *</Label>
                            <Input
                              value={form.shipping_line}
                              onChange={(e) => setForm({...form, shipping_line: e.target.value})}
                              placeholder="e.g., MSC, Maersk, Hapag"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Vessel Name *</Label>
                            <Input
                              value={form.vessel_name}
                              onChange={(e) => setForm({...form, vessel_name: e.target.value})}
                              placeholder="Vessel name"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Vessel Date *</Label>
                            <Input
                              type="date"
                              value={form.vessel_date}
                              onChange={(e) => setForm({...form, vessel_date: e.target.value})}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Cutoff Date *</Label>
                            <Input
                              type="date"
                              value={form.cutoff_date}
                              onChange={(e) => setForm({...form, cutoff_date: e.target.value})}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <Label>Gate Cutoff</Label>
                            <Input
                              type="datetime-local"
                              value={form.gate_cutoff}
                              onChange={(e) => setForm({...form, gate_cutoff: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>VGM Cutoff</Label>
                            <Input
                              type="datetime-local"
                              value={form.vgm_cutoff}
                              onChange={(e) => setForm({...form, vgm_cutoff: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>SI Cutoff</Label>
                            <Input
                              type="datetime-local"
                              value={form.si_cutoff}
                              onChange={(e) => setForm({...form, si_cutoff: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>Gate In Date</Label>
                            <Input
                              type="date"
                              value={form.gate_in_date}
                              onChange={(e) => setForm({...form, gate_in_date: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>Pull Out Date</Label>
                            <Input
                              type="date"
                              value={form.pull_out_date}
                              onChange={(e) => setForm({...form, pull_out_date: e.target.value})}
                            />
                          </div>
                          <div className="form-field">
                            <Label>Freight Rate</Label>
                            <Input
                              type="number"
                              value={form.freight_rate || ''}
                              onChange={(e) => setForm({...form, freight_rate: parseFloat(e.target.value) || 0})}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="form-field">
                            <Label>Freight Currency</Label>
                            <Select value={form.freight_currency} onValueChange={(v) => setForm({...form, freight_currency: v})}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="AED">AED</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="form-field">
                            <Label>Freight Charges (Total)</Label>
                            <Input
                              type="number"
                              value={form.freight_charges || ''}
                              onChange={(e) => setForm({...form, freight_charges: parseFloat(e.target.value) || 0})}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="form-grid mt-4">
                        <div className="form-field">
                          <Label>Container Type</Label>
                          <Select value={form.container_type} onValueChange={(v) => setForm({...form, container_type: v})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CONTAINER_TYPES.map(t => (
                                <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="form-field">
                          <Label>Container Count</Label>
                          <Input
                            type="number"
                            min="1"
                            value={form.container_count}
                            onChange={(e) => setForm({...form, container_count: parseInt(e.target.value)})}
                          />
                        </div>
                        <div className="form-field">
                          <Label>Port of Loading *</Label>
                          <Input
                            value={form.port_of_loading}
                            onChange={(e) => setForm({...form, port_of_loading: e.target.value})}
                            placeholder="e.g., Jebel Ali"
                            required
                          />
                        </div>
                        <div className="form-field">
                          <Label>Port of Discharge *</Label>
                          <Input
                            value={form.port_of_discharge}
                            onChange={(e) => setForm({...form, port_of_discharge: e.target.value})}
                            placeholder="e.g., Mumbai"
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Shipping Line for Export Bookings (Non-FOB) */}
                  {bookingType === 'export' && !isFOBExportBooking && (
                    <div className="form-grid">
                      <div className="form-field">
                        <Label>Shipping Line *</Label>
                        <Input
                          value={form.shipping_line}
                          onChange={(e) => setForm({...form, shipping_line: e.target.value})}
                          placeholder="e.g., MSC, Maersk, Hapag"
                          data-testid="shipping-line-input-export"
                          required
                        />
                      </div>
                      <div className="form-field">
                        <Label>Container Type</Label>
                        <Select value={form.container_type} onValueChange={(v) => setForm({...form, container_type: v})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTAINER_TYPES.map(t => (
                              <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="form-field">
                        <Label>Container Count</Label>
                        <Input
                          type="number"
                          min="1"
                          value={form.container_count}
                          onChange={(e) => setForm({...form, container_count: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Port of Loading *</Label>
                      <Input
                        value={form.port_of_loading}
                        onChange={(e) => setForm({...form, port_of_loading: e.target.value})}
                        placeholder="e.g., Jebel Ali"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Port of Discharge *</Label>
                      <Input
                        value={form.port_of_discharge}
                        onChange={(e) => setForm({...form, port_of_discharge: e.target.value})}
                        placeholder="e.g., Mumbai"
                      />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Cargo Description</Label>
                      <Input
                        value={form.cargo_description}
                        onChange={(e) => setForm({...form, cargo_description: e.target.value})}
                        placeholder="Brief cargo description"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Cargo Weight (MT)</Label>
                      <Input
                        type="number"
                        value={form.cargo_weight || ''}
                        onChange={(e) => setForm({...form, cargo_weight: parseFloat(e.target.value)})}
                        placeholder="Total weight"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={form.is_dg}
                        onCheckedChange={(checked) => setForm({...form, is_dg: checked})}
                      />
                      <Label>Dangerous Goods (DG)</Label>
                    </div>
                    {form.is_dg && (
                      <div className="form-field flex-1">
                        <Input
                          value={form.dg_class}
                          onChange={(e) => setForm({...form, dg_class: e.target.value})}
                          placeholder="DG Class (e.g., 3, 8, 9)"
                        />
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({...form, notes: e.target.value})}
                      placeholder="Additional notes for shipping line..."
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => {
                      setCreateOpen(false);
                      resetForm();
                    }}>Cancel</Button>
                    <Button onClick={handleCreate} data-testid="submit-booking-btn">
                      {bookingType === 'import' && isFOBBooking 
                        ? 'Create Booking from Customer CRO' 
                        : bookingType === 'export' && isFOBExportBooking
                        ? 'Create Booking from Customer CRO'
                        : 'Create Booking Request'}
                    </Button>
                  </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Alert for pending CRO */}
      {pendingCRO > 0 && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <div>
                <p className="font-medium text-amber-400">{pendingCRO} booking(s) pending CRO</p>
                <p className="text-sm text-muted-foreground">Contact shipping lines and enter CRO details to generate transport schedules</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import and Export Tables Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* IMPORT TABLE - Purchase Orders */}
        <div className="data-grid">
          <div className="data-grid-header" style={{ background: 'rgba(59, 130, 246, 0.1)', borderBottom: '2px solid rgb(59, 130, 246)' }}>
            <h3 className="font-medium text-blue-400">
              🔵 Import Bookings  ({importBookings.length})
            </h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : importBookings.length === 0 ? (
            <div className="empty-state">
              <Ship className="empty-state-icon text-blue-400" />
              <p className="empty-state-title">No import bookings</p>
              <p className="empty-state-description">Create a booking for FOB purchase orders</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>Booking #</th>
                    <th>PO #</th>
                    <th>Supplier</th>
                    <th>Incoterm</th>
                    <th>Shipping Line</th>
                    <th>Container</th>
                    <th>CRO #</th>
                    <th>Vessel</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {importBookings.map((booking) => (
                    <tr 
                      key={booking.id} 
                      data-testid={`booking-row-${booking.booking_number}`}
                      className={booking.status === 'pending_details' ? 'bg-amber-500/5' : ''}
                    >
                      <td className="font-medium">{booking.booking_number}</td>
                      <td className="text-xs font-mono text-blue-400">
                        {booking.po_number || '-'}
                      </td>
                      <td className="text-sm">{booking.supplier_name || '-'}</td>
                      <td>
                        <Badge variant="outline" className="text-xs">
                          {booking.incoterm || 'FOB'}
                        </Badge>
                      </td>
                      <td className="text-sm">{booking.shipping_line}</td>
                      <td>{booking.container_count}x {booking.container_type?.toUpperCase()}</td>
                      <td className={booking.cro_number ? 'text-emerald-400 font-mono' : 'text-amber-400'}>
                        {booking.cro_number || 'Pending'}
                      </td>
                      <td className="text-xs">
                        {booking.vessel_name ? (
                          <div>
                            <p>{booking.vessel_name}</p>
                            <p className="text-muted-foreground">{formatDate(booking.vessel_date)}</p>
                          </div>
                        ) : '-'}
                      </td>
                      <td><Badge className={getStatusColor(booking.status)}>{booking.status?.replace(/_/g, ' ')}</Badge></td>
                      <td>
                        {canCreate && (
                          <>
                            {/* Edit Booking Details Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(booking)}
                              title="Edit Booking Details"
                              data-testid={`edit-booking-${booking.booking_number}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            
                            {/* CRO Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openCRODialog(booking)}
                              title="Enter/Edit CRO Details"
                              data-testid={`cro-booking-${booking.booking_number}`}
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* EXPORT TABLE - Job Orders */}
        <div className="data-grid">
          <div className="data-grid-header" style={{ background: 'rgba(251, 191, 36, 0.1)', borderBottom: '2px solid rgb(251, 191, 36)' }}>
            <h3 className="font-medium text-amber-400">
              🟡 Export Bookings  ({existingExportBookings.length} booked, {unbookedJobs.length} unbooked)
            </h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : exportBookings.length === 0 ? (
            <div className="empty-state">
              <Package className="empty-state-icon text-amber-400" />
              <p className="empty-state-title">No export bookings</p>
              <p className="empty-state-description">Create a booking for job orders</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>Booking #</th>
                    <th>Job #</th>
                    <th>Customer</th>
                    <th>Incoterm</th>
                    <th>Shipping Line</th>
                    <th>Container</th>
                    <th>CRO #</th>
                    <th>Vessel</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exportBookings.map((booking) => {
                    const isUnbooked = booking.isUnbookedJob;
                    const incoterm = (booking.incoterm || '').toUpperCase();
                    const isFOB = incoterm === 'FOB';
                    
                    return (
                      <tr 
                        key={booking.id} 
                        data-testid={`booking-row-${booking.booking_number || booking.job_number}`}
                        className={booking.status === 'pending_details' || isUnbooked ? 'bg-amber-500/5' : ''}
                      >
                        <td className="font-medium">
                          {isUnbooked ? (
                            <span className="text-muted-foreground text-xs">-</span>
                          ) : (
                            booking.booking_number
                          )}
                        </td>
                        <td className="text-xs font-mono text-amber-400">
                          {Array.isArray(booking.job_numbers) 
                            ? booking.job_numbers.join(', ') 
                            : (typeof booking.job_numbers === 'string' 
                              ? booking.job_numbers 
                              : (booking.job_number || '-'))}
                        </td>
                        <td className="text-sm">{booking.customer_name || '-'}</td>
                        <td>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              incoterm === 'FOB' ? 'text-blue-400 border-blue-400' : 
                              'text-green-400 border-green-400'
                            }`}
                          >
                            {incoterm || '-'}
                          </Badge>
                        </td>
                        <td className="text-sm">{booking.shipping_line || '-'}</td>
                        <td>
                          {booking.container_count && booking.container_type 
                            ? `${booking.container_count}x ${booking.container_type.toUpperCase()}`
                            : '-'}
                        </td>
                        <td className={booking.cro_number ? 'text-emerald-400 font-mono' : 'text-amber-400'}>
                          {booking.cro_number || 'Pending'}
                        </td>
                        <td className="text-xs">
                          {booking.vessel_name ? (
                            <div>
                              <p>{booking.vessel_name}</p>
                              <p className="text-muted-foreground">{formatDate(booking.vessel_date)}</p>
                            </div>
                          ) : '-'}
                        </td>
                        <td>
                          {isUnbooked ? (
                            <Badge variant="outline" className="text-xs">
                              {incoterm} - Unbooked
                            </Badge>
                          ) : (
                            <Badge className={getStatusColor(booking.status)}>
                              {booking.status?.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </td>
                        <td>
                          {canCreate && (
                            <>
                              {isUnbooked ? (
                                // Unbooked job - Show "Book Shipping" button
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    // Pre-fill form with job and open create dialog
                                    setForm(prev => ({
                                      ...prev,
                                      job_order_ids: booking.job_order_ids,
                                      booking_source: isFOB ? 'CUSTOMER' : 'SELLER',
                                      cro_number: '',
                                      vessel_name: '',
                                      vessel_date: '',
                                      cutoff_date: '',
                                      shipping_line: '',
                                      container_type: booking.jobData?.container_type || '20ft',
                                      container_count: booking.jobData?.container_count || 1
                                    }));
                                    setBookingType('export');
                                    setCreateOpen(true);
                                  }}
                                  title={isFOB ? "Book Shipping (Enter CRO)" : "Book Shipping"}
                                  data-testid={`book-shipping-${booking.job_number}`}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Book Shipping
                                </Button>
                              ) : (
                                // Existing booking buttons
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(booking)}
                                    title="Edit Booking Details"
                                    data-testid={`edit-booking-${booking.booking_number}`}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openCRODialog(booking)}
                                    title="Enter/Edit CRO Details"
                                    data-testid={`cro-booking-${booking.booking_number}`}
                                  >
                                    <FileText className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CRO Dialog */}
      <Dialog open={croOpen} onOpenChange={setCroOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>CRO Details - {selectedBooking?.booking_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            <Card className="bg-muted/30">
              <CardContent className="py-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div><span className="text-muted-foreground">Line:</span> {selectedBooking?.shipping_line}</div>
                  <div><span className="text-muted-foreground">Container:</span> {selectedBooking?.container_count}x {selectedBooking?.container_type}</div>
                  <div><span className="text-muted-foreground">Route:</span> {selectedBooking?.port_of_loading} → {selectedBooking?.port_of_discharge}</div>
                </div>
              </CardContent>
            </Card>

            <div className="form-grid">
              <div className="form-field">
                <Label>CRO Number *</Label>
                <Input
                  value={croForm.cro_number}
                  onChange={(e) => setCroForm({...croForm, cro_number: e.target.value})}
                  placeholder="Container Release Order #"
                  data-testid="cro-number-input"
                />
              </div>
              <div className="form-field">
                <Label>Vessel Name *</Label>
                <Input
                  value={croForm.vessel_name}
                  onChange={(e) => setCroForm({...croForm, vessel_name: e.target.value})}
                  placeholder="Vessel name"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Vessel Date (ETD) *</Label>
                <Input
                  type="date"
                  value={croForm.vessel_date}
                  onChange={(e) => setCroForm({...croForm, vessel_date: e.target.value})}
                  data-testid="vessel-date-input"
                />
              </div>
              <div className="form-field">
                <Label>Cutoff Date *</Label>
                <Input
                  type="date"
                  value={croForm.cutoff_date}
                  onChange={(e) => setCroForm({...croForm, cutoff_date: e.target.value})}
                  data-testid="cutoff-date-input"
                />
                <p className="text-xs text-muted-foreground mt-1">Transport pickup will be scheduled 3 days before</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Pull Out Date</Label>
                <Input
                  type="date"
                  value={croForm.pull_out_date}
                  onChange={(e) => setCroForm({...croForm, pull_out_date: e.target.value})}
                  data-testid="pull-out-date-input"
                />
                <p className="text-xs text-muted-foreground mt-1">Container pull out from depot</p>
              </div>
              <div className="form-field">
                <Label>SI Cutoff (Shipping Instructions)</Label>
                <Input
                  type="datetime-local"
                  value={croForm.si_cutoff}
                  onChange={(e) => setCroForm({...croForm, si_cutoff: e.target.value})}
                  data-testid="si-cutoff-input"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Gate In Date</Label>
                <Input
                  type="date"
                  value={croForm.gate_in_date}
                  onChange={(e) => setCroForm({...croForm, gate_in_date: e.target.value})}
                  data-testid="gate-in-date-input"
                />
                <p className="text-xs text-muted-foreground mt-1">Container gate in at port</p>
              </div>
              <div className="form-field">
                <Label>Gate Cutoff</Label>
                <Input
                  type="datetime-local"
                  value={croForm.gate_cutoff}
                  onChange={(e) => setCroForm({...croForm, gate_cutoff: e.target.value})}
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>VGM Cutoff</Label>
                <Input
                  type="datetime-local"
                  value={croForm.vgm_cutoff}
                  onChange={(e) => setCroForm({...croForm, vgm_cutoff: e.target.value})}
                />
              </div>
              <div className="form-field">
                <Label>Freight Charges (Total)</Label>
                <Input
                  type="number"
                  value={croForm.freight_charges || ''}
                  onChange={(e) => setCroForm({...croForm, freight_charges: parseFloat(e.target.value)})}
                  placeholder="Total freight cost"
                  data-testid="freight-charges-input"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Freight Rate (per container)</Label>
                <Input
                  type="number"
                  value={croForm.freight_rate || ''}
                  onChange={(e) => setCroForm({...croForm, freight_rate: parseFloat(e.target.value)})}
                  placeholder="Per container"
                />
              </div>
              <div className="form-field">
                <Label>Currency</Label>
                <Select value={croForm.freight_currency} onValueChange={(v) => setCroForm({...croForm, freight_currency: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>THC (Terminal Handling Charge)</Label>
                <Input
                  type="number"
                  value={croForm.thc_charges || ''}
                  onChange={(e) => setCroForm({...croForm, thc_charges: parseFloat(e.target.value) || 0})}
                  placeholder="Terminal handling charge"
                />
              </div>
              <div className="form-field">
                <Label>TLUC (Terminal Loading/Unloading Charge)</Label>
                <Input
                  type="number"
                  value={croForm.tluc_charges || ''}
                  onChange={(e) => setCroForm({...croForm, tluc_charges: parseFloat(e.target.value) || 0})}
                  placeholder="Terminal loading/unloading charge"
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>ED (Export Declaration) Charges</Label>
                <Input
                  type="number"
                  value={croForm.ed_charges || ''}
                  onChange={(e) => setCroForm({...croForm, ed_charges: parseFloat(e.target.value) || 0})}
                  placeholder="Export declaration charges"
                />
              </div>
              <div className="form-field">
                {/* Empty field for grid alignment */}
              </div>
            </div>

            <div className="bg-sky-500/10 border border-sky-500/30 rounded-sm p-3">
              <p className="text-sm text-sky-400">
                <strong>Note:</strong> When you save CRO details, the system will automatically:
              </p>
              <ul className="text-xs text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                <li>Generate transport schedule (pickup 3 days before cutoff)</li>
                <li>Create dispatch schedule for Security department</li>
                <li>Link job orders for cargo identification</li>
              </ul>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-border mt-auto">
            <Button variant="outline" onClick={() => setCroOpen(false)}>Cancel</Button>
            <Button onClick={handleCROUpdate} data-testid="save-cro-btn">Save CRO & Generate Schedule</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Booking Details Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Booking Details - {selectedBooking?.booking_number}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 py-4">
            <Card className="bg-muted/30">
              <CardContent className="py-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">PO:</span> {selectedBooking?.po_number || 'N/A'}</div>
                  <div><span className="text-muted-foreground">Supplier:</span> {selectedBooking?.supplier_name || 'N/A'}</div>
                </div>
              </CardContent>
            </Card>

            {/* Alert for required fields */}
            {selectedBooking?.status === 'pending_details' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-500">Booking Details Required</p>
                  <p className="text-muted-foreground">Please fill in all required fields marked with *</p>
                </div>
              </div>
            )}

            <div className="form-grid">
              <div className="form-field">
                <Label>Shipping Line *</Label>
                <Input
                  value={editForm.shipping_line}
                  onChange={(e) => setEditForm({...editForm, shipping_line: e.target.value})}
                  placeholder="e.g., MAERSK, MSC, HAPAG"
                  required
                />
              </div>
              <div className="form-field">
                <Label>Container Type *</Label>
                <Select
                  value={editForm.container_type}
                  onValueChange={(value) => setEditForm({...editForm, container_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAINER_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type.toUpperCase().replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Container Count *</Label>
                <Input
                  type="number"
                  min="1"
                  value={editForm.container_count || ''}
                  onChange={(e) => setEditForm({...editForm, container_count: parseInt(e.target.value)})}
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Port of Loading *</Label>
                <Input
                  value={editForm.port_of_loading}
                  onChange={(e) => setEditForm({...editForm, port_of_loading: e.target.value})}
                  placeholder="e.g., Shanghai, Singapore"
                  required
                />
              </div>
              <div className="form-field">
                <Label>Port of Discharge *</Label>
                <Input
                  value={editForm.port_of_discharge}
                  onChange={(e) => setEditForm({...editForm, port_of_discharge: e.target.value})}
                  placeholder="e.g., Mombasa, Dubai"
                  required
                />
              </div>
            </div>

            <div className="form-field">
              <Label>Cargo Description</Label>
              <Textarea
                value={editForm.cargo_description}
                onChange={(e) => setEditForm({...editForm, cargo_description: e.target.value})}
                placeholder="Describe the cargo..."
                rows={2}
              />
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Cargo Weight (MT) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.cargo_weight || ''}
                  onChange={(e) => setEditForm({...editForm, cargo_weight: parseFloat(e.target.value)})}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Weight in Metric Tons</p>
              </div>
              <div className="form-field">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={editForm.is_dg}
                    onCheckedChange={(checked) => setEditForm({...editForm, is_dg: checked})}
                  />
                  Dangerous Goods (DG)
                </Label>
                {editForm.is_dg && (
                  <Input
                    value={editForm.dg_class}
                    onChange={(e) => setEditForm({...editForm, dg_class: e.target.value})}
                    placeholder="DG Class (e.g., UN1203, Class 3)"
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            <div className="form-field">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save Booking Details
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
