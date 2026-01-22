import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Truck, ArrowDownToLine, ArrowUpFromLine, Package, Check, Clock, 
  AlertTriangle, Plus, Calendar, MapPin, Ship, Container, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const TransportWindowPage = () => {
  const [inwardTransports, setInwardTransports] = useState([]);
  const [outwardLocal, setOutwardLocal] = useState([]);
  const [outwardContainer, setOutwardContainer] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inwardRes, outwardRes] = await Promise.all([
        api.get('/transport/inward'),
        api.get('/transport/outward')
      ]);
      setInwardTransports(inwardRes.data || []);
      
      const outward = outwardRes.data || [];
      setOutwardLocal(outward.filter(t => t.transport_type === 'LOCAL'));
      setOutwardContainer(outward.filter(t => t.transport_type === 'CONTAINER'));
    } catch (error) {
      setInwardTransports([]);
      setOutwardLocal([]);
      setOutwardContainer([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status, type) => {
    try {
      await api.put(`/transport/${type}/${id}/status`, null, { params: { status } });
      toast.success(`Transport ${status.toLowerCase()}`);
      loadData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // Filter scheduled bookings
  const inwardScheduled = useMemo(() => 
    inwardTransports.filter(t => t.status === 'SCHEDULED'),
    [inwardTransports]
  );

  const outwardScheduled = useMemo(() => {
    const allOutward = [...outwardLocal, ...outwardContainer];
    return allOutward.filter(t => t.status === 'SCHEDULED' || t.status === 'LOADING');
  }, [outwardLocal, outwardContainer]);

  // Filter today's deliveries (both inward and outward)
  const isTodayDelivery = (transport) => {
    const today = new Date().toISOString().split('T')[0];
    const deliveryDate = transport.dispatch_date || transport.eta;
    return deliveryDate && deliveryDate.startsWith(today);
  };

  const todaysInwardDeliveries = useMemo(() => 
    inwardTransports.filter(isTodayDelivery),
    [inwardTransports]
  );

  const todaysOutwardDeliveries = useMemo(() => {
    const allOutward = [...outwardLocal, ...outwardContainer];
    return allOutward.filter(isTodayDelivery);
  }, [outwardLocal, outwardContainer]);

  const allTodaysDeliveries = useMemo(() => 
    [...todaysInwardDeliveries, ...todaysOutwardDeliveries],
    [todaysInwardDeliveries, todaysOutwardDeliveries]
  );

  // Stats
  const inwardPending = inwardTransports.filter(t => t.status === 'PENDING').length;
  const inwardInTransit = inwardTransports.filter(t => t.status === 'IN_TRANSIT').length;
  const localPending = outwardLocal.filter(t => t.status === 'PENDING').length;
  const containerPending = outwardContainer.filter(t => t.status === 'PENDING').length;

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="transport-window-page">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="w-8 h-8 text-blue-500" />
            Transport Window Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Inward & Outward Transport Management - All Views</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Inward Pending</p>
          <p className="text-2xl font-bold text-blue-400">{inwardPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">In Transit</p>
          <p className="text-2xl font-bold text-cyan-400">{inwardInTransit}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Local Dispatch Pending</p>
          <p className="text-2xl font-bold text-amber-400">{localPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Container Pending</p>
          <p className="text-2xl font-bold text-purple-400">{containerPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Today's Deliveries</p>
          <p className="text-2xl font-bold text-green-400">{allTodaysDeliveries.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SCHEDULED BOOKINGS SECTION - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Inward Scheduled Bookings */}
            <div className="glass rounded-lg border border-border">
              <InwardScheduledTable 
                transports={inwardScheduled}
                onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'inward')}
              />
            </div>

            {/* Right: Outward Scheduled Bookings */}
            <div className="glass rounded-lg border border-border">
              <OutwardScheduledTable 
                transports={outwardScheduled}
                onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'outward')}
              />
            </div>
          </div>

          {/* TODAY'S DELIVERIES - Blinking Section */}
          {allTodaysDeliveries.length > 0 && (
            <div className="glass rounded-lg border border-green-500/50 overflow-hidden">
              <TodaysDeliveriesWidget 
                inwardDeliveries={todaysInwardDeliveries}
                outwardDeliveries={todaysOutwardDeliveries}
                onStatusUpdate={handleStatusUpdate}
              />
            </div>
          )}

          {/* ALL TRANSPORTS SECTION - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: All Inward Transports */}
            <div className="glass rounded-lg border border-border">
              <InwardTransportTable 
                transports={inwardTransports}
                onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'inward')}
              />
            </div>

            {/* Right: All Outward Transports */}
            <div className="glass rounded-lg border border-border">
              <OutwardAllTable 
                local={outwardLocal}
                container={outwardContainer}
                onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'outward')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== INWARD SCHEDULED BOOKINGS TABLE ====================
