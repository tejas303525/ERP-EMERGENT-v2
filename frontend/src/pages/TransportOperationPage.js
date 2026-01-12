import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Truck, Calendar, Clock, RefreshCw, MapPin, AlertTriangle,
  ChevronDown, ChevronRight, Package, Building, User
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const STATUSES = [
  { value: 'ON_THE_WAY', label: 'On the Way', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'SCHEDULED', label: 'Scheduled', color: 'bg-green-500/20 text-green-400' },
  { value: 'RESCHEDULED', label: 'Rescheduled', color: 'bg-amber-500/20 text-amber-400' }
];

const TransportOperationPage = () => {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [statusAction, setStatusAction] = useState('');
  const [expandedDates, setExpandedDates] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all transports (both inward and outward)
      const [inwardRes, outwardRes, jobsRes] = await Promise.all([
        api.get('/transport/inward'),
        api.get('/transport/outward'),
        api.get('/job-orders')
      ]);
      
      const inward = (inwardRes.data || []).map(t => ({
        ...t,
        type: 'INWARD',
        ref_type: 'PO',
        ref_number: t.po_number
      }));
      
      const outward = (outwardRes.data || []).map(t => ({
        ...t,
        type: 'OUTWARD',
        ref_type: 'JO',
        ref_number: t.job_numbers?.join(', ') || t.do_number
      }));
      
      // Combine and add job order details
      const combined = [...inward, ...outward];
      setTransports(combined);
      
      // Auto-expand today's date
      const today = new Date().toISOString().split('T')[0];
      setExpandedDates({ [today]: true });
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get week dates starting from today
  const weekDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  }, []);

  // Group transports by scheduled/rescheduled date
  const groupedTransports = useMemo(() => {
    const grouped = {};
    weekDates.forEach(date => {
      grouped[date] = [];
    });
    
    transports.forEach(transport => {
      const scheduleDate = transport.rescheduled_date || transport.scheduled_date || transport.created_at?.split('T')[0];
      if (scheduleDate && grouped[scheduleDate]) {
        grouped[scheduleDate].push(transport);
      } else if (scheduleDate) {
        // If date is outside week range, still add to first day as reference
        const dateObj = new Date(scheduleDate);
        const today = new Date();
        if (dateObj >= today) {
          grouped[weekDates[0]] = grouped[weekDates[0]] || [];
          grouped[weekDates[0]].push(transport);
        }
      }
    });
    
    return grouped;
  }, [transports, weekDates]);

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const openStatusModal = (transport, action) => {
    setSelectedTransport(transport);
    setStatusAction(action);
    setShowStatusModal(true);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="transport-operation-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="w-8 h-8 text-cyan-500" />
          Transportation Operation
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage transport schedules, ETAs, and rescheduling - 7 Day View
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">On the Way</p>
          <p className="text-2xl font-bold text-blue-400">
            {transports.filter(t => t.operation_status === 'ON_THE_WAY').length}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Scheduled</p>
          <p className="text-2xl font-bold text-green-400">
            {transports.filter(t => t.operation_status === 'SCHEDULED').length}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Rescheduled</p>
          <p className="text-2xl font-bold text-amber-400">
            {transports.filter(t => t.operation_status === 'RESCHEDULED').length}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Total Active</p>
          <p className="text-2xl font-bold text-purple-400">{transports.length}</p>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end mb-4">
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hierarchical Date-based View */}
          {weekDates.map((date) => {
            const dateTransports = groupedTransports[date] || [];
            const isExpanded = expandedDates[date];
            
            return (
              <div key={date} className="glass rounded-lg border border-border overflow-hidden">
                {/* Date Header */}
                <button
                  className="w-full p-4 flex items-center justify-between bg-muted/20 hover:bg-muted/30 transition-colors"
                  onClick={() => toggleDate(date)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                    <Calendar className="w-5 h-5 text-cyan-400" />
                    <span className="font-semibold text-lg">{formatDate(date)}</span>
                    <span className="text-muted-foreground">({date})</span>
                  </div>
                  <Badge className="bg-cyan-500/20 text-cyan-400">
                    {dateTransports.length} transports
                  </Badge>
                </button>

                {/* Transport List */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {dateTransports.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">
                        No transports scheduled for this date
                      </div>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-muted/10">
                          <tr>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">JO/PO</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Tanker/Trailer/Container</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transporter</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">ETA/Time</th>
                            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dateTransports.map((transport) => (
                            <TransportRow
                              key={transport.id}
                              transport={transport}
                              onStatusChange={openStatusModal}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && selectedTransport && (
        <StatusModal
          transport={selectedTransport}
          action={statusAction}
          onClose={() => {
            setShowStatusModal(false);
            setSelectedTransport(null);
          }}
          onSave={() => {
            setShowStatusModal(false);
            setSelectedTransport(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== TRANSPORT ROW ====================
const TransportRow = ({ transport, onStatusChange }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'ON_THE_WAY': return 'bg-blue-500/20 text-blue-400';
      case 'SCHEDULED': return 'bg-green-500/20 text-green-400';
      case 'RESCHEDULED': return 'bg-amber-500/20 text-amber-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const vehicleType = transport.container_number ? 'Container' : 
                      transport.vehicle_type || 'Tanker/Trailer';

  return (
    <tr className="border-b border-border/50 hover:bg-muted/5">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <Badge className={transport.type === 'INWARD' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}>
            {transport.ref_type}
          </Badge>
          <span className="font-mono font-medium">{transport.ref_number || transport.transport_number}</span>
        </div>
      </td>
      <td className="p-3">{transport.quantity || '-'}</td>
      <td className="p-3">{transport.product_name || '-'}</td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span>{vehicleType}</span>
          {transport.container_number && (
            <span className="font-mono text-sm text-muted-foreground">
              ({transport.container_number})
            </span>
          )}
        </div>
      </td>
      <td className="p-3">{transport.transporter_name || transport.supplier_name || '-'}</td>
      <td className="p-3">
        <Badge className={getStatusColor(transport.operation_status)}>
          {transport.operation_status || 'PENDING'}
        </Badge>
      </td>
      <td className="p-3">
        {transport.eta && (
          <span className="text-cyan-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {transport.eta}
          </span>
        )}
        {transport.scheduled_time && !transport.eta && (
          <span className="text-green-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {transport.scheduled_time}
          </span>
        )}
      </td>
      <td className="p-3">
        <Select onValueChange={(v) => onStatusChange(transport, v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Update Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
};

// ==================== STATUS MODAL ====================
const StatusModal = ({ transport, action, onClose, onSave }) => {
  const [form, setForm] = useState({
    eta: '',
    scheduled_time: '',
    new_transporter: '',
    new_delivery_date: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const endpoint = transport.type === 'INWARD' 
        ? `/transport/inward/${transport.id}/operation-status`
        : `/transport/outward/${transport.id}/operation-status`;
      
      await api.put(endpoint, null, {
        params: {
          status: action,
          eta: form.eta || null,
          scheduled_time: form.scheduled_time || null,
          new_transporter: form.new_transporter || null,
          new_delivery_date: form.new_delivery_date || null,
          notes: form.notes || null
        }
      });
      
      toast.success(`Status updated to ${action.replace('_', ' ')}`);
      onSave();
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const getTitle = () => {
    switch (action) {
      case 'ON_THE_WAY': return 'Mark as On the Way';
      case 'SCHEDULED': return 'Schedule Transport';
      case 'RESCHEDULED': return 'Reschedule Transport';
      default: return 'Update Status';
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-cyan-500" />
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transport Info */}
          <div className="p-3 rounded bg-muted/20 text-sm">
            <p><strong>Transport:</strong> {transport.transport_number}</p>
            <p><strong>Reference:</strong> {transport.ref_number || '-'}</p>
          </div>

          {/* On the Way - ETA */}
          {action === 'ON_THE_WAY' && (
            <div>
              <Label>Expected Time of Arrival (ETA)</Label>
              <Input
                type="datetime-local"
                value={form.eta}
                onChange={(e) => setForm({...form, eta: e.target.value})}
              />
            </div>
          )}

          {/* Scheduled - Time */}
          {action === 'SCHEDULED' && (
            <div>
              <Label>Scheduled Time</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_time}
                onChange={(e) => setForm({...form, scheduled_time: e.target.value})}
              />
            </div>
          )}

          {/* Rescheduled - New Transporter & Date */}
          {action === 'RESCHEDULED' && (
            <>
              <div>
                <Label>New Transporter</Label>
                <Input
                  value={form.new_transporter}
                  onChange={(e) => setForm({...form, new_transporter: e.target.value})}
                  placeholder="Enter new transporter name"
                />
              </div>
              <div>
                <Label>New Delivery Date</Label>
                <Input
                  type="datetime-local"
                  value={form.new_delivery_date}
                  onChange={(e) => setForm({...form, new_delivery_date: e.target.value})}
                />
              </div>
            </>
          )}

          <div>
            <Label>Notes (Optional)</Label>
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
            {saving ? 'Saving...' : 'Update Status'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransportOperationPage;
