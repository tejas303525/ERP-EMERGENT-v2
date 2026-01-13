import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Map, ArrowDownToLine, ArrowUpFromLine, Ship, Truck, Calendar,
  Plus, RefreshCw, Check, X, Building, Clock, Package, BarChart3, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Cell
} from 'recharts';

const TransportPlannerPage = () => {
  const [activeTab, setActiveTab] = useState('inward_exw');
  const [inwardEXW, setInwardEXW] = useState([]);
  const [inwardImport, setInwardImport] = useState([]);
  const [dispatch, setDispatch] = useState([]);
  const [outwardTransports, setOutwardTransports] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingType, setBookingType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    loadData();
    // Check for unbooked transports on load
    checkUnbookedTransports();
  }, []);

  const checkUnbookedTransports = async () => {
    try {
      await api.post('/transport/check-unbooked');
    } catch (error) {
      console.error('Failed to check unbooked transports:', error);
    }
  };

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
      
      // Get finance-approved POs that need transport booking (EXW)
      // Only show POs that are APPROVED (finance approved) and don't have transport booked yet
      const existingInward = inwardRes.data || [];
      const approvedPOs = (posRes.data || []).filter(po => {
        // Must be finance approved
        if (po.status !== 'APPROVED') return false;
        // Must be EXW incoterm
        if (po.incoterm !== 'EXW') return false;
        // Must not already have transport booked
        const hasTransport = existingInward.some(t => t.po_id === po.id && t.transport_number);
        if (hasTransport) return false;
        // Must not have transport_booked flag set
        if (po.transport_booked || po.transport_number) return false;
        return true;
      });
      
      // Set inward EXW items - only POs that need booking
      setInwardEXW([
        ...approvedPOs.map(po => ({
          ...po,
          type: 'PO',
          needs_booking: true,
          status: 'NEEDS_TRANSPORT'
        })),
        // Also include existing booked transports for display
        ...existingInward.filter(t => (t.source === 'PO_EXW' || t.incoterm === 'EXW') && t.transport_number)
      ]);
      
      setInwardImport(importsRes.data || []);
      
      // Get dispatch jobs
      const outward = outwardRes.data || [];
      setOutwardTransports(outward); // Store all outward transports for MT calculations
      const jobsRes = await api.get('/job-orders', { params: { status: 'ready_for_dispatch' } }).catch(() => ({ data: [] }));
      // Handle paginated response structure - jobsRes.data is {data: [...], pagination: {...}}
      const jobsResponse = jobsRes?.data || {};
      const jobsData = Array.isArray(jobsResponse.data) ? jobsResponse.data : (Array.isArray(jobsResponse) ? jobsResponse : []);
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
      
      setDispatch([
        ...readyJobs.map(job => {
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
        }),
        ...bookedOutward.map(t => {
          // For transport records, also calculate quantities if job_order_id exists
          if (t.job_order_id) {
            const jobTransports = transportByJobId[t.job_order_id] || [];
            const quantityBooked = jobTransports.reduce((sum, tr) => sum + (tr.quantity || 0), 0);
            // Use total_weight_mt instead of quantity for MT calculation
            const totalQuantityMT = t.total_weight_mt || 0;
            const balanceQuantity = totalQuantityMT - quantityBooked;
            
            return {
              ...t,
              quantity_booked: quantityBooked,
              balance_quantity: balanceQuantity
            };
          }
          return t;
        })
      ]);
      
      setSuppliers(suppliersRes.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openBookingModal = (type, item = null) => {
    setBookingType(type);
    setSelectedItem(item);
    setShowBookingModal(true);
  };

  // Stats
  const exwNeedsBooking = inwardEXW.filter(t => t.needs_booking).length;
  const importPending = inwardImport.filter(t => t.status === 'PENDING').length;
  const dispatchNeedsBooking = dispatch.filter(t => t.needs_booking).length;

  // Calculate MT totals for dispatched and pending
  const dispatchedMT = outwardTransports
    .filter(t => ['DISPATCHED', 'DELIVERED', 'AT_PORT', 'SHIPPED'].includes(t.status))
    .reduce((sum, t) => {
      const qty = parseFloat(t.quantity) || 0;
      if (qty === 0 && t.total_weight_mt) {
        return sum + (parseFloat(t.total_weight_mt) || 0);
      }
      return sum + qty;
    }, 0);
  
  const pendingMT = outwardTransports
    .filter(t => ['PENDING', 'LOADING', 'NEEDS_BOOKING'].includes(t.status))
    .reduce((sum, t) => {
      let qty = parseFloat(t.quantity) || 0;
      if (qty === 0 && t.total_weight_mt) {
        qty = parseFloat(t.total_weight_mt) || 0;
      }
      return sum + qty;
    }, 0);

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
      <div className="grid grid-cols-5 gap-4 mb-6">
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
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Dispatched MT</p>
          <p className="text-2xl font-bold text-cyan-400">{dispatchedMT.toFixed(2)}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-orange-500/30">
          <p className="text-sm text-muted-foreground">Pending MT</p>
          <p className="text-2xl font-bold text-orange-400">{pendingMT.toFixed(2)}</p>
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
        <Button
          variant={activeTab === 'analytics' ? 'default' : 'outline'}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Dispatch Analytics
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
              onBookTransport={(item) => openBookingModal('INWARD_EXW', item)}
            />
          )}
          {activeTab === 'inward_import' && (
            <InwardImportPlannerTab
              imports={inwardImport}
              onRefresh={loadData}
              onBookTransport={(item) => openBookingModal('INWARD_IMPORT', item)}
            />
          )}
          {activeTab === 'dispatch' && (
            <DispatchPlannerTab
              items={dispatch}
              onRefresh={loadData}
              onBookTransport={(item) => openBookingModal('DISPATCH', item)}
            />
          )}
          {activeTab === 'analytics' && (
            <DispatchAnalyticsTab />
          )}
        </>
      )}

      {/* Booking Modal */}
      {showBookingModal && (
        <TransportBookingModal
          type={bookingType}
          item={selectedItem}
          onClose={() => {
            setShowBookingModal(false);
            setSelectedItem(null);
          }}
          onBooked={() => {
            setShowBookingModal(false);
            setSelectedItem(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== INWARD EXW PLANNER TAB ====================
const InwardEXWPlannerTab = ({ items, suppliers, onRefresh, onBookTransport }) => {
  const [selectedItem, setSelectedItem] = useState(null);
  const needsBooking = items.filter(i => i.needs_booking);
  const booked = items.filter(i => !i.needs_booking && i.transport_number);

  const handleBookClick = (item) => {
    setSelectedItem(item);
    onBookTransport(item);
  };

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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {needsBooking.map((item) => {
                  // Get lines from PO - should always be present now
                  const lines = item.lines || [];
                  
                  // If no lines, show a single row with "No items"
                  if (lines.length === 0) {
                    return (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="p-3 font-mono font-medium">{item.po_number}</td>
                        <td className="p-3">{item.supplier_name}</td>
                        <td className="p-3 text-sm text-muted-foreground">No items</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3">
                          <Badge className="bg-amber-500/20 text-amber-400">
                            Needs Transport
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Button size="sm" onClick={() => handleBookClick(item)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Book
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  
                  // Show one row per line item
                  return lines.map((line, lineIdx) => (
                    <tr key={`${item.id}-${lineIdx}`} className="border-b border-border/50 hover:bg-muted/10">
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3 font-mono font-medium" rowSpan={lines.length}>{item.po_number}</td>
                          <td className="p-3" rowSpan={lines.length}>{item.supplier_name}</td>
                        </>
                      )}
                      <td className="p-3 text-sm">{line.item_name || 'Unknown'}</td>
                      <td className="p-3">{line.qty || 0} {line.uom || 'KG'}</td>
                      <td className="p-3">
                        {line.required_by ? (
                          <span className="text-cyan-400">
                            {new Date(line.required_by).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3" rowSpan={lines.length}>
                            <Badge className="bg-amber-500/20 text-amber-400">
                              Needs Transport
                            </Badge>
                          </td>
                          <td className="p-3" rowSpan={lines.length}>
                            <Button size="sm" onClick={() => handleBookClick(item)}>
                              <Plus className="w-4 h-4 mr-1" />
                              Book
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ));
                })}
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">ETA</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {booked.map((item) => {
                  // Get lines from PO - should always be present now
                  const lines = item.lines || [];
                  
                  // If no lines, show a single row with "No items"
                  if (lines.length === 0) {
                    return (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="p-3 font-mono font-medium">{item.transport_number}</td>
                        <td className="p-3">{item.po_number}</td>
                        <td className="p-3">{item.supplier_name}</td>
                        <td className="p-3 text-sm text-muted-foreground">No items</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3">
                          {item.eta ? (
                            <span className="text-cyan-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(item.eta).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge className="bg-green-500/20 text-green-400">
                            {item.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  }
                  
                  // Show one row per line item
                  return lines.map((line, lineIdx) => (
                    <tr key={`${item.id}-${lineIdx}`} className="border-b border-border/50 hover:bg-muted/10">
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3 font-mono font-medium" rowSpan={lines.length}>{item.transport_number}</td>
                          <td className="p-3" rowSpan={lines.length}>{item.po_number}</td>
                          <td className="p-3" rowSpan={lines.length}>{item.supplier_name}</td>
                        </>
                      )}
                      <td className="p-3 text-sm">{line.item_name || 'Unknown'}</td>
                      <td className="p-3">{line.qty || 0} {line.uom || 'KG'}</td>
                      <td className="p-3">
                        {line.required_by ? (
                          <span className="text-cyan-400">
                            {new Date(line.required_by).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3" rowSpan={lines.length}>
                            {item.eta ? (
                              <span className="text-cyan-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(item.eta).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3" rowSpan={lines.length}>
                            <Badge className="bg-green-500/20 text-green-400">
                              {item.status}
                            </Badge>
                          </td>
                        </>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== INWARD IMPORT PLANNER TAB ====================
const InwardImportPlannerTab = ({ imports, onRefresh, onBookTransport }) => {
  const needsBooking = imports.filter(imp => !imp.transport_number && !imp.transport_booked && imp.status !== 'COMPLETED');
  const booked = imports.filter(imp => imp.transport_number || imp.transport_booked);

  return (
    <div className="space-y-6">
      {/* Needs Booking Section */}
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Ship className="w-5 h-5 text-purple-400" />
              Import Shipments - Needs Transport Booking
            </h2>
            <p className="text-sm text-muted-foreground">
              International imports requiring transport arrangement
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {needsBooking.length === 0 ? (
          <div className="p-8 text-center">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-green-400 font-medium">All imports have transport booked</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Import #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Containers/Drums</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Documents</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {needsBooking.map((imp) => {
                  const docs = imp.document_checklist || {};
                  const docsComplete = Object.values(docs).filter(Boolean).length;
                  const docsTotal = Object.keys(docs).length || 5;
                  
                  // Get lines from PO - check both lines and po_items (legacy)
                  const lines = imp.lines || imp.po_items?.map(item => ({
                    item_name: item.product_name || item.item_name,
                    qty: item.quantity || item.qty,
                    uom: item.unit || item.uom,
                    required_by: item.required_by || item.delivery_date
                  })) || [];
                  
                  // If no lines, show a single row
                  if (lines.length === 0) {
                    return (
                      <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="p-3 font-mono font-medium">{imp.import_number}</td>
                        <td className="p-3 font-mono text-purple-400">{imp.po_number}</td>
                        <td className="p-3">
                          <div>
                            <div className="font-medium">{imp.supplier_name}</div>
                            {imp.supplier_contact && (
                              <div className="text-xs text-muted-foreground">{imp.supplier_contact}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">No items</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3 text-sm">
                          {imp.container_count ? (
                            <Badge variant="outline">
                              {imp.container_count} Container{imp.container_count > 1 ? 's' : ''}
                            </Badge>
                          ) : imp.drum_count ? (
                            <Badge variant="outline">
                              {imp.drum_count} Drum{imp.drum_count > 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
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
                        <td className="p-3">
                          <Button size="sm" onClick={() => onBookTransport(imp)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Book
                          </Button>
                        </td>
                      </tr>
                    );
                  }
                  
                  // Show one row per line item
                  return lines.map((line, lineIdx) => (
                    <tr key={`${imp.id}-${lineIdx}`} className="border-b border-border/50 hover:bg-muted/10">
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3 font-mono font-medium" rowSpan={lines.length}>{imp.import_number}</td>
                          <td className="p-3 font-mono text-purple-400" rowSpan={lines.length}>{imp.po_number}</td>
                          <td className="p-3" rowSpan={lines.length}>
                            <div>
                              <div className="font-medium">{imp.supplier_name}</div>
                              {imp.supplier_contact && (
                                <div className="text-xs text-muted-foreground">{imp.supplier_contact}</div>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                      <td className="p-3 text-sm">{line.item_name || 'Unknown'}</td>
                      <td className="p-3">{line.qty || 0} {line.uom || 'KG'}</td>
                      <td className="p-3">
                        {line.required_by ? (
                          <span className="text-cyan-400">
                            {new Date(line.required_by).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3 text-sm" rowSpan={lines.length}>
                            {imp.container_count ? (
                              <Badge variant="outline">
                                {imp.container_count} Container{imp.container_count > 1 ? 's' : ''}
                              </Badge>
                            ) : imp.drum_count ? (
                              <Badge variant="outline">
                                {imp.drum_count} Drum{imp.drum_count > 1 ? 's' : ''}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3" rowSpan={lines.length}>
                            <Badge className="bg-purple-500/20 text-purple-400">
                              {imp.incoterm}
                            </Badge>
                          </td>
                          <td className="p-3" rowSpan={lines.length}>
                            <Badge className={docsComplete === docsTotal ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                              {docsComplete}/{docsTotal}
                            </Badge>
                          </td>
                          <td className="p-3" rowSpan={lines.length}>
                            <Badge className="bg-gray-500/20 text-gray-400">
                              {imp.status}
                            </Badge>
                          </td>
                          <td className="p-3" rowSpan={lines.length}>
                            <Button size="sm" onClick={() => onBookTransport(imp)}>
                              <Plus className="w-4 h-4 mr-1" />
                              Book
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ));
                })}
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Import #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {booked.map((imp) => {
                  // Get lines from PO - check both lines and po_items (legacy)
                  const lines = imp.lines || imp.po_items?.map(item => ({
                    item_name: item.product_name || item.item_name,
                    qty: item.quantity || item.qty,
                    uom: item.unit || item.uom,
                    required_by: item.required_by || item.delivery_date
                  })) || [];
                  
                  // If no lines, show a single row
                  if (lines.length === 0) {
                    return (
                      <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="p-3 font-mono font-medium">{imp.transport_number || '-'}</td>
                        <td className="p-3 font-mono">{imp.import_number}</td>
                        <td className="p-3">{imp.po_number}</td>
                        <td className="p-3">{imp.supplier_name}</td>
                        <td className="p-3 text-sm text-muted-foreground">No items</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3 text-muted-foreground">-</td>
                        <td className="p-3">
                          <Badge className="bg-green-500/20 text-green-400">
                            {imp.transport_status || 'BOOKED'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  }
                  
                  // Show one row per line item
                  return lines.map((line, lineIdx) => (
                    <tr key={`${imp.id}-${lineIdx}`} className="border-b border-border/50 hover:bg-muted/10">
                      {lineIdx === 0 && (
                        <>
                          <td className="p-3 font-mono font-medium" rowSpan={lines.length}>{imp.transport_number || '-'}</td>
                          <td className="p-3 font-mono" rowSpan={lines.length}>{imp.import_number}</td>
                          <td className="p-3" rowSpan={lines.length}>{imp.po_number}</td>
                          <td className="p-3" rowSpan={lines.length}>{imp.supplier_name}</td>
                        </>
                      )}
                      <td className="p-3 text-sm">{line.item_name || 'Unknown'}</td>
                      <td className="p-3">{line.qty || 0} {line.uom || 'KG'}</td>
                      <td className="p-3">
                        {line.required_by ? (
                          <span className="text-cyan-400">
                            {new Date(line.required_by).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      {lineIdx === 0 && (
                        <td className="p-3" rowSpan={lines.length}>
                          <Badge className="bg-green-500/20 text-green-400">
                            {imp.transport_status || 'BOOKED'}
                          </Badge>
                        </td>
                      )}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== DISPATCH PLANNER TAB ====================
const DispatchPlannerTab = ({ items, onRefresh, onBookTransport }) => {
  const [selectedItem, setSelectedItem] = useState(null);
  
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
  
  // Use already-calculated values from loadData if available, otherwise recalculate
  // The loadData function already calculates quantity_booked and balance_quantity correctly
  const itemsWithQuantities = jobOrders.map(item => {
    // If quantity_booked and balance_quantity are already calculated in loadData, use them
    if (item.quantity_booked !== undefined && item.balance_quantity !== undefined) {
      return item;
    }
    
    // Otherwise, recalculate (fallback for edge cases)
    const jobTransports = transportByJobId[item.id] || [];
    const quantityBooked = jobTransports.reduce((sum, t) => sum + (t.quantity || 0), 0);
    const totalQuantityMT = item.total_weight_mt || 0;
    const balanceQuantity = totalQuantityMT - quantityBooked;
    
    return {
      ...item,
      quantity_booked: quantityBooked,
      balance_quantity: balanceQuantity,
      transport_bookings: jobTransports
    };
  });

  // Filter: Show items that need booking OR have balance quantity > 0
  // Items remain on the page until balance quantity = 0
  const needsBooking = itemsWithQuantities.filter(i => 
    i.needs_booking || (i.balance_quantity && i.balance_quantity > 0)
  );
  
  // Only show fully dispatched items (balance = 0) - these can change status to dispatched
  const fullyDispatched = itemsWithQuantities.filter(i => 
    i.balance_quantity === 0 && i.quantity_booked > 0
  );

  const handleBookClick = (item) => {
    setSelectedItem(item);
    onBookTransport(item);
  };

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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {needsBooking.map((item) => {
                  const unit = item.unit || item.packaging || 'drums';
                  const balanceQty = item.balance_quantity || 0;
                  const quantityBooked = item.quantity_booked || 0;
                  const isFullyBooked = balanceQty === 0 && quantityBooked > 0;
                  
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Booked MT</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Balance MT</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {fullyDispatched.map((item) => {
                  const unit = item.unit || item.packaging || 'drums';
                  const quantityBooked = item.quantity_booked || 0;
                  const balanceQty = item.balance_quantity || 0;
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{item.job_number}</td>
                      <td className="p-3">{item.product_name || item.items?.[0]?.product_name || '-'}</td>
                      <td className="p-3 font-mono text-cyan-400 font-semibold">
                        {(item.total_weight_mt || 0).toFixed(2)} MT
                      </td>
                      <td className="p-3 text-green-400">{quantityBooked.toFixed(2)} MT</td>
                      <td className="p-3 text-green-400 font-semibold">{balanceQty.toFixed(2)} MT</td>
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
const TransportBookingModal = ({ type, item, onClose, onBooked }) => {
  const [form, setForm] = useState({
    job_order_id: item?.id || '',
    quantity: item?.balance_quantity || item?.quantity || '',
    transporter_name: '',
    vehicle_type: 'tanker',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    scheduled_date: '',
    eta: '',
    transport_charges: '',  // Add charges field
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  // Update form when item changes
  useEffect(() => {
    if (item) {
      setForm(prev => ({
        ...prev,
        job_order_id: item.id,
        quantity: item.balance_quantity || item.quantity || ''
      }));
    }
  }, [item]);

  // Set default vehicle type based on booking type
  useEffect(() => {
    if (type === 'INWARD_IMPORT') {
      setForm(prev => ({ ...prev, vehicle_type: 'container' }));
    }
  }, [type]);

  const handleSave = async () => {
    if (!form.transporter_name) {
      toast.error('Please enter transporter name');
      return;
    }
    
    if (!item) {
      toast.error('Please select an item to book transport for');
      return;
    }
    
    setSaving(true);
    try {
      // Format dates to ISO string if provided
      const formatDate = (dateStr) => {
        if (!dateStr) return '';
        // Convert datetime-local format to ISO string
        return new Date(dateStr).toISOString();
      };

      let endpoint, payload;
      
      if (type === 'INWARD_EXW') {
        endpoint = '/transport/inward/book';
        payload = {
          po_id: item.id,
          transporter: form.transporter_name,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name,
          driver_phone: form.driver_contact,
          pickup_date: formatDate(form.scheduled_date),
          eta: formatDate(form.eta)
        };
      } else if (type === 'INWARD_IMPORT') {
        endpoint = '/transport/inward/book-import';
        payload = {
          import_id: item.id,
          transporter: form.transporter_name,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name,
          driver_phone: form.driver_contact,
          pickup_date: formatDate(form.scheduled_date),
          eta: formatDate(form.eta)
        };
      } else {
        if (!form.quantity || form.quantity <= 0) {
          toast.error('Please enter a valid quantity');
          return;
        }
        
        endpoint = '/transport/outward/book';
        payload = {
          job_order_id: item.id,
          job_id: item.id,
          quantity: parseFloat(form.quantity),
          transporter_name: form.transporter_name,
          vehicle_type: form.vehicle_type,
          vehicle_number: form.vehicle_number,
          driver_name: form.driver_name,
          driver_contact: form.driver_contact,
          scheduled_date: formatDate(form.scheduled_date),
          delivery_date: formatDate(form.eta),
          notes: form.notes,
          transport_type: 'LOCAL'
        };
      }
      
      const response = await api.post(endpoint, payload);
      const transportData = response.data;
      
      // Store notification for Security Window when vehicle is booked
      if (form.vehicle_number && transportData) {
        const notificationKey = `security-vehicle-booked-${transportData.id || transportData.transport_number || Date.now()}`;
        const notificationData = {
          transport_number: transportData.transport_number || item.transport_number || '-',
          vehicle_number: form.vehicle_number,
          transporter_name: form.transporter_name,
          driver_name: form.driver_name,
          driver_contact: form.driver_contact,
          po_number: item.po_number,
          import_number: item.import_number,
          job_number: item.job_number,
          supplier_name: item.supplier_name,
          customer_name: item.customer_name,
          timestamp: new Date().toISOString(),
          type: 'VEHICLE_BOOKED',
          transport_type: type
        };
        localStorage.setItem(notificationKey, JSON.stringify(notificationData));
      }
      
      toast.success('Transport booked successfully');
      onBooked();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to book transport';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  if (!item) {
    return null;
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-500" />
            Book Transport - {type === 'INWARD_EXW' ? 'Inward (EXW)' : type === 'INWARD_IMPORT' ? 'Inward (Import)' : 'Dispatch'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Item Details Section */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              {type === 'INWARD_EXW' ? 'Purchase Order Details' : type === 'INWARD_IMPORT' ? 'Import Shipment Details' : 'Job Order Details'}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {type === 'INWARD_EXW' ? (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">PO Number</Label>
                    <p className="font-mono font-medium">{item.po_number}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Supplier</Label>
                    <p className="font-medium">{item.supplier_name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Incoterm</Label>
                    <Badge className="bg-blue-500/20 text-blue-400">{item.incoterm || 'EXW'}</Badge>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Products</Label>
                    <div className="mt-1 space-y-1">
                      {item.items?.map((product, idx) => (
                        <div key={idx} className="text-sm">
                          <span className="font-medium">{product.product_name || product.item_name}</span>
                          <span className="text-muted-foreground ml-2">
                            - {(product.quantity || product.qty || 0).toLocaleString()} {product.unit || 'KG'}
                            {product.sku && <span className="ml-2 font-mono text-xs">({product.sku})</span>}
                          </span>
                        </div>
                      )) || <p className="text-muted-foreground">No items</p>}
                    </div>
                  </div>
                </>
              ) : type === 'INWARD_IMPORT' ? (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">Import Number</Label>
                    <p className="font-mono font-medium">{item.import_number}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">PO Number</Label>
                    <p className="font-mono text-purple-400">{item.po_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Supplier</Label>
                    <p className="font-medium">{item.supplier_name || '-'}</p>
                    {item.supplier_contact && (
                      <p className="text-xs text-muted-foreground">{item.supplier_contact}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Incoterm</Label>
                    <Badge className="bg-purple-500/20 text-purple-400">{item.incoterm || 'FOB'}</Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Containers/Drums</Label>
                    <p className="font-medium">
                      {item.container_count ? `${item.container_count} Container${item.container_count > 1 ? 's' : ''}` :
                       item.drum_count ? `${item.drum_count} Drum${item.drum_count > 1 ? 's' : ''}` : '-'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Products</Label>
                    <div className="mt-1 space-y-1">
                      {item.po_items?.length > 0 ? (
                        item.po_items.map((product, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium">{product.product_name || product.item_name || 'Unknown'}</span>
                            <span className="text-muted-foreground ml-2">
                              - {product.quantity?.toLocaleString()} {product.unit || 'KG'}
                              {product.sku && <span className="ml-2 font-mono text-xs">({product.sku})</span>}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No items</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">Job Number</Label>
                    <p className="font-mono font-medium">{item.job_number}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Customer</Label>
                    <p className="font-medium">{item.customer_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Product</Label>
                    <p className="font-medium">{item.product_name || item.items?.[0]?.product_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Total Quantity</Label>
                    <p className="font-medium">{item.quantity || item.items?.[0]?.quantity || 0} {item.unit || item.packaging || 'drums'}</p>
                  </div>
                  {item.balance_quantity !== undefined && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Balance Quantity</Label>
                      <p className="font-medium text-amber-400">{item.balance_quantity || 0} {item.unit || item.packaging || 'drums'}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground text-xs">Delivery Date</Label>
                    <p className="text-sm">{item.delivery_date ? new Date(item.delivery_date).toLocaleDateString() : '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Destination</Label>
                    <p className="text-sm">{item.delivery_address || item.destination || '-'}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Transport Booking Form */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Transport Details
            </h3>
            
            <div>
              <Label>Vehicle Company (Transporter Name) *</Label>
              <Input
                value={form.transporter_name}
                onChange={(e) => setForm({...form, transporter_name: e.target.value})}
                placeholder="Enter transporter company name"
              />
            </div>
            
            {type === 'DISPATCH' && item && (
              <div>
                <Label>Quantity to Book *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={item.balance_quantity || item.quantity || ''}
                  value={form.quantity}
                  onChange={(e) => setForm({...form, quantity: parseFloat(e.target.value) || ''})}
                  placeholder="Enter quantity"
                />
                {item.balance_quantity !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: {item.balance_quantity || item.quantity} {item.unit || item.packaging || 'drums'}
                  </p>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vehicle Type *</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => setForm({...form, vehicle_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tanker">Tanker</SelectItem>
                    <SelectItem value="trailer">Trailer</SelectItem>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="container">Container</SelectItem>
                    <SelectItem value="flatbed">Flatbed</SelectItem>
                    <SelectItem value="box_truck">Box Truck</SelectItem>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Driver Name</Label>
                <Input
                  value={form.driver_name}
                  onChange={(e) => setForm({...form, driver_name: e.target.value})}
                  placeholder="Driver name"
                />
              </div>

              <div>
                <Label>Driver Contact</Label>
                <Input
                  value={form.driver_contact}
                  onChange={(e) => setForm({...form, driver_contact: e.target.value})}
                  placeholder="Phone number"
                />
              </div>
            </div>

            <div>
              <Label>Transport Charges</Label>
              <Input
                type="number"
                step="0.01"
                value={form.transport_charges}
                onChange={(e) => setForm({...form, transport_charges: e.target.value})}
                placeholder="Enter transport charges (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pickup Date/Time *</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduled_date}
                  onChange={(e) => setForm({...form, scheduled_date: e.target.value})}
                />
              </div>
              <div>
                <Label>ETA (Expected Time of Arrival)</Label>
                <Input
                  type="datetime-local"
                  value={form.eta}
                  onChange={(e) => setForm({...form, eta: e.target.value})}
                />
              </div>
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

// ==================== DISPATCH ANALYTICS TAB ====================
const DispatchAnalyticsTab = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState('30'); // days
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, [dateRange, customStartDate, customEndDate]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      let startDate = '';
      let endDate = '';
      
      if (dateRange === 'custom') {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        const days = parseInt(dateRange);
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        startDate = start.toISOString();
        endDate = end.toISOString();
      }
      
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const response = await api.get('/transport/dispatch-analytics', { params });
      setAnalyticsData(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast.error('Failed to load dispatch analytics');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'DISPATCHED': return '#10b981'; // green
      case 'DELIVERED': return '#3b82f6'; // blue
      case 'PENDING': return '#f59e0b'; // amber
      case 'LOADING': return '#8b5cf6'; // purple
      default: return '#6b7280'; // gray
    }
  };

  // Prepare Gantt chart data
  const ganttData = analyticsData?.timeline_data?.map((item, index) => {
    const dispatchDate = item.dispatch_date ? new Date(item.dispatch_date) : new Date();
    const startDate = new Date(dispatchDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    return {
      name: `${item.job_number || item.transport_number} - ${item.product_name || 'Product'}`,
      start: startDate.getTime(),
      end: endDate.getTime(),
      quantity: item.quantity || 0,
      status: item.status || 'PENDING',
      customer: item.customer_name || 'Unknown',
      product: item.product_name || 'Unknown',
      transport_number: item.transport_number || '',
      packaging: item.packaging || 'units'
    };
  }) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center p-8">
        <p className="text-muted-foreground">No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="glass rounded-lg border border-border p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Label>Date Range:</Label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          {dateRange === 'custom' && (
            <>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                placeholder="Start Date"
                className="w-40"
              />
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                placeholder="End Date"
                className="w-40"
              />
            </>
          )}
          
          <Button variant="outline" size="sm" onClick={loadAnalytics}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Total Dispatches</p>
          <p className="text-2xl font-bold text-blue-400">{analyticsData.summary.total_dispatches}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Total Quantity</p>
          <p className="text-2xl font-bold text-green-400">
            {analyticsData.summary.total_quantity.toLocaleString()} {analyticsData.timeline_data?.[0]?.packaging || 'units'}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Average per Day</p>
          <p className="text-2xl font-bold text-purple-400">
            {analyticsData.summary.average_per_day.toLocaleString()}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Date Range</p>
          <p className="text-sm font-medium text-amber-400">
            {new Date(analyticsData.summary.date_range.start).toLocaleDateString()} - {new Date(analyticsData.summary.date_range.end).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Daily Volume Chart */}
      <div className="glass rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Daily Dispatch Volume
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={analyticsData.daily_volumes || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="date" 
              stroke="#9ca3af"
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis stroke="#9ca3af" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              labelFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <Legend />
            <Bar dataKey="quantity" fill="#3b82f6" name="Quantity" />
            <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} name="Dispatch Count" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Product and Customer Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Product */}
        <div className="glass rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-green-400" />
            Dispatch by Product
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.product_volumes?.slice(0, 10) || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="product" 
                stroke="#9ca3af"
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              />
              <Bar dataKey="quantity" fill="#10b981" name="Quantity">
                {(analyticsData.product_volumes?.slice(0, 10) || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${120 + index * 10}, 70%, 50%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Customer */}
        <div className="glass rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Building className="w-5 h-5 text-purple-400" />
            Dispatch by Customer
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.customer_volumes?.slice(0, 10) || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="customer" 
                stroke="#9ca3af"
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              />
              <Bar dataKey="quantity" fill="#8b5cf6" name="Quantity">
                {(analyticsData.customer_volumes?.slice(0, 10) || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${270 + index * 10}, 70%, 50%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gantt-Style Timeline */}
      <div className="glass rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-400" />
          Dispatch Timeline (Gantt View)
        </h3>
        <div className="overflow-x-auto">
          <div className="min-w-full">
            {ganttData.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No dispatch data in selected date range
              </div>
            ) : (
              <div className="space-y-2">
                {ganttData.map((item, index) => {
                  const minDate = Math.min(...ganttData.map(d => d.start));
                  const maxDate = Math.max(...ganttData.map(d => d.end));
                  const totalRange = maxDate - minDate;
                  const leftPercent = ((item.start - minDate) / totalRange) * 100;
                  const widthPercent = ((item.end - item.start) / totalRange) * 100;
                  
                  return (
                    <div key={index} className="relative h-12">
                      <div className="absolute left-0 w-32 text-sm text-muted-foreground truncate pr-2">
                        {item.name}
                      </div>
                      <div className="ml-36 relative h-full">
                        <div
                          className="absolute h-8 rounded flex items-center justify-center text-xs font-medium text-white"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${Math.max(widthPercent, 2)}%`,
                            backgroundColor: getStatusColor(item.status),
                            minWidth: '100px'
                          }}
                          title={`${item.transport_number} - ${item.quantity} ${item.packaging} - ${item.customer}`}
                        >
                          <span className="truncate px-2">
                            {item.transport_number} ({item.quantity})
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/20 border border-green-500"></div>
            <span>Dispatched</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/20 border border-blue-500"></div>
            <span>Delivered</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-500/20 border border-amber-500"></div>
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-500/20 border border-purple-500"></div>
            <span>Loading</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransportPlannerPage;