const InwardScheduledTable = ({ transports, onStatusUpdate }) => {
  const statusColors = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    SCHEDULED: 'bg-blue-500/20 text-blue-400',
    IN_TRANSIT: 'bg-cyan-500/20 text-cyan-400',
    ARRIVED: 'bg-green-500/20 text-green-400',
    COMPLETED: 'bg-emerald-500/20 text-emerald-400'
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ArrowDownToLine className="w-5 h-5 text-blue-400" />
          Inward Bookings / Scheduled
        </h2>
        <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">
          {transports.length} Scheduled
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Reference</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">ETA</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transports.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No scheduled inward bookings</p>
                </td>
              </tr>
            ) : (
              transports.map(transport => (
                <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-medium font-mono">{transport.transport_number}</td>
                  <td className="p-3 text-blue-400">{transport.po_number}</td>
                  <td className="p-3">{transport.supplier_name}</td>
                  <td className="p-3">{transport.eta ? new Date(transport.eta).toLocaleDateString() : '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[transport.status]}`}>
                      {transport.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
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
const OutwardScheduledTable = ({ transports, onStatusUpdate }) => {
  const statusColors = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    LOADING: 'bg-amber-500/20 text-amber-400',
    DISPATCHED: 'bg-blue-500/20 text-blue-400',
    DELIVERED: 'bg-green-500/20 text-green-400'
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ArrowUpFromLine className="w-5 h-5 text-amber-400" />
          Outward Bookings / Scheduled
        </h2>
        <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400">
          {transports.length} Scheduled
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">DO / Job</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Dispatch Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transports.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No scheduled outward bookings</p>
                </td>
              </tr>
            ) : (
              transports.map(transport => (
                <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-medium font-mono">{transport.transport_number}</td>
                  <td className="p-3 text-amber-400">{transport.do_number || transport.job_number}</td>
                  <td className="p-3">{transport.customer_name}</td>
                  <td className="p-3">
                    {transport.transport_type === 'CONTAINER' ? (
                      <Container className="w-4 h-4 text-purple-400 inline" />
                    ) : (
                      <Truck className="w-4 h-4 text-amber-400 inline" />
                    )}
                    <span className="ml-2 text-xs">{transport.transport_type}</span>
                  </td>
                  <td className="p-3">{transport.dispatch_date ? new Date(transport.dispatch_date).toLocaleDateString() : '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[transport.status]}`}>
                      {transport.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'LOADING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')} className="bg-blue-500 hover:bg-blue-600">
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

// ==================== TODAY'S DELIVERIES WIDGET (BLINKING) ====================
const TodaysDeliveriesWidget = ({ inwardDeliveries, outwardDeliveries, onStatusUpdate }) => {
  const allDeliveries = [...inwardDeliveries, ...outwardDeliveries];

  const statusColors = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    SCHEDULED: 'bg-blue-500/20 text-blue-400',
    LOADING: 'bg-amber-500/20 text-amber-400',
    IN_TRANSIT: 'bg-cyan-500/20 text-cyan-400',
    DISPATCHED: 'bg-blue-500/20 text-blue-400',
    ARRIVED: 'bg-green-500/20 text-green-400',
    DELIVERED: 'bg-green-500/20 text-green-400',
    COMPLETED: 'bg-emerald-500/20 text-emerald-400'
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-green-400">
          <Clock className="w-5 h-5" />
          Today's Deliveries
          <span className="ml-2 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 animate-pulse">
            {allDeliveries.length} Deliveries
          </span>
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer / Supplier</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Time</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allDeliveries.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <Check className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No deliveries scheduled for today</p>
                </td>
              </tr>
            ) : (
              allDeliveries.map(transport => (
                <tr 
                  key={transport.id} 
                  className="border-t border-border/50 today-delivery-row hover:bg-muted/10"
                >
                  <td className="p-3">
                    {transport.po_number ? (
                      <ArrowDownToLine className="w-4 h-4 text-blue-400" title="Inward" />
                    ) : (
                      <ArrowUpFromLine className="w-4 h-4 text-amber-400" title="Outward" />
                    )}
                  </td>
                  <td className="p-3 font-medium font-mono">{transport.transport_number}</td>
                  <td className="p-3">
                    {transport.po_number ? (
                      <span className="text-blue-400">{transport.po_number}</span>
                    ) : (
                      <span className="text-amber-400">{transport.do_number || transport.job_number}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {transport.supplier_name || transport.customer_name}
                  </td>
                  <td className="p-3">
                    {(transport.dispatch_date || transport.eta) ? 
                      new Date(transport.dispatch_date || transport.eta).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
                      : '-'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[transport.status]}`}>
                      {transport.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'SCHEDULED' && transport.po_number && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT', 'inward')}>
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'LOADING' && !transport.po_number && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED', 'outward')} className="bg-blue-500 hover:bg-blue-600">
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'IN_TRANSIT' && transport.po_number && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'ARRIVED', 'inward')} className="bg-green-500 hover:bg-green-600">
                          Arrived
                        </Button>
                      )}
                      {transport.status === 'DISPATCHED' && !transport.po_number && (
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

// ==================== ALL INWARD TRANSPORTS TABLE ====================
const InwardTransportTable = ({ transports, onStatusUpdate }) => {
  const [filter, setFilter] = useState('all');
  
  const filtered = filter === 'all' 
    ? transports 
    : transports.filter(t => t.status === filter);

  const statusColors = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    SCHEDULED: 'bg-blue-500/20 text-blue-400',
    IN_TRANSIT: 'bg-cyan-500/20 text-cyan-400',
    ARRIVED: 'bg-green-500/20 text-green-400',
    COMPLETED: 'bg-emerald-500/20 text-emerald-400'
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">All Inward Transport (EXW / Post-Import)</h2>
        <div className="flex gap-2">
          {['all', 'PENDING', 'SCHEDULED', 'IN_TRANSIT', 'ARRIVED'].map(status => (
            <Button
              key={status}
              size="sm"
              variant={filter === status ? 'default' : 'outline'}
              onClick={() => setFilter(status)}
            >
              {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-muted/30 sticky top-0">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Reference</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Source</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">ETA</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-muted-foreground">
                  <ArrowDownToLine className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No inward transports</p>
                </td>
              </tr>
            ) : (
              filtered.map(transport => (
                <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-medium font-mono">{transport.transport_number}</td>
                  <td className="p-3 text-blue-400">{transport.po_number}</td>
                  <td className="p-3">{transport.supplier_name}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">
                      {transport.incoterm}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      transport.source === 'IMPORT' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {transport.source}
                    </span>
                  </td>
                  <td className="p-3">{transport.vehicle_number || '-'}</td>
                  <td className="p-3">{transport.eta ? new Date(transport.eta).toLocaleDateString() : '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[transport.status]}`}>
                      {transport.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'SCHEDULED')}>
                          Schedule
                        </Button>
                      )}
                      {transport.status === 'SCHEDULED' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT')}>
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'IN_TRANSIT' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'ARRIVED')} className="bg-green-500 hover:bg-green-600">
                          Arrived
                        </Button>
                      )}
                      {transport.status === 'ARRIVED' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'COMPLETED')} className="bg-emerald-500 hover:bg-emerald-600">
                          Complete
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

// ==================== ALL OUTWARD TRANSPORTS TABLE ====================
const OutwardAllTable = ({ local, container, onStatusUpdate }) => {
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'LOCAL', 'CONTAINER'
  
  const allOutward = useMemo(() => {
    let filtered = typeFilter === 'all' 
      ? [...local, ...container]
      : typeFilter === 'LOCAL' 
        ? local 
        : container;
    
    if (filter !== 'all') {
      filtered = filtered.filter(t => t.status === filter);
    }
    
    return filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [local, container, filter, typeFilter]);

  const statusColors = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    LOADING: 'bg-amber-500/20 text-amber-400',
    DISPATCHED: 'bg-blue-500/20 text-blue-400',
    DELIVERED: 'bg-green-500/20 text-green-400'
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">All Outward Transport</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1">
            {['all', 'LOCAL', 'CONTAINER'].map(type => (
              <Button
                key={type}
                size="sm"
                variant={typeFilter === type ? 'default' : 'outline'}
                onClick={() => setTypeFilter(type)}
              >
                {type}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {['all', 'PENDING', 'LOADING', 'DISPATCHED', 'DELIVERED'].map(status => (
              <Button
                key={status}
                size="sm"
                variant={filter === status ? 'default' : 'outline'}
                onClick={() => setFilter(status)}
              >
                {status === 'all' ? 'All' : status}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-muted/30 sticky top-0">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">DO / Job</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Destination</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Dispatch Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allOutward.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No outward transports</p>
                </td>
              </tr>
            ) : (
              allOutward.map(transport => (
                <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-medium font-mono">{transport.transport_number}</td>
                  <td className="p-3 text-amber-400">{transport.do_number || transport.job_number}</td>
                  <td className="p-3">{transport.customer_name}</td>
                  <td className="p-3">
                    {transport.transport_type === 'CONTAINER' ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 flex items-center gap-1 w-fit">
                        <Container className="w-3 h-3" />
                        CONTAINER
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400 flex items-center gap-1 w-fit">
                        <Truck className="w-3 h-3" />
                        LOCAL
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono">{transport.container_number || '-'}</td>
                  <td className="p-3">{transport.vehicle_number || '-'}</td>
                  <td className="p-3 text-sm">{transport.destination || '-'}</td>
                  <td className="p-3">{transport.dispatch_date ? new Date(transport.dispatch_date).toLocaleDateString() : '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[transport.status]}`}>
                      {transport.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'LOADING')}>
                          Start Loading
                        </Button>
                      )}
                      {transport.status === 'LOADING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')} className="bg-blue-500 hover:bg-blue-600">
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'DISPATCHED' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DELIVERED')} className="bg-green-500 hover:bg-green-600">
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
