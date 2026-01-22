import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import {
  Truck, ArrowDownToLine, ArrowUpFromLine, Package, Check, Clock,
  AlertTriangle, Plus, Calendar, MapPin, Ship, Container, RefreshCw,
  Globe, Home, Eye, Phone, User, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const TransportWindowPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inward_ddp');
  const [inwardDDP, setInwardDDP] = useState([]);
  const [inwardEXW, setInwardEXW] = useState([]);
  const [inwardImport, setInwardImport] = useState([]);
  const [localDispatch, setLocalDispatch] = useState([]);
  const [exportContainer, setExportContainer] = useState([]);
  const [dispatchJobs, setDispatchJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingType, setBookingType] = useState(null);
  const [bookingItem, setBookingItem] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:37',message:'loadData called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setLoading(true);
    try {
      const [inwardRes, outwardRes, importsRes, posRes, jobsRes] = await Promise.all([
        api.get('/transport/inward').catch((err) => {
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:41',message:'transport/inward API call failed',data:{error:err?.message||String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.error('Failed to load transport/inward:', err);
          return { data: [] };
        }),
        api.get('/transport/outward').catch((err) => {
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:42',message:'transport/outward API call failed',data:{error:err?.message||String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.error('Failed to load transport/outward:', err);
          return { data: [] };
        }),
        api.get('/imports').catch(() => ({ data: [] })),
        api.get('/purchase-orders', { params: { status: 'APPROVED' } }).catch(() => ({ data: [] })),
        api.get('/job-orders', { params: { status: 'ready_for_dispatch' } }).catch(() => ({ data: [] }))
      ]);
      
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:48',message:'API responses received',data:{inwardLength:inwardRes?.data?.length||0,outwardLength:outwardRes?.data?.length||0,importsLength:importsRes?.data?.length||0,posLength:posRes?.data?.length||0,jobsLength:jobsRes?.data?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const inward = inwardRes.data || [];
      
      // Show ALL DDP inward transports (both booked and unbooked)
      const bookedDDP = inward.filter(t => 
        (t.source === 'PO_DDP' || t.incoterm === 'DDP')
      );
      
      // Show ALL EXW inward transports (both booked and unbooked)
      const bookedEXW = inward.filter(t => 
        (t.source === 'PO_EXW' || t.incoterm === 'EXW')
      );
      
      // Get unbooked DDP POs that need transport booking
      const existingDDPPOIds = new Set(bookedDDP.map(t => t.po_id).filter(Boolean));
      const unbookedDDPPOs = (posRes.data || []).filter(po => 
        po.status === 'APPROVED' &&
        po.incoterm === 'DDP' &&
        !existingDDPPOIds.has(po.id) &&
        !po.transport_booked &&
        !po.transport_number
      );
      
      // Get unbooked EXW POs that need transport booking
      const existingPOIds = new Set(bookedEXW.map(t => t.po_id).filter(Boolean));
      const unbookedPOs = (posRes.data || []).filter(po => 
        po.status === 'APPROVED' &&
        po.incoterm === 'EXW' &&
        !existingPOIds.has(po.id) &&
        !po.transport_booked &&
        !po.transport_number
      );
      
      // Combine booked transports with unbooked POs for DDP
      const finalInwardDDP = [
        ...bookedDDP,
        ...unbookedDDPPOs.map(po => ({
          id: `unbooked-po-${po.id}`,
          po_id: po.id,
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          incoterm: po.incoterm || 'DDP',
          source: 'PO_DDP',
          total_quantity: po.total_quantity,
          total_unit: po.total_unit,
          total_uom: po.total_unit,
          delivery_date: po.delivery_date,
          status: 'NOT_BOOKED',
          transport_number: null,
          needs_booking: true,
          po_items: po.lines || po.po_items || []
        }))
      ];
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:81',message:'Setting inwardDDP state',data:{finalInwardDDPLength:finalInwardDDP.length,bookedDDPCount:bookedDDP.length,unbookedDDPCount:unbookedDDPPOs.length,statuses:finalInwardDDP.map(t=>t.status)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setInwardDDP(finalInwardDDP);
      
      // Combine booked transports with unbooked POs for EXW
      const finalInwardEXW = [
        ...bookedEXW,
        ...unbookedPOs.map(po => ({
          id: `unbooked-po-${po.id}`,
          po_id: po.id,
          po_number: po.po_number,
          supplier_name: po.supplier_name,
          incoterm: po.incoterm || 'EXW',
          source: 'PO_EXW',
          total_quantity: po.total_quantity,
          total_unit: po.total_unit,
          total_uom: po.total_unit,
          delivery_date: po.delivery_date,
          status: 'NOT_BOOKED',
          transport_number: null,
          needs_booking: true,
          po_items: po.lines || po.po_items || []
        }))
      ];
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:102',message:'Setting inwardEXW state',data:{finalInwardEXWLength:finalInwardEXW.length,bookedEXWCount:bookedEXW.length,unbookedEXWCount:unbookedPOs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setInwardEXW(finalInwardEXW);
      
      // Import logistics from imports collection
      const finalInwardImport = importsRes.data || [];
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:123',message:'Setting inwardImport state',data:{finalInwardImportLength:finalInwardImport.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setInwardImport(finalInwardImport);
      
      const outward = outwardRes.data || [];
      
      // Handle paginated response structure - jobsRes.data is {data: [...], pagination: {...}}
      const jobsResponse = jobsRes?.data || {};
      const jobsData = Array.isArray(jobsResponse.data) ? jobsResponse.data : (Array.isArray(jobsResponse) ? jobsResponse : []);
      
      // Create a map of job_id to job_number for quick lookup
      const jobNumberMap = new Map();
      jobsData.forEach(job => {
        if (job.id && job.job_number) {
          jobNumberMap.set(job.id, job.job_number);
        }
      });
      
      // Enrich booked transports with job_number if missing
      const enrichedOutward = outward.map(t => {
        if (t.job_order_id && !t.job_number && jobNumberMap.has(t.job_order_id)) {
          return { ...t, job_number: jobNumberMap.get(t.job_order_id) };
        }
        return t;
      });
      
      // Show ALL local dispatch transports (both booked and unbooked)
      const bookedLocal = enrichedOutward.filter(t => t.transport_type === 'LOCAL');
      
      // Get unbooked jobs that need dispatch booking
      const existingJobIds = new Set(bookedLocal.map(t => t.job_order_id).filter(Boolean));
      
      // Include ALL ready_for_dispatch jobs, not just those with specific incoterms
      // The incoterm filter was too restrictive - show all jobs ready for dispatch
      const unbookedJobs = jobsData.filter(job => 
        job.status === 'ready_for_dispatch' &&
        !existingJobIds.has(job.id) &&
        !job.transport_outward_id &&
        !job.transport_booked
      );
      
      // Combine booked local dispatches with unbooked jobs
      const finalLocalDispatch = [
        ...bookedLocal,
        ...unbookedJobs.map(job => ({
          id: `unbooked-job-${job.id}`,
          job_order_id: job.id,
          job_number: job.job_number,
          customer_name: job.customer_name,
          product_name: job.product_name,
          products_summary: job.product_name,
          total_quantity: job.quantity || job.total_weight_mt,
          unit: job.unit || 'MT',
          packaging: job.packaging,
          transport_type: 'LOCAL',
          status: 'NOT_BOOKED',
          transport_number: null,
          needs_booking: true,
          delivery_date: job.delivery_date || job.expected_delivery_date,
          total_weight_mt: job.total_weight_mt
        }))
      ];
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:143',message:'Setting localDispatch state',data:{finalLocalDispatchLength:finalLocalDispatch.length,bookedLocalCount:bookedLocal.length,unbookedJobsCount:unbookedJobs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setLocalDispatch(finalLocalDispatch);
      
      // Show ALL container transports (both booked and unbooked)
      const bookedContainer = enrichedOutward.filter(t => t.transport_type === 'CONTAINER');
      
      // Get unbooked jobs that need container transport booking
      const existingContainerJobIds = new Set(bookedContainer.map(t => t.job_order_id).filter(Boolean));
      // Also check jobs that are already in bookedContainer to avoid duplicates
      const allContainerJobIds = new Set([...existingContainerJobIds, ...existingJobIds]);
      const unbookedContainerJobs = jobsData.filter(job => 
        job.status === 'ready_for_dispatch' &&
        !allContainerJobIds.has(job.id) &&
        !job.transport_outward_id &&
        !job.transport_booked &&
        // Check if job needs container transport (has container_count or container_type)
        (job.container_count > 0 || job.container_type)
      );
      
      // Combine booked containers with unbooked jobs
      const finalExportContainer = [
        ...bookedContainer,
        ...unbookedContainerJobs.map(job => ({
          id: `unbooked-job-${job.id}`,
          job_order_id: job.id,
          job_number: job.job_number,
          customer_name: job.customer_name,
          product_name: job.product_name,
          products_summary: job.product_name,
          total_quantity: job.quantity || job.total_weight_mt,
          unit: job.unit || 'MT',
          packaging: job.packaging,
          container_count: job.container_count,
          container_type: job.container_type,
          transport_type: 'CONTAINER',
          status: 'NOT_BOOKED',
          transport_number: null,
          needs_booking: true,
          delivery_date: job.delivery_date || job.expected_delivery_date,
          total_weight_mt: job.total_weight_mt
        }))
      ];
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:163',message:'Setting exportContainer state',data:{finalExportContainerLength:finalExportContainer.length,bookedContainerCount:bookedContainer.length,unbookedContainerJobsCount:unbookedContainerJobs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setExportContainer(finalExportContainer);

      // Calculate dispatch jobs with balance quantities (for "Jobs Ready for Dispatch" table)
      const readyJobs = jobsData.filter(j => 
        j.status === 'ready_for_dispatch' || j.status === 'approved'
      );
      
      // CRITICAL: Only consider properly booked transports (have transport_number and not auto-created)
      const bookedOutward = outward.filter(t => 
        t.transport_number && t.source !== 'JOB_LOCAL_AUTO'
      );
      
      // Group transport bookings by job_order_id to calculate quantities
      const transportByJobId = {};
      bookedOutward.forEach(t => {
        const jobId = t.job_order_id;
        if (jobId) {
          if (!transportByJobId[jobId]) {
            transportByJobId[jobId] = [];
          }
          transportByJobId[jobId].push(t);
        }
      });
      
      const dispatchJobsWithBalance = readyJobs.map(job => {
        const jobTransports = transportByJobId[job.id] || [];
        const hasTransport = jobTransports.length > 0;
        
        // Calculate quantity booked from all transport bookings
        const quantityBooked = jobTransports.reduce((sum, t) => sum + (t.quantity || 0), 0);
        // Use total_weight_mt instead of quantity (quantity is in drums/KG, but bookings are in MT)
        const totalQuantityMT = job.total_weight_mt || 0;
        const balanceQuantity = totalQuantityMT - quantityBooked;
        
        return {
          ...job,
          type: 'JO',
          // Job needs booking if balance quantity > 0 (regardless of whether transports exist)
          needs_booking: balanceQuantity > 0,
          status: job.status === 'ready_for_dispatch' ? 'READY' : 'APPROVED',
          // Include transport bookings and calculated quantities
          transport_bookings: jobTransports,
          quantity_booked: quantityBooked,
          balance_quantity: balanceQuantity
        };
      });
      
      setDispatchJobs(dispatchJobsWithBalance);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:165',message:'loadData error caught',data:{errorMessage:error?.message||String(error),errorName:error?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.error('Failed to load transport data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status, type) => {
    try {
      await api.put(`/transport/${type}/${id}/status`, null, { params: { status } });
      toast.success(`Transport ${status.toLowerCase()}`);
      
      // Store notification for LoadingUnloadingWindow
      if (status === 'IN_TRANSIT' && type === 'inward') {
        // Get transport details for notification
        const transport = [...inwardDDP, ...inwardEXW, ...inwardImport].find(t => t.id === id);
        if (transport) {
          const notificationKey = `unloading-in-transit-${transport.transport_number || transport.id}`;
          const notificationData = {
            transport_number: transport.transport_number,
            po_number: transport.po_number,
            supplier_name: transport.supplier_name,
            timestamp: new Date().toISOString(),
            type: 'IN_TRANSIT'
          };
          localStorage.setItem(notificationKey, JSON.stringify(notificationData));
        }
      } else if (status === 'LOADING' && type === 'outward') {
        // Get transport details for notification
        const transport = [...localDispatch, ...exportContainer].find(t => t.id === id);
        if (transport) {
          const notificationKey = `loading-started-${transport.transport_number || transport.id}`;
          const notificationData = {
            transport_number: transport.transport_number,
            job_number: transport.job_number || transport.job_numbers?.[0],
            customer_name: transport.customer_name,
            timestamp: new Date().toISOString(),
            type: 'LOADING'
          };
          localStorage.setItem(notificationKey, JSON.stringify(notificationData));
        }
      }
      
      loadData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleViewDetails = (transport) => {
    setSelectedTransport(transport);
    setShowDetailModal(true);
  };

  // Stats
  const ddpPending = inwardDDP.filter(t => t.status === 'PENDING').length;
  const exwPending = inwardEXW.filter(t => t.status === 'PENDING').length;
  const importPending = inwardImport.filter(t => t.status === 'PENDING').length;
  const localPending = localDispatch.filter(t => t.status === 'PENDING').length;
  const exportPending = exportContainer.filter(t => t.status === 'PENDING').length;
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TransportWindowPage.js:219',message:'Computed pending counts',data:{ddpPending,exwPending,importPending,localPending,exportPending,inwardDDPLength:inwardDDP.length,inwardEXWLength:inwardEXW.length,inwardImportLength:inwardImport.length,localDispatchLength:localDispatch.length,exportContainerLength:exportContainer.length,inwardDDPStatuses:inwardDDP.map(t=>t.status)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  // Calculate MT totals for dispatched and pending
  const allOutwardTransports = [...localDispatch, ...exportContainer];
  
  // Calculate dispatched MT (DISPATCHED, DELIVERED, AT_PORT, SHIPPED statuses)
  const dispatchedMT = allOutwardTransports
    .filter(t => ['DISPATCHED', 'DELIVERED', 'AT_PORT', 'SHIPPED'].includes(t.status))
    .reduce((sum, t) => {
      const qty = parseFloat(t.quantity) || 0;
      // If quantity is 0 but total_weight_mt exists, use that
      if (qty === 0 && t.total_weight_mt) {
        return sum + (parseFloat(t.total_weight_mt) || 0);
      }
      return sum + qty;
    }, 0);
  
  // Calculate pending MT (PENDING, LOADING, NEEDS_BOOKING statuses)
  const pendingMT = allOutwardTransports
    .filter(t => ['PENDING', 'LOADING', 'NEEDS_BOOKING'].includes(t.status))
    .reduce((sum, t) => {
      let qty = parseFloat(t.quantity) || 0;
      // For unbooked jobs or if quantity is 0, try total_weight_mt
      if (qty === 0 && t.total_weight_mt) {
        qty = parseFloat(t.total_weight_mt) || 0;
      }
      return sum + qty;
    }, 0);

  // Filter scheduled bookings for inward (DDP, EXW, Import with status SCHEDULED or IN_TRANSIT)
  const inwardScheduled = useMemo(() => {
    const allInward = [...inwardDDP, ...inwardEXW, ...inwardImport];
    return allInward.filter(t => 
      t.transport_number && 
      (t.status === 'SCHEDULED' || t.status === 'IN_TRANSIT' || t.status === 'PENDING')
    );
  }, [inwardDDP, inwardEXW, inwardImport]);

  // Filter scheduled bookings for outward (Local/Container with status SCHEDULED or LOADING, or ready for dispatch)
  const outwardScheduled = useMemo(() => {
    return allOutwardTransports.filter(t => 
      // Include booked transports that are scheduled/loading/pending
      (t.transport_number && (t.status === 'SCHEDULED' || t.status === 'LOADING' || t.status === 'PENDING')) ||
      // Include unbooked jobs that are ready for dispatch
      (t.needs_booking && t.status === 'NOT_BOOKED' && t.job_number)
    );
  }, [localDispatch, exportContainer]);

  // Filter today's deliveries
  const isTodayDelivery = (transport) => {
    const today = new Date().toISOString().split('T')[0];
    const deliveryDate = transport.dispatch_date || transport.eta || transport.delivery_date || transport.expected_delivery;
    return deliveryDate && deliveryDate.startsWith(today);
  };

  const todaysDeliveries = useMemo(() => {
    const allTransports = [...inwardDDP, ...inwardEXW, ...inwardImport, ...localDispatch, ...exportContainer];
    return allTransports.filter(isTodayDelivery);
  }, [inwardDDP, inwardEXW, inwardImport, localDispatch, exportContainer]);

  // Calculate pending transportation bookings with urgency levels
  const pendingTransportBookings = useMemo(() => {
    const allTransports = [...inwardDDP, ...inwardEXW, ...inwardImport, ...localDispatch, ...exportContainer];
    const unbookedOrders = allTransports.filter(transport =>
      transport.status === 'NOT_BOOKED' ||
      (!transport.transport_number && transport.needs_booking)
    );

    const today = new Date();
    const categorized = {
      urgent: [], // > 3 days (red)
      warning: [], // 2-3 days (yellow)
      normal: []  // < 2 days (green)
    };

    unbookedOrders.forEach(order => {
      const deliveryDate = order.delivery_date || order.expected_delivery;
      if (!deliveryDate) {
        categorized.normal.push(order);
        return;
      }

      const deliveryDateObj = new Date(deliveryDate);
      const daysDiff = Math.floor((today - deliveryDateObj) / (1000 * 60 * 60 * 24));

      if (daysDiff > 3) {
        categorized.urgent.push({ ...order, daysPending: daysDiff });
      } else if (daysDiff >= 2) {
        categorized.warning.push({ ...order, daysPending: daysDiff });
      } else {
        categorized.normal.push({ ...order, daysPending: daysDiff });
      }
    });

    return categorized;
  }, [inwardDDP, inwardEXW, inwardImport, localDispatch, exportContainer]);

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="transport-window-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="w-8 h-8 text-blue-500" />
          Transport Window
        </h1>
        <p className="text-muted-foreground mt-1">
          Transport Window Dashboard - All Views
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-8 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-emerald-500/30">
          <p className="text-sm text-muted-foreground">Inward DDP Pending</p>
          <p className="text-2xl font-bold text-emerald-400">{ddpPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Inward EXW Pending</p>
          <p className="text-2xl font-bold text-blue-400">{exwPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Inward Import Pending</p>
          <p className="text-2xl font-bold text-purple-400">{importPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Local Dispatch Pending</p>
          <p className="text-2xl font-bold text-amber-400">{localPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Export Container Pending</p>
          <p className="text-2xl font-bold text-green-400">{exportPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Dispatched MT</p>
          <p className="text-2xl font-bold text-cyan-400">{dispatchedMT.toFixed(2)}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-orange-500/30">
          <p className="text-sm text-muted-foreground">Pending MT</p>
          <p className="text-2xl font-bold text-orange-400">{pendingMT.toFixed(2)}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Today's Deliveries</p>
          <p className="text-2xl font-bold text-green-400">{todaysDeliveries.length}</p>
        </div>
      </div>

      {/* PENDING TRANSPORTATION BOOKINGS ALERT */}
      {(pendingTransportBookings.urgent.length > 0 || pendingTransportBookings.warning.length > 0 || pendingTransportBookings.normal.length > 0) && (
        <div className="glass rounded-lg border-2 border-orange-500/50 p-4 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-400 animate-bounce" />
              <div>
                <h3 className="text-lg font-semibold text-orange-400">
                  Transportation Booking Required
                </h3>
                <p className="text-sm text-muted-foreground">
                  {pendingTransportBookings.urgent.length + pendingTransportBookings.warning.length + pendingTransportBookings.normal.length} orders waiting for transportation booking
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              {pendingTransportBookings.urgent.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 animate-pulse">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                  <span className="text-red-400 font-medium">
                    {pendingTransportBookings.urgent.length} Urgent (&gt;3 days)
                  </span>
                </div>
              )}
              {pendingTransportBookings.warning.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/50 animate-pulse">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></div>
                  <span className="text-yellow-400 font-medium">
                    {pendingTransportBookings.warning.length} Warning (2 days)
                  </span>
                </div>
              )}
              {pendingTransportBookings.normal.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/50 animate-pulse">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                  <span className="text-green-400 font-medium">
                    {pendingTransportBookings.normal.length} Normal (&lt;2 days)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Detailed scrollable table */}
          <div className="border border-orange-500/30 rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-orange-500/10 sticky top-0">
                  <tr className="border-b border-orange-500/30">
                    <th className="p-3 text-left text-xs font-medium text-orange-400">Order #</th>
                    <th className="p-3 text-left text-xs font-medium text-orange-400">Product</th>
                    <th className="p-3 text-left text-xs font-medium text-orange-400">Type</th>
                    <th className="p-3 text-left text-xs font-medium text-orange-400">Days Pending</th>
                    <th className="p-3 text-left text-xs font-medium text-orange-400">Status</th>
                    <th className="p-3 text-left text-xs font-medium text-orange-400">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Urgent orders */}
                  {pendingTransportBookings.urgent.map((order, index) => {
                    const getProductDisplay = (order) => {
                      if (order.po_items && order.po_items.length > 0) {
                        const products = order.po_items.slice(0, 2).map(item =>
                          item.product_name || item.item_name || 'Unknown'
                        ).join(', ');
                        return order.po_items.length > 2 ? `${products} (+${order.po_items.length - 2} more)` : products;
                      }
                      return order.product_name || order.products_summary || '-';
                    };

                    const getOrderType = (order) => {
                      if (order.po_number) return 'PO';
                      if (order.job_number) return 'Job Order';
                      if (order.import_number) return 'Import';
                      return 'Transport';
                    };

                    return (
                      <tr key={`urgent-${index}`} className="border-b border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors animate-pulse">
                        <td className="p-3 font-mono text-sm text-red-300">
                          {order.po_number || order.job_number || order.import_number || '-'}
                        </td>
                        <td className="p-3 text-sm max-w-[200px] truncate" title={getProductDisplay(order)}>
                          {getProductDisplay(order)}
                        </td>
                        <td className="p-3">
                          <Badge className="bg-red-500/20 text-red-400 text-xs">
                            {getOrderType(order)}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-red-300 font-medium">
                          {order.daysPending} days
                        </td>
                        <td className="p-3">
                          <Badge className="bg-red-500/20 text-red-400 text-xs animate-pulse">
                            🚨 NOT BOOKED
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className="bg-red-500/20 text-red-400 text-xs border border-red-500/50 animate-pulse">
                            URGENT
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Warning orders */}
                  {pendingTransportBookings.warning.map((order, index) => {
                    const getProductDisplay = (order) => {
                      if (order.po_items && order.po_items.length > 0) {
                        const products = order.po_items.slice(0, 2).map(item =>
                          item.product_name || item.item_name || 'Unknown'
                        ).join(', ');
                        return order.po_items.length > 2 ? `${products} (+${order.po_items.length - 2} more)` : products;
                      }
                      return order.product_name || order.products_summary || '-';
                    };

                    const getOrderType = (order) => {
                      if (order.po_number) return 'PO';
                      if (order.job_number) return 'Job Order';
                      if (order.import_number) return 'Import';
                      return 'Transport';
                    };

                    return (
                      <tr key={`warning-${index}`} className="border-b border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors animate-pulse">
                        <td className="p-3 font-mono text-sm text-yellow-300">
                          {order.po_number || order.job_number || order.import_number || '-'}
                        </td>
                        <td className="p-3 text-sm max-w-[200px] truncate" title={getProductDisplay(order)}>
                          {getProductDisplay(order)}
                        </td>
                        <td className="p-3">
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
                            {getOrderType(order)}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-yellow-300 font-medium">
                          {order.daysPending} days
                        </td>
                        <td className="p-3">
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs animate-pulse">
                            ⚠️ NOT BOOKED
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs border border-yellow-500/50 animate-pulse">
                            WARNING
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Normal orders */}
                  {pendingTransportBookings.normal.map((order, index) => {
                    const getProductDisplay = (order) => {
                      if (order.po_items && order.po_items.length > 0) {
                        const products = order.po_items.slice(0, 2).map(item =>
                          item.product_name || item.item_name || 'Unknown'
                        ).join(', ');
                        return order.po_items.length > 2 ? `${products} (+${order.po_items.length - 2} more)` : products;
                      }
                      return order.product_name || order.products_summary || '-';
                    };

                    const getOrderType = (order) => {
                      if (order.po_number) return 'PO';
                      if (order.job_number) return 'Job Order';
                      if (order.import_number) return 'Import';
                      return 'Transport';
                    };

                    return (
                      <tr key={`normal-${index}`} className="border-b border-green-500/20 bg-green-500/5 hover:bg-green-500/10 transition-colors animate-pulse">
                        <td className="p-3 font-mono text-sm text-green-300">
                          {order.po_number || order.job_number || order.import_number || '-'}
                        </td>
                        <td className="p-3 text-sm max-w-[200px] truncate" title={getProductDisplay(order)}>
                          {getProductDisplay(order)}
                        </td>
                        <td className="p-3">
                          <Badge className="bg-green-500/20 text-green-400 text-xs">
                            {getOrderType(order)}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-green-300 font-medium">
                          {order.daysPending} days
                        </td>
                        <td className="p-3">
                          <Badge className="bg-green-500/20 text-green-400 text-xs animate-pulse">
                            ✅ NOT BOOKED
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className="bg-green-500/20 text-green-400 text-xs border border-green-500/50 animate-pulse">
                            NORMAL
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary footer */}
          <div className="mt-3 text-center text-sm text-muted-foreground">
            Scroll to view all pending transportation bookings • Total: {pendingTransportBookings.urgent.length + pendingTransportBookings.warning.length + pendingTransportBookings.normal.length} orders
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* TODAY'S DELIVERIES - Blinking Section - Moved to Top */}
          {todaysDeliveries.length > 0 && (
            <div className="glass rounded-lg border border-green-500/50 overflow-hidden">
              <TodaysDeliveriesWidget 
                deliveries={todaysDeliveries}
                onStatusUpdate={handleStatusUpdate}
                onViewDetails={handleViewDetails}
              />
            </div>
          )}

          {/* SCHEDULED BOOKINGS SECTION - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Inward Scheduled Bookings */}
            <div className="glass rounded-lg border border-border">
              <InwardScheduledBookingsTable 
                inwardDDP={inwardDDP}
                inwardEXW={inwardEXW}
                inwardImport={inwardImport}
                scheduled={inwardScheduled}
                onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'inward')}
                onViewDetails={handleViewDetails}
                onRefresh={loadData}
              />
            </div>

            {/* Right: Outward Scheduled Bookings */}
            <div className="glass rounded-lg border border-border">
              <OutwardScheduledBookingsTable 
                local={localDispatch}
                container={exportContainer}
                scheduled={outwardScheduled}
                onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
                onViewDetails={handleViewDetails}
                onRefresh={loadData}
                onBookTransport={(item) => {
                  setBookingType(item.transport_type === 'CONTAINER' ? 'EXPORT_CONTAINER' : 'LOCAL_DISPATCH');
                  setBookingItem(item);
                  setShowBookingModal(true);
                }}
              />
            </div>
          </div>

          {/* ALL TRANSPORTS SECTION - Keep existing tab components but show all */}
          <div className="space-y-6">
            {/* Inward DDP and EXW Tables - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InwardDDPTab 
                transports={inwardDDP} 
                onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'inward')}
                onRefresh={loadData}
                onViewDetails={handleViewDetails}
                onBookTransport={(item) => {
                  setBookingType('INWARD_DDP');
                  setBookingItem(item);
                  setShowBookingModal(true);
                }}
              />
              <InwardEXWTab 
                transports={inwardEXW} 
                onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'inward')}
                onRefresh={loadData}
                onViewDetails={handleViewDetails}
                onBookTransport={(item) => {
                  setBookingType('INWARD_EXW');
                  setBookingItem(item);
                  setShowBookingModal(true);
                }}
              />
            </div>
            <InwardImportTab 
              imports={inwardImport}
              onRefresh={loadData}
              onViewDetails={handleViewDetails}
              onBookTransport={(item) => {
                setBookingType('INWARD_IMPORT');
                setBookingItem(item);
                setShowBookingModal(true);
              }}
            />
            {/* Jobs Ready for Dispatch Table */}
            <JobsReadyForDispatchTab
              jobs={dispatchJobs}
              onRefresh={loadData}
              onBookTransport={(item) => {
                // Determine booking type based on job properties
                const bookingType = (item.container_count > 0 || item.container_type) ? 'EXPORT_CONTAINER' : 'LOCAL_DISPATCH';
                setBookingType(bookingType);
                setBookingItem(item);
                setShowBookingModal(true);
              }}
            />
            
            {/* Container Tabs - Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <LocalDispatchTab 
                transports={localDispatch}
                onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
                onRefresh={loadData}
                onViewDetails={handleViewDetails}
                onBookTransport={(item) => {
                  setBookingType('LOCAL_DISPATCH');
                  setBookingItem(item);
                  setShowBookingModal(true);
                }}
              />
              <ExportContainerTab 
                transports={exportContainer}
                onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
                onRefresh={loadData}
                onViewDetails={handleViewDetails}
                onBookTransport={(item) => {
                  setBookingType('EXPORT_CONTAINER');
                  setBookingItem(item);
                  setShowBookingModal(true);
                }}
              />
            </div>
            <CompletedBookingsTab 
              inwardDDP={inwardDDP}
              inwardEXW={inwardEXW}
              inwardImport={inwardImport}
              localDispatch={localDispatch}
              exportContainer={exportContainer}
              onViewDetails={handleViewDetails}
              onRefresh={loadData}
            />
          </div>
        </div>
      )}

      {/* OLD TABS SECTION - REMOVED */}
      {/* Tabs */}
      <div className="hidden flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'inward_ddp' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_ddp')}
          className={ddpPending > 0 ? 'border-emerald-500/50' : ''}
          data-testid="tab-inward-ddp"
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Inward (DDP)
          {ddpPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-400">
              {ddpPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'inward_exw' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_exw')}
          className={exwPending > 0 ? 'border-blue-500/50' : ''}
          data-testid="tab-inward-exw"
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Inward (EXW)
          {exwPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
              {exwPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'inward_import' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_import')}
          className={importPending > 0 ? 'border-purple-500/50' : ''}
          data-testid="tab-inward-import"
        >
          <Ship className="w-4 h-4 mr-2" />
          Inward (Import/Logistics)
          {importPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
              {importPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'local_dispatch' ? 'default' : 'outline'}
          onClick={() => setActiveTab('local_dispatch')}
          className={localPending > 0 ? 'border-amber-500/50' : ''}
          data-testid="tab-local-dispatch"
        >
          <Home className="w-4 h-4 mr-2" />
          Local Dispatch
          {localPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">
              {localPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'export_container' ? 'default' : 'outline'}
          onClick={() => setActiveTab('export_container')}
          className={exportPending > 0 ? 'border-green-500/50' : ''}
          data-testid="tab-export-container"
        >
          <Globe className="w-4 h-4 mr-2" />
          Export Container
          {exportPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400">
              {exportPending}
            </span>
          )}
        </Button>
      </div>

      {/* OLD TABS RENDERING - REMOVED (now using dashboard layout above) */}

      {/* Detail View Modal */}
      <TransportDetailModal 
        transport={selectedTransport}
        open={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransport(null);
        }}
        onBookTransport={(item, type) => {
          setBookingItem(item);
          setBookingType(type);
          setShowBookingModal(true);
          setShowDetailModal(false);
        }}
      />

      {/* Unified Booking Modal */}
      {showBookingModal && bookingType && bookingItem && (
        <TransportBookingModal
          bookingType={bookingType}
          item={bookingItem}
          onClose={() => {
            setShowBookingModal(false);
            setBookingType(null);
            setBookingItem(null);
          }}
          onBooked={() => {
            setShowBookingModal(false);
            setBookingType(null);
            setBookingItem(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== INWARD DDP TAB ====================
const InwardDDPTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails, onBookTransport }) => {
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'IN_TRANSIT': return 'bg-blue-500/20 text-blue-400';
      case 'ARRIVED': return 'bg-amber-500/20 text-amber-400';
      case 'COMPLETED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };
  
  const getStatusDisplay = (transport) => {
    // If no transport_number, show NOT_BOOKED status
    if (!transport.transport_number) {
      return 'NOT_BOOKED';
    }
    return transport.status || 'PENDING';
  };

  // Helper function to get the unit for a transport
  const getTransportUnit = (transport) => {
    // First check total_unit (legacy field)
    if (transport.total_unit) {
      return transport.total_unit;
    }
    // Then check total_uom (new field from backend)
    if (transport.total_uom) {
      return transport.total_uom;
    }
    // If neither exists, check po_items for unit
    if (transport.po_items && transport.po_items.length > 0) {
      const firstItem = transport.po_items[0];
      // Check for unit in various possible field names
      return firstItem.unit || firstItem.uom || firstItem.uom_unit || 'KG';
    }
    // Check items field (legacy)
    if (transport.items && transport.items.length > 0) {
      return transport.items[0].unit || 'KG';
    }
    // Default to KG if nothing found
    return 'KG';
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
            Inward Transport (DDP)
          </h2>
          <p className="text-sm text-muted-foreground">
            Supplier-arranged transport to our location (DDP incoterm)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {transports.length === 0 ? (
        <div className="p-8 text-center">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No DDP inward transports</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 text-emerald-400 font-mono">{transport.po_number || '-'}</td>
                  <td className="p-3">{transport.supplier_name || '-'}</td>
                  <td className="p-3 text-sm max-w-[200px]">
                    {transport.po_items?.length > 0 ? (
                      <div className="space-y-1">
                        {transport.po_items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="truncate" title={item.product_name || item.item_name}>
                            {item.product_name || item.item_name || 'Unknown'}
                          </div>
                        ))}
                        {transport.po_items.length > 2 && (
                          <div className="text-xs text-muted-foreground">+{transport.po_items.length - 2} more</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{transport.products_summary || '-'}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {transport.total_quantity ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.total_quantity.toLocaleString()} {getTransportUnit(transport)}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 font-mono">{transport.vehicle_number || '-'}</td>
                  <td className="p-3 text-sm">
                    {transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : 
                     transport.expected_delivery ? new Date(transport.expected_delivery).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(getStatusDisplay(transport))}>
                        {getStatusDisplay(transport) === 'NOT_BOOKED' ? 'Transportation Not Booked' : transport.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {(!transport.transport_number || transport.status === 'NOT_BOOKED' || transport.needs_booking) && (
                        <Button 
                          size="sm" 
                          onClick={() => onBookTransport(transport)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Book Transport
                        </Button>
                      )}
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT')}>
                          Mark In Transit
                        </Button>
                      )}
                      {transport.status === 'IN_TRANSIT' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'ARRIVED')}>
                          Mark Arrived
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== INWARD EXW TAB ====================
const InwardEXWTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails, onBookTransport }) => {
  
  // Filter out COMPLETED status transports
  const filteredTransports = transports.filter(t => t.status !== 'COMPLETED');
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'IN_TRANSIT': return 'bg-blue-500/20 text-blue-400';
      case 'ARRIVED': return 'bg-amber-500/20 text-amber-400';
      // Removed: COMPLETED status
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };
  
  const getStatusDisplay = (transport) => {
    // If no transport_number, show NOT_BOOKED status
    if (!transport.transport_number) {
      return 'NOT_BOOKED';
    }
    return transport.status || 'PENDING';
  };

  // Helper function to get the unit for a transport
  const getTransportUnit = (transport) => {
    // First check total_unit (legacy field)
    if (transport.total_unit) {
      return transport.total_unit;
    }
    // Then check total_uom (new field from backend)
    if (transport.total_uom) {
      return transport.total_uom;
    }
    // If neither exists, check po_items for unit
    if (transport.po_items && transport.po_items.length > 0) {
      const firstItem = transport.po_items[0];
      // Check for unit in various possible field names
      return firstItem.unit || firstItem.uom || firstItem.uom_unit || 'KG';
    }
    // Check items field (legacy)
    if (transport.items && transport.items.length > 0) {
      return transport.items[0].unit || 'KG';
    }
    // Default to KG if nothing found
    return 'KG';
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-blue-400" />
            Inward Transport (EXW)
          </h2>
          <p className="text-sm text-muted-foreground">
            Supplier-arranged transport to our location (EXW incoterm)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {filteredTransports.length === 0 ? (
        <div className="p-8 text-center">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No EXW inward transports</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 text-blue-400 font-mono">{transport.po_number || '-'}</td>
                  <td className="p-3">{transport.supplier_name || '-'}</td>
                  <td className="p-3 text-sm max-w-[200px]">
                    {transport.po_items?.length > 0 ? (
                      <div className="space-y-1">
                        {transport.po_items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="truncate" title={item.product_name || item.item_name}>
                            {item.product_name || item.item_name || 'Unknown'}
                          </div>
                        ))}
                        {transport.po_items.length > 2 && (
                          <div className="text-xs text-muted-foreground">+{transport.po_items.length - 2} more</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{transport.products_summary || '-'}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {transport.total_quantity ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.total_quantity.toLocaleString()} {getTransportUnit(transport)}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 font-mono">{transport.vehicle_number || '-'}</td>
                  <td className="p-3 text-sm">
                    {transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : 
                     transport.expected_delivery ? new Date(transport.expected_delivery).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(getStatusDisplay(transport))}>
                        {getStatusDisplay(transport) === 'NOT_BOOKED' ? 'Transportation Not Booked' : transport.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {(!transport.transport_number || transport.status === 'NOT_BOOKED' || transport.needs_booking) && (
                        <Button 
                          size="sm" 
                          onClick={() => onBookTransport(transport)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Book Transport
                        </Button>
                      )}
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT')}>
                          Mark In Transit
                        </Button>
                      )}
                      {transport.status === 'IN_TRANSIT' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'ARRIVED')}>
                          Mark Arrived
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== INWARD IMPORT TAB ====================
const InwardImportTab = ({ imports, onRefresh, onViewDetails, onBookTransport }) => {
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'DOCUMENTS_PENDING': return 'bg-amber-500/20 text-amber-400';
      case 'CUSTOMS_CLEARANCE': return 'bg-purple-500/20 text-purple-400';
      case 'IN_TRANSIT': return 'bg-blue-500/20 text-blue-400';
      case 'ARRIVED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };
  
  const getStatusDisplay = (importRecord) => {
    // If no transport_number, show NOT_BOOKED status
    if (!importRecord.transport_number && !importRecord.transport_booked) {
      return 'NOT_BOOKED';
    }
    return importRecord.status || 'PENDING';
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Ship className="w-5 h-5 text-purple-400" />
            Inward Transport (Import/Logistics)
          </h2>
          <p className="text-sm text-muted-foreground">
            International imports with FOB/CFR/CIF incoterms
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {imports.length === 0 ? (
        <div className="p-8 text-center">
          <Ship className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No import shipments</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Import #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Documents</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const docs = imp.document_checklist || {};
                const docsComplete = Object.values(docs).filter(Boolean).length;
                const docsTotal = Object.keys(docs).length || 5;
                const hasTransport = imp.transport_number || imp.transport_booked;
                
                return (
                  <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{imp.import_number}</td>
                    <td className="p-3 text-purple-400 font-mono">{imp.po_number || '-'}</td>
                    <td className="p-3">
                      <div>
                        <div className="font-medium">{imp.supplier_name || '-'}</div>
                        {imp.supplier_contact && (
                          <div className="text-xs text-muted-foreground">{imp.supplier_contact}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm max-w-[200px]">
                      {imp.po_items?.length > 0 ? (
                        <div className="space-y-1">
                          {imp.po_items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="truncate" title={item.product_name || item.item_name}>
                              {item.product_name || item.item_name || 'Unknown'}
                            </div>
                          ))}
                          {imp.po_items.length > 2 && (
                            <div className="text-xs text-muted-foreground">+{imp.po_items.length - 2} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {imp.total_quantity ? (
                        <Badge variant="outline" className="font-mono">
                          {imp.total_quantity.toLocaleString()} {imp.total_unit || 'KG'}
                        </Badge>
                      ) : imp.po_items?.length > 0 ? (
                        <div className="text-sm">
                          {imp.po_items.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString()} 
                          {' '}{imp.po_items[0]?.unit || 'KG'}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {imp.delivery_date ? new Date(imp.delivery_date).toLocaleDateString() : 
                       imp.expected_delivery ? new Date(imp.expected_delivery).toLocaleDateString() : 
                       imp.eta ? new Date(imp.eta).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {imp.incoterm || 'FOB'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={docsComplete === docsTotal ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                        {docsComplete}/{docsTotal} docs
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <Badge className={getStatusColor(getStatusDisplay(imp))}>
                          {getStatusDisplay(imp) === 'NOT_BOOKED' ? 'Transportation Not Booked' : imp.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => onViewDetails(imp)}
                          className="h-8"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        {!hasTransport && imp.status !== 'COMPLETED' && (
                          <Button 
                            size="sm" 
                            onClick={() => onBookTransport(imp)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Book Transport
                          </Button>
                        )}
                        {hasTransport && (
                          <Badge className="bg-green-500/20 text-green-400">
                            Transport Booked
                          </Badge>
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
    </div>
  );
};

// ==================== UNIFIED TRANSPORT BOOKING MODAL ====================
const TransportBookingModal = ({ bookingType, item, onClose, onBooked }) => {
  const [form, setForm] = useState({
    transporter: '',
    vehicle_type: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    pickup_date: '',
    delivery_date: '',
    scheduled_date: '',
    notes: '',
    delivery_note_number: '',
    delivery_note_document: null,
    delivery_order_number: '',
    delivery_order_document: null
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.transporter) {
      toast.error('Please enter transporter name');
      return;
    }
    if (!form.vehicle_type) {
      toast.error('Please select vehicle type');
      return;
    }
    
    setSaving(true);
    try {
      // Handle file upload if delivery_note_document exists
      let deliveryNoteDocPath = null;
      if (form.delivery_note_document) {
        if (form.delivery_note_document instanceof File) {
          // Upload file using FormData
          const fileFormData = new FormData();
          fileFormData.append('file', form.delivery_note_document);
          try {
            const uploadResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001'}/api/files/upload`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('erp_token')}`
              },
              body: fileFormData
            });
            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              deliveryNoteDocPath = uploadData.path || uploadData.file_id || uploadData.id || form.delivery_note_document.name;
            } else {
              // If upload fails, just use the file name
              deliveryNoteDocPath = form.delivery_note_document.name;
            }
          } catch (error) {
            console.error('File upload error:', error);
            // Fallback to file name if upload fails
            deliveryNoteDocPath = form.delivery_note_document.name;
          }
        } else {
          // Already a string path
          deliveryNoteDocPath = form.delivery_note_document;
        }
      }

      // Handle file upload if delivery_order_document exists (for outward transports)
      let deliveryOrderDocPath = null;
      if (form.delivery_order_document) {
        if (form.delivery_order_document instanceof File) {
          // Upload file using FormData
          const fileFormData = new FormData();
          fileFormData.append('file', form.delivery_order_document);
          try {
            const uploadResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001'}/api/files/upload`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('erp_token')}`
              },
              body: fileFormData
            });
            if (uploadResponse.ok) {
              const uploadData = await uploadResponse.json();
              deliveryOrderDocPath = uploadData.path || uploadData.file_id || uploadData.id || form.delivery_order_document.name;
            } else {
              // If upload fails, just use the file name
              deliveryOrderDocPath = form.delivery_order_document.name;
            }
          } catch (error) {
            console.error('File upload error:', error);
            // Fallback to file name if upload fails
            deliveryOrderDocPath = form.delivery_order_document.name;
          }
        } else {
          // Already a string path
          deliveryOrderDocPath = form.delivery_order_document;
        }
      }

      if (bookingType === 'INWARD_DDP' || bookingType === 'INWARD_EXW') {
        // Book inward transport from PO
        await api.post('/transport/inward/book', {
          po_id: item.po_id,
          transporter: form.transporter,
          vehicle_type: form.vehicle_type,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name,
          driver_contact: form.driver_phone,
          scheduled_date: form.scheduled_date || form.pickup_date,
          delivery_date: form.delivery_date,
          notes: form.notes,
          incoterm: bookingType === 'INWARD_DDP' ? 'DDP' : 'EXW',
          delivery_note_number: form.delivery_note_number,
          delivery_note_document: deliveryNoteDocPath
        });
      } else if (bookingType === 'INWARD_IMPORT') {
        // Book import transport
        await api.post('/transport/inward/book-import', {
          import_id: item.id,
          po_id: item.po_id,
          transporter: form.transporter,
          vehicle_type: form.vehicle_type,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name,
          driver_phone: form.driver_phone,
          pickup_date: form.pickup_date,
          delivery_date: form.delivery_date,
          delivery_note_number: form.delivery_note_number,
          delivery_note_document: deliveryNoteDocPath
        });
      } else if (bookingType === 'LOCAL_DISPATCH' || bookingType === 'EXPORT_CONTAINER') {
        // Book outward transport
        await api.post('/transport/outward/book', {
          job_order_id: item.job_order_id || item.id?.replace('unbooked-job-', ''),
          transporter_name: form.transporter,
          vehicle_type: form.vehicle_type,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name,
          driver_contact: form.driver_phone,
          scheduled_date: form.scheduled_date || form.pickup_date,
          notes: form.notes,
          transport_type: bookingType === 'EXPORT_CONTAINER' ? 'CONTAINER' : 'LOCAL',
          delivery_order_number: form.delivery_order_number,
          delivery_order_document: deliveryOrderDocPath
        });
      }
      
      toast.success('Transport booked successfully');
      onBooked();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to book transport');
    } finally {
      setSaving(false);
    }
  };

  const getTitle = () => {
    switch (bookingType) {
      case 'INWARD_DDP': return `Book Transport - DDP ${item.po_number || ''}`;
      case 'INWARD_EXW': return `Book Transport - EXW ${item.po_number || ''}`;
      case 'INWARD_IMPORT': return `Book Transport - Import ${item.import_number || ''}`;
      case 'LOCAL_DISPATCH': return `Book Transport - Local Dispatch ${item.job_number || ''}`;
      case 'EXPORT_CONTAINER': return `Book Transport - Export Container ${item.job_number || ''}`;
      default: return 'Book Transport';
    }
  };

  const getReferenceInfo = () => {
    switch (bookingType) {
      case 'INWARD_DDP':
      case 'INWARD_EXW':
        return {
          label: 'PO Number',
          value: item.po_number,
          supplier: item.supplier_name
        };
      case 'INWARD_IMPORT':
        return {
          label: 'Import Number',
          value: item.import_number,
          supplier: item.supplier_name,
          incoterm: item.incoterm
        };
      case 'LOCAL_DISPATCH':
      case 'EXPORT_CONTAINER':
        return {
          label: 'Job Number',
          value: item.job_number,
          customer: item.customer_name
        };
      default:
        return {};
    }
  };

  const refInfo = getReferenceInfo();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-400" />
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reference Details */}
          {refInfo.label && (
            <div className="p-3 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-sm font-semibold mb-2">Reference Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{refInfo.label}:</span>
                  <span className="ml-2 font-mono">{refInfo.value || '-'}</span>
                </div>
                {refInfo.supplier && (
                  <div>
                    <span className="text-muted-foreground">Supplier:</span>
                    <span className="ml-2">{refInfo.supplier}</span>
                  </div>
                )}
                {refInfo.customer && (
                  <div>
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="ml-2">{refInfo.customer}</span>
                  </div>
                )}
                {refInfo.incoterm && (
                  <div>
                    <span className="text-muted-foreground">Incoterm:</span>
                    <span className="ml-2">{refInfo.incoterm}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transport Details Form */}
          <div>
            <Label>Transporter Name *</Label>
            <Input
              value={form.transporter}
              onChange={(e) => setForm({...form, transporter: e.target.value})}
              placeholder="Enter transporter company name"
            />
          </div>

          <div>
            <Label>Vehicle Type *</Label>
            <Select value={form.vehicle_type} onValueChange={(v) => setForm({...form, vehicle_type: v})}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tanker">Tanker</SelectItem>
                <SelectItem value="container">Container</SelectItem>
                <SelectItem value="trailer">Trailer</SelectItem>
                <SelectItem value="truck">Truck</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Vehicle Number</Label>
            <Input
              value={form.vehicle_number}
              onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
              placeholder="License plate number"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Driver Name</Label>
              <Input
                value={form.driver_name}
                onChange={(e) => setForm({...form, driver_name: e.target.value})}
                placeholder="Driver full name"
              />
            </div>
            <div>
              <Label>Driver Phone</Label>
              <Input
                value={form.driver_phone}
                onChange={(e) => setForm({...form, driver_phone: e.target.value})}
                placeholder="+971 XX XXX XXXX"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{bookingType === 'INWARD_IMPORT' ? 'Pickup Date' : 'Scheduled Date'}</Label>
              <Input
                type="datetime-local"
                value={bookingType === 'INWARD_IMPORT' ? form.pickup_date : form.scheduled_date}
                onChange={(e) => {
                  if (bookingType === 'INWARD_IMPORT') {
                    setForm({...form, pickup_date: e.target.value});
                  } else {
                    setForm({...form, scheduled_date: e.target.value});
                  }
                }}
              />
            </div>
            <div>
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={form.delivery_date}
                onChange={(e) => setForm({...form, delivery_date: e.target.value})}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Additional notes or instructions..."
              rows={3}
            />
          </div>

          {/* Delivery Note Section - Only for Inward Transports */}
          {(bookingType === 'INWARD_DDP' || bookingType === 'INWARD_EXW' || bookingType === 'INWARD_IMPORT') && (
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-blue-400">Delivery Note Information</h3>
              <div>
                <Label>Delivery Note Number</Label>
                <Input
                  value={form.delivery_note_number}
                  onChange={(e) => setForm({...form, delivery_note_number: e.target.value})}
                  placeholder="Enter delivery note number"
                />
              </div>
              <div>
                <Label>Delivery Note Document</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setForm({...form, delivery_note_document: e.target.files[0]})}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Upload delivery note document (PDF, images, or documents)
                </p>
              </div>
            </div>
          )}

          {/* Delivery Order Section - Only for Outward Transports */}
          {(bookingType === 'LOCAL_DISPATCH' || bookingType === 'EXPORT_CONTAINER') && (
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-amber-400">Delivery Order Information</h3>
              <div>
                <Label>Delivery Order Number</Label>
                <Input
                  value={form.delivery_order_number || ''}
                  onChange={(e) => setForm({...form, delivery_order_number: e.target.value})}
                  placeholder="Enter delivery order number"
                />
              </div>
              <div>
                <Label>Delivery Order Document</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setForm({...form, delivery_order_document: e.target.files[0]})}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Upload delivery order document (PDF, images, or documents)
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Booking...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Book Transport
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== IMPORT TRANSPORT BOOKING MODAL (Legacy - kept for backward compatibility) ====================
const ImportTransportBookingModal = ({ importRecord, onClose, onBooked }) => {
  const [form, setForm] = useState({
    transporter: '',
    vehicle_type: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    pickup_date: '',
    delivery_date: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.transporter) {
      toast.error('Please enter transporter name');
      return;
    }
    if (!form.vehicle_type) {
      toast.error('Please select vehicle type');
      return;
    }
    
    setSaving(true);
    try {
      await api.post('/transport/inward/book-import', {
        import_id: importRecord.id,
        po_id: importRecord.po_id,
        transporter: form.transporter,
        vehicle_type: form.vehicle_type,
        vehicle_number: form.vehicle_number,
        driver_name: form.driver_name,
        driver_phone: form.driver_phone,
        pickup_date: form.pickup_date,
        delivery_date: form.delivery_date
      });
      
      toast.success('Transport booked successfully');
      onBooked();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to book transport');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-purple-400" />
            Book Transport - Import {importRecord.import_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Import Details */}
          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <h3 className="text-sm font-semibold mb-2">Import Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Import #:</span>
                <span className="ml-2 font-mono">{importRecord.import_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">PO #:</span>
                <span className="ml-2 font-mono text-purple-400">{importRecord.po_number || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Supplier:</span>
                <span className="ml-2">{importRecord.supplier_name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Incoterm:</span>
                <span className="ml-2">{importRecord.incoterm || 'FOB'}</span>
              </div>
            </div>
          </div>

          {/* Transport Details Form */}
          <div>
            <Label>Transporter Name *</Label>
            <Input
              value={form.transporter}
              onChange={(e) => setForm({...form, transporter: e.target.value})}
              placeholder="Enter transporter company name"
            />
          </div>

          <div>
            <Label>Vehicle Type *</Label>
            <Select value={form.vehicle_type} onValueChange={(v) => setForm({...form, vehicle_type: v})}>
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tanker">Tanker</SelectItem>
                <SelectItem value="container">Container</SelectItem>
                <SelectItem value="trailer">Trailer</SelectItem>
                <SelectItem value="truck">Truck</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Vehicle Number</Label>
            <Input
              value={form.vehicle_number}
              onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
              placeholder="License plate number"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Driver Name</Label>
              <Input
                value={form.driver_name}
                onChange={(e) => setForm({...form, driver_name: e.target.value})}
                placeholder="Driver full name"
              />
            </div>
            <div>
              <Label>Driver Phone</Label>
              <Input
                value={form.driver_phone}
                onChange={(e) => setForm({...form, driver_phone: e.target.value})}
                placeholder="+971 XX XXX XXXX"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pickup Date</Label>
              <Input
                type="datetime-local"
                value={form.pickup_date}
                onChange={(e) => setForm({...form, pickup_date: e.target.value})}
              />
            </div>
            <div>
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={form.delivery_date}
                onChange={(e) => setForm({...form, delivery_date: e.target.value})}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Additional notes or instructions..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Booking...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Book Transport
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== JOBS READY FOR DISPATCH TAB ====================
const JobsReadyForDispatchTab = ({ jobs, onRefresh, onBookTransport }) => {
  // Filter jobs that need booking (balance quantity > 0)
  const needsBooking = jobs.filter(j => j.needs_booking && j.balance_quantity > 0);
  
  const handleBookClick = (item) => {
    onBookTransport(item);
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowUpFromLine className="w-5 h-5 text-amber-400" />
            Jobs Ready for Dispatch - Needs Transport
          </h2>
          <p className="text-sm text-muted-foreground">
            Jobs ready for dispatch requiring transport booking. Items remain here until balance quantity is zero.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {needsBooking.length === 0 ? (
        <div className="p-8 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-green-400 font-medium">All dispatches planned</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Total MT</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Booked MT</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Balance MT</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Expected Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {needsBooking.map((item) => {
                const balanceQty = item.balance_quantity || 0;
                const quantityBooked = item.quantity_booked || 0;
                const isFullyBooked = balanceQty === 0 && quantityBooked > 0;
                
                // Get expected delivery date from job order or quotation
                const expectedDeliveryDate = item.delivery_date || item.expected_delivery_date || item.quotation?.expected_delivery_date;
                
                return (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{item.job_number}</td>
                    <td className="p-3">{item.product_name || item.items?.[0]?.product_name || '-'}</td>
                    <td className="p-3 font-mono text-cyan-400 font-semibold">
                      {(item.total_weight_mt || 0).toFixed(2)} MT
                    </td>
                    <td className="p-3">
                      <span className={quantityBooked > 0 ? 'text-green-400' : 'text-muted-foreground'}>
                        {quantityBooked.toFixed(2)} MT
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={balanceQty > 0 ? 'text-amber-400 font-semibold' : 'text-green-400'}>
                        {balanceQty.toFixed(2)} MT
                      </span>
                    </td>
                    <td className="p-3">
                      {expectedDeliveryDate ? (
                        <span className="text-cyan-400">
                          {new Date(expectedDeliveryDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">{item.customer_name || '-'}</td>
                    <td className="p-3">
                      {isFullyBooked ? (
                        <Badge className="bg-green-500/20 text-green-400">
                          Ready to Dispatch
                        </Badge>
                      ) : (
                        <Badge className={item.status === 'READY' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                          {item.status}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {balanceQty > 0 && (
                        <Button size="sm" onClick={() => handleBookClick(item)}>
                          <Plus className="w-4 h-4 mr-1" />
                          Book
                        </Button>
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
  );
};

// ==================== LOCAL DISPATCH TAB ====================
const LocalDispatchTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails, onBookTransport }) => {
  
  // #region agent log
  useEffect(() => {
    transports.forEach(transport => {
      if (transport.total_quantity) {
        fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'TransportWindowPage.js:useEffect',
            message: 'Local dispatch quantity display',
            data: {
              total_quantity: transport.total_quantity,
              unit: transport.unit,
              job_number: transport.job_number,
              transport_number: transport.transport_number
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'initial',
            hypothesisId: 'A,B,C'
          })
        }).catch(() => {});
      }
    });
  }, [transports]);
  // #endregion
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'DISPATCHED': return 'bg-blue-500/20 text-blue-400';
      case 'DELIVERED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };
  
  const getStatusDisplay = (transport) => {
    // If no transport_number, show NOT_BOOKED status
    if (!transport.transport_number) {
      return 'NOT_BOOKED';
    }
    return transport.status || 'PENDING';
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Home className="w-5 h-5 text-amber-400" />
            Local Dispatch
          </h2>
          <p className="text-sm text-muted-foreground">
            Local deliveries via tanker/trailer
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {transports.length === 0 ? (
        <div className="p-8 text-center">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No local dispatches</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Orders</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">MT</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => {
                const qtyMT = parseFloat(transport.quantity) || parseFloat(transport.total_weight_mt) || 0;
                return (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 text-amber-400 font-mono">
                    {transport.job_number || transport.job_numbers?.join(', ') || '-'}
                  </td>
                  <td className="p-3">{transport.customer_name || '-'}</td>
                  <td className="p-3 text-sm max-w-[200px] truncate" title={transport.products_summary}>
                    {transport.products_summary || '-'}
                  </td>
                  <td className="p-3">
                    {transport.total_quantity ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.total_quantity} {transport.packaging || transport.unit || 'units'}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 font-mono text-cyan-400 font-semibold">
                    {qtyMT > 0 ? qtyMT.toFixed(2) : '-'}
                  </td>
                  <td className="p-3 font-mono">{transport.vehicle_number || '-'}</td>
                  <td className="p-3 text-sm">
                    {transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(getStatusDisplay(transport))}>
                        {getStatusDisplay(transport) === 'NOT_BOOKED' ? 'Transportation Not Booked' : transport.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {(!transport.transport_number || transport.status === 'NOT_BOOKED' || transport.needs_booking) && (
                        <Button 
                          size="sm" 
                          onClick={() => onBookTransport(transport)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Book Transport
                        </Button>
                      )}
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'LOADING')}>
                          Start Loading
                        </Button>
                      )}
                      {transport.status === 'LOADING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')}>
                          Dispatch
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
    </div>
  );
};

// ==================== EXPORT CONTAINER TAB ====================
const ExportContainerTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails, onBookTransport }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'DISPATCHED': return 'bg-blue-500/20 text-blue-400';
      case 'AT_PORT': return 'bg-purple-500/20 text-purple-400';
      case 'SHIPPED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };
  
  const getStatusDisplay = (transport) => {
    // If no transport_number, show NOT_BOOKED status
    if (!transport.transport_number) {
      return 'NOT_BOOKED';
    }
    return transport.status || 'PENDING';
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-green-400" />
            Export Container
          </h2>
          <p className="text-sm text-muted-foreground">
            Container shipments for export orders
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {transports.length === 0 ? (
        <div className="p-8 text-center">
          <Container className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No export containers</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Order</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Containers</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Shipping Line</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Cro Vessel</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Cutoff</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Pickup</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">MT</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => {
                const qtyMT = parseFloat(transport.quantity) || parseFloat(transport.total_weight_mt) || 0;
                
                // Remove duplicate job numbers
                const jobNumbers = transport.job_number 
                  ? [transport.job_number]
                  : (transport.job_numbers || []);
                const uniqueJobNumbers = [...new Set(jobNumbers)];
                const jobOrderDisplay = uniqueJobNumbers.length > 0 ? uniqueJobNumbers.join(', ') : '-';
                
                // Remove duplicate product names
                const productNames = transport.product_names || [];
                const uniqueProductNames = [...new Set(productNames)];
                const productDisplay = uniqueProductNames.length > 0 
                  ? (uniqueProductNames.length <= 3 
                      ? uniqueProductNames.join(', ')
                      : `${uniqueProductNames.slice(0, 3).join(', ')} (+${uniqueProductNames.length - 3} more)`)
                  : (transport.products_summary || '-');
                
                // Get cutoff date (prefer cutoff_date, fallback to si_cutoff)
                const cutoffDate = transport.cutoff_date || transport.si_cutoff;
                
                return (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono text-green-400">{jobOrderDisplay}</td>
                  <td className="p-3 text-sm max-w-[200px] truncate" title={uniqueProductNames.join(', ')}>
                    {productDisplay}
                  </td>
                  <td className="p-3">
                    {transport.container_count ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.container_count} {transport.container_type || 'Container'}{transport.container_count > 1 ? 's' : ''}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-sm">{transport.shipping_line || '-'}</td>
                  <td className="p-3 text-sm">{transport.vessel_name || '-'}</td>
                  <td className="p-3 text-sm">
                    {cutoffDate ? (
                      <span className="font-mono">{new Date(cutoffDate).toLocaleDateString()}</span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-sm">
                    {transport.pickup_date ? (
                      <span className="font-mono">{new Date(transport.pickup_date).toLocaleDateString()}</span>
                    ) : '-'}
                  </td>
                  <td className="p-3">{transport.customer_name || '-'}</td>
                  <td className="p-3 font-mono text-cyan-400 font-semibold">
                    {qtyMT > 0 ? qtyMT.toFixed(2) : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(getStatusDisplay(transport))}>
                        {getStatusDisplay(transport) === 'NOT_BOOKED' ? 'Transportation Not Booked' : transport.status}
                      </Badge>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {(!transport.transport_number || transport.status === 'NOT_BOOKED' || transport.needs_booking) && (
                        <Button 
                          size="sm" 
                          onClick={() => onBookTransport(transport)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Book Transport
                        </Button>
                      )}
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'LOADING')}>
                          Start Loading
                        </Button>
                      )}
                      {transport.status === 'LOADING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')}>
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'DISPATCHED' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'AT_PORT')}>
                          At Port
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
    </div>
  );
};

// ==================== TRANSPORT DETAIL MODAL ====================
const TransportDetailModal = ({ transport, open, onClose, onBookTransport }) => {
  if (!transport) return null;

  const isInward = transport.po_number || transport.import_number;
  const isImport = transport.import_number;
  const isOutward = transport.job_number || transport.job_numbers;
  const isContainer = transport.container_number;
  
  // Check if transport is not booked (for imports)
  // Show button if: it's an import AND has no transport_number (regardless of status)
  // OR if status explicitly says NOT_BOOKED or Transportation Not Booked
  const isNotBooked = isImport && (
    !transport.transport_number || 
    transport.status === 'NOT_BOOKED' || 
    transport.status === 'Transportation Not Booked' ||
    !transport.status
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isInward ? <ArrowDownToLine className="w-5 h-5 text-blue-400" /> : <ArrowUpFromLine className="w-5 h-5 text-amber-400" />}
            Transport Details - {transport.transport_number || transport.import_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Transport Number</Label>
                <p className="font-mono font-medium">{transport.transport_number || transport.import_number}</p>
              </div>
              {isInward && !isImport && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">PO Number</Label>
                    <p className="text-blue-400 font-mono">{transport.po_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Supplier</Label>
                    <p>{transport.supplier_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Incoterm</Label>
                    <Badge className="bg-blue-500/20 text-blue-400">{transport.incoterm || 'EXW'}</Badge>
                  </div>
                </>
              )}
              {isImport && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">PO Number</Label>
                    <p className="text-purple-400 font-mono">{transport.po_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Supplier</Label>
                    <p>{transport.supplier_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Incoterm</Label>
                    <Badge className="bg-purple-500/20 text-purple-400">{transport.incoterm || 'FOB'}</Badge>
                  </div>
                </>
              )}
              {isOutward && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">Job Order(s)</Label>
                    <p className="text-amber-400 font-mono">
                      {transport.job_number || transport.job_numbers?.join(', ') || '-'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Customer</Label>
                    <p>{transport.customer_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Transport Type</Label>
                    <Badge className={isContainer ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>
                      {isContainer ? 'CONTAINER' : 'LOCAL'}
                    </Badge>
                  </div>
                </>
              )}
              <div>
                <Label className="text-muted-foreground text-xs">Status</Label>
                <Badge className="bg-blue-500/20 text-blue-400">{transport.status}</Badge>
              </div>
            </div>
          </div>

          {/* Vehicle & Driver Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Vehicle & Driver Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Transport Company</Label>
                <p className="font-medium">{transport.transporter_name || transport.transporter || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Vehicle Number</Label>
                <p className="font-mono font-medium">{transport.vehicle_number || 'Not assigned'}</p>
              </div>
              {!isContainer && transport.vehicle_type && (
                <div>
                  <Label className="text-muted-foreground text-xs">Vehicle Type</Label>
                  <p className="font-medium capitalize">{transport.vehicle_type.replace('_', ' ')}</p>
                </div>
              )}
              {isContainer && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">Container Number</Label>
                    <p className="font-mono font-medium text-green-400">{transport.container_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Container Type</Label>
                    <p className="font-mono">{transport.container_type || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Number of Containers</Label>
                    <p className="font-mono font-medium">{transport.container_count || 1}</p>
                  </div>
                </>
              )}
              <div>
                <Label className="text-muted-foreground text-xs">Driver Name</Label>
                <p className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {transport.driver_name || '-'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Driver Contact</Label>
                <p className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {transport.driver_contact || transport.driver_phone || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Products/Items */}
          {((transport.po_items && transport.po_items.length > 0) || 
            (transport.job_items && transport.job_items.length > 0)) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Products/Items
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Product Name</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Quantity</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Unit</th>
                      {transport.job_items && (
                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">Packaging</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(transport.po_items || transport.job_items || []).map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="p-2">{item.product_name || item.name}</td>
                        <td className="p-2 font-mono text-sm">{item.sku || item.product_sku || '-'}</td>
                        <td className="p-2 text-right font-mono">{item.quantity}</td>
                        <td className="p-2">{item.unit || 'KG'}</td>
                        {transport.job_items && (
                          <td className="p-2">{item.packaging || 'Bulk'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20">
                    <tr>
                      <td colSpan={2} className="p-2 font-semibold">Total</td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {(transport.po_items || transport.job_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)}
                      </td>
                      <td className="p-2 font-semibold">KG</td>
                      {transport.job_items && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Container Shipping Information */}
          {isContainer && (transport.si_cutoff || transport.pull_out_date || transport.gate_in_date) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Container className="w-4 h-4" />
                Container Shipping Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {transport.si_cutoff && (
                  <div>
                    <Label className="text-muted-foreground text-xs">SI/LL Cutoff</Label>
                    <p className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(transport.si_cutoff).toLocaleString()}
                    </p>
                  </div>
                )}
                {transport.pull_out_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Pull Out Date</Label>
                    <p className="flex items-center gap-1 font-mono">
                      <Truck className="w-3 h-3" />
                      {new Date(transport.pull_out_date).toLocaleString()}
                    </p>
                  </div>
                )}
                {transport.gate_in_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Gate In Date</Label>
                    <p className="flex items-center gap-1 font-mono">
                      <MapPin className="w-3 h-3" />
                      {new Date(transport.gate_in_date).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location & Timeline */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location & Timeline
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {transport.destination && (
                <div>
                  <Label className="text-muted-foreground text-xs">Destination</Label>
                  <p>{transport.destination}</p>
                </div>
              )}
              {transport.actual_arrival && (
                <div>
                  <Label className="text-muted-foreground text-xs">Actual Arrival</Label>
                  <p className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-green-400" />
                    {new Date(transport.actual_arrival).toLocaleString()}
                  </p>
                </div>
              )}
              {transport.dispatch_date && (
                <div>
                  <Label className="text-muted-foreground text-xs">Dispatch Date</Label>
                  <p className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(transport.dispatch_date).toLocaleString()}
                  </p>
                </div>
              )}
              {transport.delivery_date && (
                <div>
                  <Label className="text-muted-foreground text-xs">Expected Delivery</Label>
                  <p className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(transport.delivery_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {transport.created_at && (
                <div>
                  <Label className="text-muted-foreground text-xs">Created At</Label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(transport.created_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Import Documents (if applicable) */}
          {isImport && transport.document_checklist && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Document Checklist
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(transport.document_checklist).map(([doc, status]) => (
                  <div key={doc} className="flex items-center gap-2">
                    {status ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-sm">
                      {doc.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Note / Delivery Order Information */}
          {((isInward && transport.delivery_note_number) || (!isInward && transport.delivery_order_number)) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isInward ? 'Delivery Note Information' : 'Delivery Order Information'}
              </h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs">
                    {isInward ? 'Delivery Note Number' : 'Delivery Order Number'}
                  </Label>
                  <p className="font-mono font-medium text-blue-400">
                    {isInward ? transport.delivery_note_number : transport.delivery_order_number}
                  </p>
                </div>
                {((isInward && transport.delivery_note_document) || (!isInward && transport.delivery_order_document)) && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Attached Document</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Handle document download/view
                          const docUrl = isInward ? transport.delivery_note_document : transport.delivery_order_document;
                          window.open(docUrl, '_blank');
                        }}
                      >
                        View Document
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          {isNotBooked && onBookTransport && (
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                onBookTransport(transport, 'INWARD_IMPORT');
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Book Transport
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== INWARD SCHEDULED BOOKINGS TABLE ====================
const InwardScheduledBookingsTable = ({ inwardDDP, inwardEXW, inwardImport, scheduled, onStatusUpdate, onViewDetails, onRefresh }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'SCHEDULED': return 'bg-blue-500/20 text-blue-400';
      case 'IN_TRANSIT': return 'bg-cyan-500/20 text-cyan-400';
      case 'ARRIVED': return 'bg-amber-500/20 text-amber-400';
      case 'COMPLETED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getType = (transport) => {
    if (inwardDDP.some(t => t.id === transport.id || t.po_id === transport.po_id)) return 'DDP';
    if (inwardEXW.some(t => t.id === transport.id || t.po_id === transport.po_id)) return 'EXW';
    if (inwardImport.some(t => t.id === transport.id)) return 'IMPORT';
    return 'OTHER';
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ArrowDownToLine className="w-5 h-5 text-blue-400" />
          Inward 
        </h2>
        <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
          {scheduled.length} Scheduled
        </span>
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-muted/30 sticky top-0">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO / Reference</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">ETA / Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No scheduled inward bookings</p>
                </td>
              </tr>
            ) : (
              scheduled.map(transport => (
                <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="p-3">
                    <Badge className={getType(transport) === 'DDP' ? 'bg-emerald-500/20 text-emerald-400' : getType(transport) === 'EXW' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}>
                      {getType(transport)}
                    </Badge>
                  </td>
                  <td className="p-3">{transport.po_number || transport.import_number || '-'}</td>
                  <td className="p-3">{transport.supplier_name || transport.supplier || '-'}</td>
                  <td className="p-3">{transport.eta ? new Date(transport.eta).toLocaleDateString() : transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : '-'}</td>
                  <td className="p-3">
                    <Badge className={getStatusColor(transport.status)}>
                      {transport.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onViewDetails(transport)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {transport.status === 'SCHEDULED' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT')}>
                          Dispatch
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== OUTWARD SCHEDULED BOOKINGS TABLE ====================
const OutwardScheduledBookingsTable = ({ local, container, scheduled, onStatusUpdate, onViewDetails, onRefresh, onBookTransport }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'SCHEDULED': return 'bg-blue-500/20 text-blue-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'DISPATCHED': return 'bg-cyan-500/20 text-cyan-400';
      case 'DELIVERED': return 'bg-green-500/20 text-green-400';
      case 'NOT_BOOKED': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getType = (transport) => {
    if (local.some(t => t.id === transport.id || t.job_order_id === transport.job_order_id)) return 'LOCAL';
    if (container.some(t => t.id === transport.id || t.job_order_id === transport.job_order_id)) return 'CONTAINER';
    return transport.transport_type || 'LOCAL';
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ArrowUpFromLine className="w-5 h-5 text-amber-400" />
          Outward
        </h2>
        <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400">
          {scheduled.length} Scheduled
        </span>
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-muted/30 sticky top-0">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">DO / Job</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Dispatch Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No scheduled outward bookings</p>
                </td>
              </tr>
            ) : (
              scheduled.map(transport => {
                const isUnbooked = transport.needs_booking && transport.status === 'NOT_BOOKED';
                // Handle both single job_number and array of job_numbers
                const jobNumber = transport.job_number || 
                                 (Array.isArray(transport.job_numbers) && transport.job_numbers.length > 0 
                                   ? transport.job_numbers.join(', ') 
                                   : transport.job_numbers?.[0]) || 
                                 transport.do_number || '-';
                const dispatchDate = transport.delivery_date || transport.dispatch_date || transport.expected_delivery_date;
                
                return (
                  <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                    <td className="p-3">
                      {getType(transport) === 'CONTAINER' ? (
                        <Badge className="bg-purple-500/20 text-purple-400 flex items-center gap-1 w-fit">
                          <Container className="w-3 h-3" />
                          CONTAINER
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-400 flex items-center gap-1 w-fit">
                          <Truck className="w-3 h-3" />
                          LOCAL
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {jobNumber !== '-' ? (
                        <span className="font-mono text-amber-400">{jobNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">{transport.customer_name || '-'}</td>
                    <td className="p-3">
                      {dispatchDate 
                        ? new Date(dispatchDate).toLocaleDateString() 
                        : '-'}
                    </td>
                    <td className="p-3">
                      <Badge className={getStatusColor(transport.status)}>
                        {isUnbooked ? 'NEEDS_BOOKING' : transport.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {transport.transport_number && (
                          <Button size="sm" variant="ghost" onClick={() => onViewDetails(transport)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {isUnbooked && onBookTransport && (
                          <Button 
                            size="sm" 
                            onClick={() => onBookTransport(transport)} 
                            className="bg-blue-500 hover:bg-blue-600"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Book Transport
                          </Button>
                        )}
                        {transport.status === 'LOADING' && (
                          <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')} className="bg-blue-500 hover:bg-blue-600">
                            Dispatch
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== COMPLETED BOOKINGS TAB ====================
const CompletedBookingsTab = ({ inwardDDP, inwardEXW, inwardImport, localDispatch, exportContainer, onViewDetails, onRefresh }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-500/20 text-green-400';
      case 'DELIVERED': return 'bg-green-500/20 text-green-400';
      case 'ARRIVED': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const allTransports = [
    ...inwardDDP.filter(t => ['COMPLETED', 'ARRIVED'].includes(t.status)),
    ...inwardEXW.filter(t => ['COMPLETED', 'ARRIVED'].includes(t.status)),
    ...inwardImport.filter(t => ['COMPLETED', 'ARRIVED'].includes(t.status)),
    ...localDispatch.filter(t => ['COMPLETED', 'DELIVERED'].includes(t.status)),
    ...exportContainer.filter(t => ['COMPLETED', 'DELIVERED', 'SHIPPED'].includes(t.status))
  ];

  const getType = (transport) => {
    if (transport.po_number && transport.incoterm === 'DDP') return 'DDP';
    if (transport.po_number && transport.incoterm === 'EXW') return 'EXW';
    if (transport.import_number) return 'IMPORT';
    if (transport.container_number) return 'CONTAINER';
    if (transport.job_number) return 'LOCAL';
    return 'OTHER';
  };

  const getReference = (transport) => {
    if (transport.po_number) return transport.po_number;
    if (transport.import_number) return transport.import_number;
    if (transport.job_number) return transport.job_number;
    return '-';
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Check className="w-5 h-5 text-green-400" />
            Completed Bookings
          </h2>
          <p className="text-sm text-muted-foreground">
            All completed and delivered transport bookings
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {allTransports.length === 0 ? (
        <div className="p-8 text-center">
          <Check className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No completed bookings</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier/Customer</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Completed Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allTransports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3">
                    <Badge className={
                      getType(transport) === 'DDP' ? 'bg-emerald-500/20 text-emerald-400' :
                      getType(transport) === 'EXW' ? 'bg-blue-500/20 text-blue-400' :
                      getType(transport) === 'IMPORT' ? 'bg-purple-500/20 text-purple-400' :
                      getType(transport) === 'CONTAINER' ? 'bg-green-500/20 text-green-400' :
                      'bg-amber-500/20 text-amber-400'
                    }>
                      {getType(transport)}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono">{getReference(transport)}</td>
                  <td className="p-3">{transport.supplier_name || transport.customer_name || '-'}</td>
                  <td className="p-3 text-sm max-w-[200px] truncate" title={transport.products_summary || transport.product_name}>
                    {transport.products_summary || transport.product_name || '-'}
                  </td>
                  <td className="p-3">
                    {transport.total_quantity ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.total_quantity} {transport.total_unit || transport.unit || 'units'}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-sm">
                    {transport.completed_date ? new Date(transport.completed_date).toLocaleDateString() :
                     transport.actual_arrival ? new Date(transport.actual_arrival).toLocaleDateString() :
                     transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <Badge className={getStatusColor(transport.status)}>
                      {transport.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => onViewDetails(transport)}
                      className="h-8"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== TODAY'S DELIVERIES WIDGET (BLINKING) ====================
const TodaysDeliveriesWidget = ({ deliveries, onStatusUpdate, onViewDetails }) => {
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'NOT_BOOKED': return 'bg-red-500/20 text-red-400';
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'SCHEDULED': return 'bg-blue-500/20 text-blue-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'IN_TRANSIT': return 'bg-cyan-500/20 text-cyan-400';
      case 'DISPATCHED': return 'bg-blue-500/20 text-blue-400';
      case 'ARRIVED': return 'bg-amber-500/20 text-amber-400';
      case 'DELIVERED': return 'bg-green-500/20 text-green-400';
      case 'COMPLETED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const isInward = (transport) => {
    return !!(transport.po_number || transport.import_number);
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-green-400">
          <Clock className="w-5 h-5" />
          Today's Deliveries
          <span className="ml-2 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 animate-pulse">
            {deliveries.length} Deliveries
          </span>
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer / Supplier</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Time</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No deliveries scheduled for today</p>
                </td>
              </tr>
            ) : (
              deliveries.map(transport => (
                <tr 
                  key={transport.id} 
                  className="border-t border-border/50 today-delivery-row hover:bg-muted/10"
                >
                  <td className="p-3">
                    {isInward(transport) ? (
                      <ArrowDownToLine className="w-4 h-4 text-blue-400" title="Inward" />
                    ) : (
                      <ArrowUpFromLine className="w-4 h-4 text-amber-400" title="Outward" />
                    )}
                  </td>
                  <td className="p-3">
                    {isInward(transport) ? (
                      <span className="text-blue-400">{transport.po_number || transport.import_number}</span>
                    ) : (
                      <span className="text-amber-400">{transport.do_number || transport.job_number}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {transport.supplier_name || transport.supplier || transport.customer_name || '-'}
                  </td>
                  <td className="p-3">
                    {(transport.dispatch_date || transport.eta || transport.delivery_date || transport.expected_delivery) ? 
                      new Date(transport.dispatch_date || transport.eta || transport.delivery_date || transport.expected_delivery).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
                      : '-'}
                  </td>
                  <td className="p-3">
                    <Badge className={getStatusColor(transport.status)}>
                      {transport.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onViewDetails(transport)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {transport.status === 'SCHEDULED' && isInward(transport) && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT', 'inward')}>
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'LOADING' && !isInward(transport) && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED', 'outward')} className="bg-blue-500 hover:bg-blue-600">
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'IN_TRANSIT' && isInward(transport) && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'ARRIVED', 'inward')} className="bg-green-500 hover:bg-green-600">
                          Arrived
                        </Button>
                      )}
                      {transport.status === 'DISPATCHED' && !isInward(transport) && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DELIVERED', 'outward')} className="bg-green-500 hover:bg-green-600">
                          Delivered
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransportWindowPage;
