import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Truck, ArrowDownToLine, ArrowUpFromLine, Package, Check, Clock, 
  AlertTriangle, Plus, Calendar, MapPin, Ship, Container
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const TransportWindowPage = () => {
  const [activeTab, setActiveTab] = useState('inward');
  const [inwardTransports, setInwardTransports] = useState([]);
  const [outwardLocal, setOutwardLocal] = useState([]);
  const [outwardContainer, setOutwardContainer] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
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

  // Stats
  const inwardPending = inwardTransports.filter(t => t.status === 'PENDING').length;
  const inwardInTransit = inwardTransports.filter(t => t.status === 'IN_TRANSIT').length;
  const localPending = outwardLocal.filter(t => t.status === 'PENDING').length;
  const containerPending = outwardContainer.filter(t => t.status === 'PENDING').length;

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="transport-window-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="w-8 h-8 text-blue-500" />
          Transport Window
        </h1>
        <p className="text-muted-foreground mt-1">Inward & Outward Transport Management (4 Tables)</p>
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
          <p className="text-sm text-muted-foreground">Total Active</p>
          <p className="text-2xl font-bold text-green-400">
            {inwardTransports.length + outwardLocal.length + outwardContainer.length}
          </p>
        </div>
      </div>

      {/* 4 Tabs for 4 Tables */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'inward' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward')}
          data-testid="tab-inward"
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Inward (EXW/Import)
          {inwardPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">{inwardPending}</span>
          )}
        </Button>
        <Button
          variant={activeTab === 'local' ? 'default' : 'outline'}
          onClick={() => setActiveTab('local')}
          data-testid="tab-local"
        >
          <Truck className="w-4 h-4 mr-2" />
          Outward - Local
          {localPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">{localPending}</span>
          )}
        </Button>
        <Button
          variant={activeTab === 'container' ? 'default' : 'outline'}
          onClick={() => setActiveTab('container')}
          data-testid="tab-container"
        >
          <Container className="w-4 h-4 mr-2" />
          Outward - Container
          {containerPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">{containerPending}</span>
          )}
        </Button>
        <Button
          variant={activeTab === 'dispatch' ? 'default' : 'outline'}
          onClick={() => setActiveTab('dispatch')}
          data-testid="tab-dispatch"
        >
          <ArrowUpFromLine className="w-4 h-4 mr-2" />
          Dispatch Summary
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <>
          {/* Table 1: Inward Transport */}
          {activeTab === 'inward' && (
            <InwardTransportTable 
              transports={inwardTransports}
              onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'inward')}
            />
          )}

          {/* Table 2: Outward - Local */}
          {activeTab === 'local' && (
            <OutwardTransportTable 
              transports={outwardLocal}
              title="Local Delivery Transport"
              onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'outward')}
            />
          )}

          {/* Table 3: Outward - Container */}
          {activeTab === 'container' && (
            <OutwardTransportTable 
              transports={outwardContainer}
              title="Container Shipping Transport"
              isContainer={true}
              onStatusUpdate={(id, status) => handleStatusUpdate(id, status, 'outward')}
            />
          )}

          {/* Table 4: Dispatch Summary */}
          {activeTab === 'dispatch' && (
            <DispatchSummary 
              local={outwardLocal}
              container={outwardContainer}
            />
          )}
        </>
      )}
    </div>
  );
};

// Table 1: Inward Transport
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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Inward Transport (EXW / Post-Import)</h2>
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

      <div className="glass rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
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

// Table 2 & 3: Outward Transport (Local / Container)
const OutwardTransportTable = ({ transports, title, isContainer = false, onStatusUpdate }) => {
  const [filter, setFilter] = useState('all');
  
  const filtered = filter === 'all' 
    ? transports 
    : transports.filter(t => t.status === filter);

  const statusColors = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    LOADING: 'bg-amber-500/20 text-amber-400',
    DISPATCHED: 'bg-blue-500/20 text-blue-400',
    DELIVERED: 'bg-green-500/20 text-green-400'
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex gap-2">
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

      <div className="glass rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">DO / Job</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
              {isContainer && (
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container #</th>
              )}
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Destination</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Dispatch Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isContainer ? 10 : 9} className="p-8 text-center text-muted-foreground">
                  {isContainer ? (
                    <Container className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  ) : (
                    <Truck className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  )}
                  <p>No {isContainer ? 'container' : 'local'} transports</p>
                </td>
              </tr>
            ) : (
              filtered.map(transport => (
                <tr key={transport.id} className="border-t border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-medium font-mono">{transport.transport_number}</td>
                  <td className="p-3 text-amber-400">{transport.do_number || transport.job_number}</td>
                  <td className="p-3">{transport.customer_name}</td>
                  {isContainer && (
                    <td className="p-3 font-mono">{transport.container_number || '-'}</td>
                  )}
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

// Table 4: Dispatch Summary
const DispatchSummary = ({ local, container }) => {
  const allOutward = [...local, ...container].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  const todayDispatched = allOutward.filter(t => {
    if (!t.dispatch_date) return false;
    const today = new Date().toISOString().split('T')[0];
    return t.dispatch_date.startsWith(today);
  });

  const pending = allOutward.filter(t => t.status === 'PENDING' || t.status === 'LOADING');
  const delivered = allOutward.filter(t => t.status === 'DELIVERED');

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Dispatch Summary</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Today's Dispatches</p>
          <p className="text-2xl font-bold text-blue-400">{todayDispatched.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Pending Dispatch</p>
          <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Local Orders</p>
          <p className="text-2xl font-bold text-purple-400">{local.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Container Shipments</p>
          <p className="text-2xl font-bold text-cyan-400">{container.length}</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Recent Dispatch Activity</h3>
        </div>
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
          {allOutward.slice(0, 20).map(transport => (
            <div key={transport.id} className="flex items-center justify-between p-3 rounded bg-muted/10">
              <div className="flex items-center gap-3">
                {transport.transport_type === 'CONTAINER' ? (
                  <Container className="w-5 h-5 text-purple-400" />
                ) : (
                  <Truck className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <div className="font-medium">{transport.transport_number}</div>
                  <div className="text-sm text-muted-foreground">{transport.customer_name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`px-2 py-0.5 rounded text-xs ${
                  transport.status === 'DELIVERED' ? 'bg-green-500/20 text-green-400' :
                  transport.status === 'DISPATCHED' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {transport.status}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {transport.transport_type}
                </div>
              </div>
            </div>
          ))}
          {allOutward.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No dispatch activity
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransportWindowPage;
