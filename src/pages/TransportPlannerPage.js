import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Map, ArrowDownToLine, ArrowUpFromLine, Ship, Truck, Calendar,
  Plus, RefreshCw, Check, X, Building, Clock, Package
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const TransportPlannerPage = () => {
  const [activeTab, setActiveTab] = useState('inward_exw');
  const [inwardEXW, setInwardEXW] = useState([]);
  const [inwardImport, setInwardImport] = useState([]);
  const [dispatch, setDispatch] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingType, setBookingType] = useState('');
  const [selectedJobOrder, setSelectedJobOrder] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inwardRes, outwardRes, importsRes, suppliersRes, posRes] = await Promise.all([
        api.get('/transport/inward'),
        api.get('/transport/outward'),
        api.get('/imports').catch(() => ({ data: [] })),
        api.get('/suppliers'),
        api.get('/purchase-orders', { params: { status: 'APPROVED' } }).catch(() => ({ data: [] }))
      ]);
      
      // Get approved POs that need transport booking (EXW)
      const approvedPOs = (posRes.data || []).filter(po => 
        po.status === 'APPROVED' && 
        (po.incoterm === 'EXW' || !po.routed_to)
      );
      
      // Combine with existing inward transports
      const existingInward = inwardRes.data || [];
      setInwardEXW([
        ...approvedPOs.map(po => ({
          ...po,
          type: 'PO',
          needs_booking: !existingInward.some(t => t.po_id === po.id),
          status: 'NEEDS_TRANSPORT'
        })),
        ...existingInward.filter(t => t.source === 'PO_EXW' || t.incoterm === 'EXW')
      ]);
      
      setInwardImport(importsRes.data || []);
      
      // Get dispatch jobs
      const outward = outwardRes.data || [];
      
      // Get job IDs that have transports
      const jobIdsWithTransport = [...new Set(outward.map(t => t.job_order_id).filter(Boolean))];
      
      // Fetch jobs that are ready for dispatch
      const jobsRes = await api.get('/job-orders', { 
        params: { status: 'ready_for_dispatch' } 
      }).catch(() => ({ data: [] }));
      
      let readyJobs = jobsRes.data || [];
      
      // Also fetch individual jobs that have transports but aren't in ready_for_dispatch
      // This ensures we show balance for all jobs with partial bookings
      if (jobIdsWithTransport.length > 0) {
        const missingJobIds = jobIdsWithTransport.filter(jobId => 
          !readyJobs.find(j => j.id === jobId)
        );
        
        if (missingJobIds.length > 0) {
          try {
            const transportJobsRes = await Promise.all(
              missingJobIds.slice(0, 50).map(jobId => // Limit to 50 to avoid too many requests
                api.get(`/job-orders/${jobId}`).catch(() => null)
              )
            );
            const transportJobs = transportJobsRes
              .filter(j => j && j.data)
              .map(j => j.data);
            readyJobs = [...readyJobs, ...transportJobs];
          } catch (err) {
            console.warn('Error fetching transport jobs:', err);
          }
        }
      }
      
      // Filter to include ready_for_dispatch, approved, or jobs with transports
      readyJobs = readyJobs.filter(j => 
        j.status === 'ready_for_dispatch' || 
        j.status === 'approved' || 
        jobIdsWithTransport.includes(j.id)
      );
      
      // Group transport bookings by job_order_id to calculate quantities
      const transportByJobId = {};
      outward.forEach(t => {
        const jobId = t.job_order_id;
        if (jobId) {
          if (!transportByJobId[jobId]) {
            transportByJobId[jobId] = [];
          }
          transportByJobId[jobId].push(t);
        }
      });
      
      // Helper function to normalize units for comparison
      const normalizeUnit = (unit) => {
        if (!unit) return '';
        const u = unit.toUpperCase().trim();
        // Normalize common unit variations
        if (u.includes('DRUM') || u.includes('STEEL DRUM')) return 'DRUM';
        if (u === 'MT' || u === 'TON' || u === 'TONNE') return 'MT';
        if (u === 'KG' || u === 'KILOGRAM') return 'KG';
        return u;
      };
      
      // Helper function to convert quantity to job order unit
      const convertToJobUnit = (qty, fromUnit, toUnit) => {
        if (!qty || !fromUnit || !toUnit) return qty;
        const from = normalizeUnit(fromUnit);
        const to = normalizeUnit(toUnit);
        
        // If units match, return as is
        if (from === to) return qty;
        
        // Convert MT to KG (1 MT = 1000 KG)
        if (from === 'MT' && to === 'KG') return qty * 1000;
        if (from === 'KG' && to === 'MT') return qty / 1000;
        
        // For DRUM, we can't convert without knowing weight per drum
        // So we'll assume same unit if both are DRUM-related
        if ((from.includes('DRUM') || from === 'DRUM') && 
            (to.includes('DRUM') || to === 'DRUM')) {
          return qty;
        }
        
        // If units don't match and can't convert, return original quantity
        // This might indicate a data issue, but we'll still show it
        return qty;
      };
      
      // Create a map of job IDs to avoid duplicates
      const jobMap = new Map();
      
      // Process ready jobs first
      readyJobs.forEach(job => {
        const jobTransports = transportByJobId[job.id] || [];
        const hasTransport = jobTransports.length > 0;
        
        // Calculate quantity booked from all transport bookings in MT
        // All transport bookings should be in MT for consistency
        let quantityBookedMT = 0;
        
        jobTransports.forEach(t => {
          const transportUnit = normalizeUnit(t.unit || '');
          let transportQtyMT = t.quantity || 0;
          
          // Convert transport quantity to MT if needed
          if (transportUnit === 'KG') {
            transportQtyMT = transportQtyMT / 1000;
          } else if (transportUnit === 'DRUM') {
            // For drums, we can't convert without knowing weight per drum
            // Assume transport quantity is already in MT or use a conversion factor
            // For now, we'll use the transport quantity as-is if it's in drums
            // This should be handled by ensuring transport bookings are always in MT
            transportQtyMT = t.quantity || 0;
          }
          // If already in MT, use as-is
          
          quantityBookedMT += transportQtyMT;
        });
        
        // Use total_weight_mt from job order for balance calculation
        const totalQuantityMT = job.total_weight_mt || 0;
        const balanceQuantityMT = Math.max(0, totalQuantityMT - quantityBookedMT);
        
        jobMap.set(job.id, {
          ...job,
          type: 'JO',
          needs_booking: balanceQuantityMT > 0, // Needs booking if there's balance quantity
          status: job.status === 'ready_for_dispatch' ? 'READY' : (job.status === 'approved' ? 'APPROVED' : job.status?.toUpperCase() || 'PENDING'),
          transport_bookings: jobTransports,
          quantity_booked_mt: quantityBookedMT,
          balance_quantity_mt: balanceQuantityMT
        });
      });
      
      // Also include transport records for jobs that might not be in ready_for_dispatch status
      // but have transport bookings
      outward.forEach(t => {
        if (t.job_order_id && !jobMap.has(t.job_order_id)) {
          // Fetch job order if not already loaded
          const jobTransports = transportByJobId[t.job_order_id] || [];
          const quantityBookedMT = jobTransports.reduce((sum, tr) => {
            const transportUnit = normalizeUnit(tr.unit || '');
            let transportQtyMT = tr.quantity || 0;
            
            // Convert transport quantity to MT if needed
            if (transportUnit === 'KG') {
              transportQtyMT = transportQtyMT / 1000;
            }
            // If already in MT or DRUM, use as-is (should be MT for consistency)
            
            return sum + transportQtyMT;
          }, 0);
          
          // Try to get total_weight_mt from transport record or default to 0
          const totalQuantityMT = t.total_weight_mt || 0;
          const balanceQuantityMT = Math.max(0, totalQuantityMT - quantityBookedMT);
          
          jobMap.set(t.job_order_id, {
            ...t,
            job_number: t.job_number || '',
            type: 'JO',
            quantity_booked_mt: quantityBookedMT,
            balance_quantity_mt: balanceQuantityMT,
            transport_bookings: jobTransports
          });
        }
      });
      
      setDispatch(Array.from(jobMap.values()));
      
      setSuppliers(suppliersRes.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openBookingModal = (type, jobOrder = null) => {
    setBookingType(type);
    setSelectedJobOrder(jobOrder);
    setShowBookingModal(true);
  };

  // Stats
  const exwNeedsBooking = inwardEXW.filter(t => t.needs_booking).length;
  const importPending = inwardImport.filter(t => t.status === 'PENDING').length;
  const dispatchNeedsBooking = dispatch.filter(t => t.needs_booking).length;

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="transport-planner-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Map className="w-8 h-8 text-indigo-500" />
          Transportation Planner
        </h1>
        <p className="text-muted-foreground mt-1">
          Plan and book transports for inward (EXW/Import) and dispatch operations
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">EXW Needs Booking</p>
          <p className="text-2xl font-bold text-blue-400">{exwNeedsBooking}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Import Pending</p>
          <p className="text-2xl font-bold text-purple-400">{importPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Dispatch Needs Booking</p>
          <p className="text-2xl font-bold text-amber-400">{dispatchNeedsBooking}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'inward_exw' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_exw')}
          className={exwNeedsBooking > 0 ? 'border-blue-500/50' : ''}
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Inward (EXW)
          {exwNeedsBooking > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
              {exwNeedsBooking}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'inward_import' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_import')}
          className={importPending > 0 ? 'border-purple-500/50' : ''}
        >
          <Ship className="w-4 h-4 mr-2" />
          Inward (Import)
          {importPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
              {importPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'dispatch' ? 'default' : 'outline'}
          onClick={() => setActiveTab('dispatch')}
          className={dispatchNeedsBooking > 0 ? 'border-amber-500/50' : ''}
        >
          <ArrowUpFromLine className="w-4 h-4 mr-2" />
          Dispatch
          {dispatchNeedsBooking > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">
              {dispatchNeedsBooking}
            </span>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {activeTab === 'inward_exw' && (
            <InwardEXWPlannerTab
              items={inwardEXW}
              suppliers={suppliers}
              onRefresh={loadData}
              onBookTransport={() => openBookingModal('INWARD_EXW')}
            />
          )}
          {activeTab === 'inward_import' && (
            <InwardImportPlannerTab
              imports={inwardImport}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'dispatch' && (
            <DispatchPlannerTab
              items={dispatch}
              onRefresh={loadData}
              onBookTransport={(jobOrder) => openBookingModal('DISPATCH', jobOrder)}
            />
          )}
        </>
      )}

      {/* Booking Modal */}
      {showBookingModal && (
        <TransportBookingModal
          type={bookingType}
          jobOrder={selectedJobOrder}
          onClose={() => {
            setShowBookingModal(false);
            setSelectedJobOrder(null);
          }}
          onBooked={() => {
            setShowBookingModal(false);
            setSelectedJobOrder(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== INWARD EXW PLANNER TAB ====================
const InwardEXWPlannerTab = ({ items, suppliers, onRefresh, onBookTransport }) => {
  const needsBooking = items.filter(i => i.needs_booking);
  const booked = items.filter(i => !i.needs_booking && i.transport_number);

  return (
    <div className="space-y-6">
      {/* Needs Booking Section */}
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-blue-400" />
              EXW POs - Needs Transport Booking
            </h2>
            <p className="text-sm text-muted-foreground">
              Approved POs with EXW incoterm requiring transport arrangement
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={onBookTransport}>
              <Plus className="w-4 h-4 mr-2" />
              Book Transport
            </Button>
          </div>
        </div>

        {needsBooking.length === 0 ? (
          <div className="p-8 text-center">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-green-400 font-medium">All transports booked</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {needsBooking.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{item.po_number}</td>
                    <td className="p-3">{item.supplier_name}</td>
                    <td className="p-3 text-green-400">
                      {item.currency} {item.total_amount?.toFixed(2)}
                    </td>
                    <td className="p-3">
                      <Badge className="bg-blue-500/20 text-blue-400">
                        {item.incoterm || 'EXW'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className="bg-amber-500/20 text-amber-400">
                        Needs Transport
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Booked Transports */}
      {booked.length > 0 && (
        <div className="glass rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Booked Transports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {booked.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{item.transport_number}</td>
                    <td className="p-3">{item.po_number}</td>
                    <td className="p-3">{item.supplier_name}</td>
                    <td className="p-3">
                      <Badge className="bg-green-500/20 text-green-400">
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== INWARD IMPORT PLANNER TAB ====================
const InwardImportPlannerTab = ({ imports, onRefresh }) => {
  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Ship className="w-5 h-5 text-purple-400" />
            Import Shipments (FOB/CFR/CIF)
          </h2>
          <p className="text-sm text-muted-foreground">
            International imports requiring logistics coordination
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Documents</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const docs = imp.document_checklist || {};
                const docsComplete = Object.values(docs).filter(Boolean).length;
                const docsTotal = Object.keys(docs).length || 5;
                
                return (
                  <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{imp.import_number}</td>
                    <td className="p-3">{imp.po_number}</td>
                    <td className="p-3">{imp.supplier_name}</td>
                    <td className="p-3">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {imp.incoterm}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={docsComplete === docsTotal ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                        {docsComplete}/{docsTotal}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className="bg-gray-500/20 text-gray-400">
                        {imp.status}
                      </Badge>
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

// ==================== DISPATCH PLANNER TAB ====================
const DispatchPlannerTab = ({ items, onRefresh, onBookTransport }) => {
  // Separate job orders from transport records
  const jobOrders = items.filter(i => i.type === 'JO' || i.job_number);
  const transportRecords = items.filter(i => i.transport_number && !i.job_number);
  
  // Group transport records by job_order_id to calculate quantities
  const transportByJobId = {};
  transportRecords.forEach(t => {
    const jobId = t.job_order_id;
    if (jobId) {
      if (!transportByJobId[jobId]) {
        transportByJobId[jobId] = [];
      }
      transportByJobId[jobId].push(t);
    }
  });
  
  // Helper function to normalize units for comparison
  const normalizeUnit = (unit) => {
    if (!unit) return '';
    const u = unit.toUpperCase().trim();
    // Normalize common unit variations
    if (u.includes('DRUM') || u.includes('STEEL DRUM')) return 'DRUM';
    if (u === 'MT' || u === 'TON' || u === 'TONNE') return 'MT';
    if (u === 'KG' || u === 'KILOGRAM') return 'KG';
    return u;
  };
  
  // Helper function to convert quantity to job order unit
  const convertToJobUnit = (qty, fromUnit, toUnit) => {
    if (!qty || !fromUnit || !toUnit) return qty;
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    
    // If units match, return as is
    if (from === to) return qty;
    
    // Convert MT to KG (1 MT = 1000 KG)
    if (from === 'MT' && to === 'KG') return qty * 1000;
    if (from === 'KG' && to === 'MT') return qty / 1000;
    
    // For DRUM, we can't convert without knowing weight per drum
    // So we'll assume same unit if both are DRUM-related
    if ((from.includes('DRUM') || from === 'DRUM') && 
        (to.includes('DRUM') || to === 'DRUM')) {
      return qty;
    }
    
    // If units don't match and can't convert, return original quantity
    return qty;
  };
  
  // Calculate quantity booked and balance quantity for each job order in MT
  const itemsWithQuantities = jobOrders.map(item => {
    const jobTransports = transportByJobId[item.id] || [];
    
    // Calculate total quantity booked from all transport bookings in MT
    let quantityBookedMT = 0;
    jobTransports.forEach(t => {
      const transportUnit = normalizeUnit(t.unit || '');
      let transportQtyMT = t.quantity || 0;
      
      // Convert transport quantity to MT if needed
      if (transportUnit === 'KG') {
        transportQtyMT = transportQtyMT / 1000;
      }
      // If already in MT, use as-is
      // Transport bookings should always be in MT for consistency
      
      quantityBookedMT += transportQtyMT;
    });
    
    // Use total_weight_mt from job order for balance calculation
    const totalQuantityMT = item.total_weight_mt || 0;
    
    // Calculate balance quantity in MT (ensure it's not negative)
    const balanceQuantityMT = Math.max(0, totalQuantityMT - quantityBookedMT);
    
    return {
      ...item,
      quantity_booked_mt: quantityBookedMT,
      balance_quantity_mt: balanceQuantityMT,
      transport_bookings: jobTransports
    };
  });

  // Filter: Show items that need booking OR have balance quantity > 0
  // Items remain on the page until balance quantity = 0
  const needsBooking = itemsWithQuantities.filter(i => 
    i.needs_booking || (i.balance_quantity_mt && i.balance_quantity_mt > 0)
  );
  
  // Only show fully dispatched items (balance = 0) - these can change status to dispatched
  const fullyDispatched = itemsWithQuantities.filter(i => 
    i.balance_quantity_mt === 0 && i.quantity_booked_mt > 0
  );

  return (
    <div className="space-y-6">
      {/* Needs Booking Section */}
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
            <Button onClick={onBookTransport}>
              <Plus className="w-4 h-4 mr-2" />
              Book Transport
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Booked Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Balance Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {needsBooking.map((item) => {
                  const balanceQtyMT = item.balance_quantity_mt || 0;
                  const quantityBookedMT = item.quantity_booked_mt || 0;
                  const totalQtyMT = item.total_weight_mt || 0;
                  const isFullyBooked = balanceQtyMT === 0 && quantityBookedMT > 0;
                  
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{item.job_number}</td>
                      <td className="p-3">{item.product_name}</td>
                      <td className="p-3 font-mono">{totalQtyMT.toFixed(2)} MT</td>
                      <td className="p-3">
                        <span className={quantityBookedMT > 0 ? 'text-green-400' : 'text-muted-foreground'}>
                          <span className="font-mono">{quantityBookedMT.toFixed(2)} MT</span>
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={balanceQtyMT > 0 ? 'text-amber-400 font-semibold' : 'text-green-400'}>
                          <span className="font-mono">{balanceQtyMT.toFixed(2)} MT</span>
                        </span>
                      </td>
                      <td className="p-3">{item.customer_name || '-'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {isFullyBooked ? (
                            <Badge className="bg-green-500/20 text-green-400">
                              Ready to Dispatch
                            </Badge>
                          ) : (
                            <Badge className={item.status === 'READY' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                              {item.status}
                            </Badge>
                          )}
                          {balanceQtyMT > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onBookTransport(item)}
                              className="h-7 text-xs"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Book
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

      {/* Fully Dispatched Section - Only show when balance = 0 */}
      {fullyDispatched.length > 0 && (
        <div className="glass rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Check className="w-5 h-5 text-green-400" />
              Fully Dispatched (Balance = 0)
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Job orders with zero balance quantity - ready for status change to dispatched
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Number</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Total MT</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Booked Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Balance Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {fullyDispatched.map((item) => {
                  const quantityBookedMT = item.quantity_booked_mt || 0;
                  const balanceQtyMT = item.balance_quantity_mt || 0;
                  const totalQtyMT = item.total_weight_mt || 0;
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{item.job_number}</td>
                      <td className="p-3">{item.product_name}</td>
                      <td className="p-3 font-mono">{totalQtyMT.toFixed(2)} MT</td>
                      <td className="p-3 text-green-400 font-mono">{quantityBookedMT.toFixed(2)} MT</td>
                      <td className="p-3 text-green-400 font-semibold font-mono">{balanceQtyMT.toFixed(2)} MT</td>
                      <td className="p-3">
                        <Badge className="bg-green-500/20 text-green-400">
                          Ready for Dispatch
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== TRANSPORT BOOKING MODAL ====================
const TransportBookingModal = ({ type, jobOrder, onClose, onBooked }) => {
  // Initialize quantity properly - use balance_quantity_mt if available and > 0, otherwise use total_weight_mt
  const getInitialQuantity = () => {
    if (!jobOrder) return '';
    const balanceQtyMT = jobOrder.balance_quantity_mt;
    const totalQtyMT = jobOrder.total_weight_mt;
    // If balance_quantity_mt exists and is > 0, use it; otherwise use total_weight_mt
    if (balanceQtyMT !== undefined && balanceQtyMT !== null && balanceQtyMT > 0) {
      return balanceQtyMT;
    }
    return totalQtyMT || '';
  };

  const [form, setForm] = useState({
    job_order_id: jobOrder?.id || '',
    quantity_mt: getInitialQuantity(), // Quantity in MT
    transporter_name: '',
    vehicle_type: 'tanker',
    vehicle_number: '',
    scheduled_date: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  // Update form when jobOrder changes
  useEffect(() => {
    if (jobOrder) {
      const balanceQtyMT = jobOrder.balance_quantity_mt;
      const totalQtyMT = jobOrder.total_weight_mt;
      const initialQtyMT = (balanceQtyMT !== undefined && balanceQtyMT !== null && balanceQtyMT > 0) 
        ? balanceQtyMT 
        : (totalQtyMT || '');
      
      setForm(prev => ({
        ...prev,
        job_order_id: jobOrder.id,
        quantity_mt: initialQtyMT
      }));
    }
  }, [jobOrder]);

  const handleSave = async () => {
    if (!form.transporter_name) {
      toast.error('Please enter transporter name');
      return;
    }
    
    if (type === 'DISPATCH' && !form.job_order_id) {
      toast.error('Please select a job order');
      return;
    }
    
    if (type === 'DISPATCH' && (!form.quantity_mt || form.quantity_mt <= 0)) {
      toast.error('Please enter a valid quantity in MT');
      return;
    }
    
    setSaving(true);
    try {
      // Create transport booking
      const endpoint = type === 'INWARD_EXW' ? '/transport/inward/book' : '/transport/outward/book';
      
      // Ensure quantity is properly converted to number for dispatch (in MT)
      let bookingQuantityMT = form.quantity_mt;
      if (type === 'DISPATCH') {
        if (bookingQuantityMT === '' || bookingQuantityMT === null || bookingQuantityMT === undefined) {
          toast.error('Please enter a valid quantity in MT');
          setSaving(false);
          return;
        }
        bookingQuantityMT = parseFloat(bookingQuantityMT);
        if (isNaN(bookingQuantityMT) || bookingQuantityMT <= 0) {
          toast.error('Please enter a valid quantity in MT greater than 0');
          setSaving(false);
          return;
        }
      }
      
      const bookingData = {
        ...form,
        quantity: bookingQuantityMT, // Send as quantity in MT
        unit: 'MT', // Explicitly set unit to MT
        transport_type: type === 'INWARD_EXW' ? 'INWARD' : 'LOCAL',
        job_id: form.job_order_id || undefined,
        job_order_id: form.job_order_id || undefined
      };
      
      console.log('Booking transport with data:', bookingData); // Debug log
      
      await api.post(endpoint, bookingData);
      
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-500" />
            Book Transport - {type === 'INWARD_EXW' ? 'Inward (EXW)' : 'Dispatch'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {type === 'DISPATCH' && jobOrder && (
            <div className="p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-sm font-medium">Job Order: {jobOrder.job_number}</p>
              <p className="text-xs text-muted-foreground">
                Product: {jobOrder.product_name} | 
                Total Weight: <span className="font-mono">{(jobOrder.total_weight_mt || 0).toFixed(2)} MT</span> | 
                Balance: <span className="font-mono">{(jobOrder.balance_quantity_mt || jobOrder.total_weight_mt || 0).toFixed(2)} MT</span>
              </p>
            </div>
          )}
          
          {type === 'DISPATCH' && (
            <div>
              <Label>Quantity Being Dispatched (MT) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={jobOrder?.balance_quantity_mt || jobOrder?.total_weight_mt || ''}
                value={form.quantity_mt}
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow empty string for clearing, or parse as float
                  if (val === '') {
                    setForm({...form, quantity_mt: ''});
                  } else {
                    const numVal = parseFloat(val);
                    if (!isNaN(numVal) && numVal >= 0) {
                      setForm({...form, quantity_mt: numVal});
                    }
                  }
                }}
                placeholder="Enter quantity in MT"
              />
              {jobOrder && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available: <span className="font-mono">{(jobOrder.balance_quantity_mt || jobOrder.total_weight_mt || 0).toFixed(2)} MT</span>
                </p>
              )}
            </div>
          )}
          
          <div>
            <Label>Transporter Name *</Label>
            <Input
              value={form.transporter_name}
              onChange={(e) => setForm({...form, transporter_name: e.target.value})}
              placeholder="Enter transporter company"
            />
          </div>
          
          <div>
            <Label>Vehicle Type</Label>
            <Select value={form.vehicle_type} onValueChange={(v) => setForm({...form, vehicle_type: v})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tanker">Tanker</SelectItem>
                <SelectItem value="trailer">Trailer</SelectItem>
                <SelectItem value="container">Container</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Vehicle Number</Label>
            <Input
              value={form.vehicle_number}
              onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
              placeholder="License plate"
            />
          </div>

          <div>
            <Label>Scheduled Date/Time</Label>
            <Input
              type="datetime-local"
              value={form.scheduled_date}
              onChange={(e) => setForm({...form, scheduled_date: e.target.value})}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Booking...' : 'Book Transport'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransportPlannerPage;
