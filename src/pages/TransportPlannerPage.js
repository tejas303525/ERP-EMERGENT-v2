import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Map, ArrowDownToLine, ArrowUpFromLine, Ship, Truck, Calendar,
  Plus, RefreshCw, Check, X, Building, Clock, Package
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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
      const jobsRes = await api.get('/job-orders', { params: { status: 'ready_for_dispatch' } }).catch(() => ({ data: [] }));
      // Handle paginated response structure - jobsRes.data is {data: [...], pagination: {...}}
      const jobsResponse = jobsRes?.data || {};
      const jobsData = Array.isArray(jobsResponse.data) ? jobsResponse.data : (Array.isArray(jobsResponse) ? jobsResponse : []);
      const readyJobs = jobsData.filter(j => 
        j.status === 'ready_for_dispatch' || j.status === 'approved'
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
      
      setDispatch([
        ...readyJobs.map(job => {
          const jobTransports = transportByJobId[job.id] || [];
          const hasTransport = jobTransports.length > 0;
          
          // Calculate quantity booked from all transport bookings
          const quantityBooked = jobTransports.reduce((sum, t) => sum + (t.quantity || 0), 0);
          const totalQuantity = job.quantity || 0;
          const balanceQuantity = totalQuantity - quantityBooked;
          
          return {
            ...job,
            type: 'JO',
            needs_booking: !hasTransport,
            status: job.status === 'ready_for_dispatch' ? 'READY' : 'APPROVED',
            // Include transport bookings and calculated quantities
            transport_bookings: jobTransports,
            quantity_booked: quantityBooked,
            balance_quantity: balanceQuantity
          };
        }),
        ...outward.map(t => {
          // For transport records, also calculate quantities if job_order_id exists
          if (t.job_order_id) {
            const jobTransports = transportByJobId[t.job_order_id] || [];
            const quantityBooked = jobTransports.reduce((sum, tr) => sum + (tr.quantity || 0), 0);
            // Try to get job order quantity from the transport record or fetch it
            const totalQuantity = t.quantity || 0; // This might need to be enriched from job order
            const balanceQuantity = totalQuantity - quantityBooked;
            
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

  // Calculate quantity booked and balance quantity for each job order
  const itemsWithQuantities = jobOrders.map(item => {
    const jobTransports = transportByJobId[item.id] || [];

    // Calculate total quantity booked from all transport bookings
    const quantityBooked = jobTransports.reduce((sum, t) => sum + (t.quantity || 0), 0);

    // Get job order total quantity
    const totalQuantity = item.quantity || 0;

    // Calculate balance quantity
    const balanceQuantity = totalQuantity - quantityBooked;

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

  // Calculate pie chart data - cumulative balance quantities by product
  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347', '#87ceeb'];

  const pieChartData = needsBooking.reduce((acc, item) => {
    const productName = item.product_name || 'Unknown Product';
    const balanceQty = item.balance_quantity || 0;

    if (balanceQty > 0) {
      const existing = acc.find(p => p.name === productName);
      if (existing) {
        existing.value += balanceQty;
      } else {
        acc.push({
          name: productName,
          value: balanceQty
        });
      }
    }
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      {/* Dispatch Analytics Pie Chart */}
      {pieChartData.length > 0 && (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-400" />
              Products Yet to be Dispatched
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, 'Quantity']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Total pending quantity: {pieChartData.reduce((sum, item) => sum + item.value, 0).toFixed(2)} units
            </div>
          </CardContent>
        </Card>
      )}
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Total Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity Booked</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Balance Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {needsBooking.map((item) => {
                  const unit = item.unit || 'drums';
                  const balanceQty = item.balance_quantity || 0;
                  const isFullyBooked = balanceQty === 0 && item.quantity_booked > 0;
                  
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{item.job_number}</td>
                      <td className="p-3">{item.product_name}</td>
                      <td className="p-3">{item.quantity} {unit}</td>
                      <td className="p-3">
                        <span className={item.quantity_booked > 0 ? 'text-green-400' : 'text-muted-foreground'}>
                          {item.quantity_booked || 0} {unit}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={balanceQty > 0 ? 'text-amber-400 font-semibold' : 'text-green-400'}>
                          {balanceQty} {unit}
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
                          {balanceQty > 0 && (
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Total Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity Booked</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Balance Quantity</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {fullyDispatched.map((item) => {
                  const unit = item.unit || 'drums';
                  return (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{item.job_number}</td>
                      <td className="p-3">{item.product_name}</td>
                      <td className="p-3">{item.quantity} {unit}</td>
                      <td className="p-3 text-green-400">{item.quantity_booked || 0} {unit}</td>
                      <td className="p-3 text-green-400 font-semibold">0 {unit}</td>
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
  const [form, setForm] = useState({
    job_order_id: jobOrder?.id || '',
    quantity: jobOrder?.balance_quantity || jobOrder?.quantity || '',
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
      setForm(prev => ({
        ...prev,
        job_order_id: jobOrder.id,
        quantity: jobOrder.balance_quantity || jobOrder.quantity || ''
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
    
    if (type === 'DISPATCH' && (!form.quantity || form.quantity <= 0)) {
      toast.error('Please enter a valid quantity');
      return;
    }
    
    setSaving(true);
    try {
      // Create transport booking
      const endpoint = type === 'INWARD_EXW' ? '/transport/inward/book' : '/transport/outward/book';
      await api.post(endpoint, {
        ...form,
        transport_type: type,
        job_id: form.job_order_id || undefined,
        job_order_id: form.job_order_id || undefined
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
                Total: {jobOrder.quantity} {jobOrder.unit || 'drums'} | 
                Balance: {jobOrder.balance_quantity || jobOrder.quantity} {jobOrder.unit || 'drums'}
              </p>
            </div>
          )}
          
          {type === 'DISPATCH' && (
            <div>
              <Label>Quantity to Book *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={jobOrder?.balance_quantity || jobOrder?.quantity || ''}
                value={form.quantity}
                onChange={(e) => setForm({...form, quantity: parseFloat(e.target.value) || ''})}
                placeholder="Enter quantity"
              />
              {jobOrder && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available: {jobOrder.balance_quantity || jobOrder.quantity} {jobOrder.unit || 'drums'}
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
