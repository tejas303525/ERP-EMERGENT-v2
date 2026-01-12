import React, { useState, useEffect } from 'react';
import { shippingAPI, jobOrderAPI } from '../lib/api';
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
import { formatDate, getStatusColor } from '../lib/utils';
import { Plus, Ship, Edit2, FileText, AlertTriangle } from 'lucide-react';

const CONTAINER_TYPES = ['20ft', '40ft', '40ft_hc'];
const STATUSES = ['pending', 'cro_received', 'transport_scheduled', 'loaded', 'shipped'];

export default function ShippingPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [croOpen, setCroOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
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
    pull_out_date: '',
    si_cutoff: '',
    gate_in_date: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [bookingsRes, jobsRes] = await Promise.all([
        shippingAPI.getAll(),
        jobOrderAPI.getAll('ready_for_dispatch'),
      ]);
      setBookings(bookingsRes.data);
      setJobs(jobsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
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
    if (form.job_order_ids.length === 0 || !form.shipping_line) {
      toast.error('Please select job orders and shipping line');
      return;
    }
    try {
      await shippingAPI.create(form);
      toast.success('Booking created. Now get CRO from shipping line.');
      setCreateOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create booking');
    }
  };

  const handleCROUpdate = async () => {
    if (!croForm.cro_number || !croForm.cutoff_date || !croForm.vessel_date) {
      toast.error('Please fill CRO number, cutoff date, and vessel date');
      return;
    }
    try {
      await shippingAPI.updateCRO(selectedBooking.id, croForm);
      toast.success('CRO details saved. Transport schedule auto-generated!');
      setCroOpen(false);
      loadData();
    } catch (error) {
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
      pull_out_date: booking.pull_out_date || '',
      si_cutoff: booking.si_cutoff || '',
      gate_in_date: booking.gate_in_date || '',
    });
    setCroOpen(true);
  };

  const resetForm = () => {
    setForm({
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
    });
  };

  const filteredBookings = statusFilter === 'all' ? bookings : bookings.filter(b => b.status === statusFilter);
  const pendingCRO = bookings.filter(b => b.status === 'pending').length;
  const canCreate = ['admin', 'shipping'].includes(user?.role);

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
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-booking-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New Booking
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Container Booking Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* Job Orders Selection */}
                  <div>
                    <Label className="mb-2 block">Select Job Orders (Ready for Dispatch)</Label>
                    <div className="border border-border rounded-sm max-h-48 overflow-y-auto">
                      {jobs.length > 0 ? jobs.map(job => (
                        <div key={job.id} className="flex items-center gap-3 p-3 border-b border-border last:border-0 hover:bg-muted/30">
                          <Checkbox
                            checked={form.job_order_ids.includes(job.id)}
                            onCheckedChange={() => toggleJobSelection(job.id)}
                          />
                          <div className="flex-1">
                            <p className="font-mono text-sm">{job.job_number}</p>
                            <p className="text-xs text-muted-foreground">{job.product_name} - Qty: {job.quantity}</p>
                          </div>
                        </div>
                      )) : (
                        <p className="p-4 text-center text-muted-foreground text-sm">No jobs ready for dispatch</p>
                      )}
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Shipping Line *</Label>
                      <Input
                        value={form.shipping_line}
                        onChange={(e) => setForm({...form, shipping_line: e.target.value})}
                        placeholder="e.g., MSC, Maersk, Hapag"
                        data-testid="shipping-line-input"
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
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} data-testid="submit-booking-btn">Create Booking Request</Button>
                  </div>
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

      {/* Bookings List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Container Bookings ({filteredBookings.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredBookings.length === 0 ? (
          <div className="empty-state">
            <Ship className="empty-state-icon" />
            <p className="empty-state-title">No bookings found</p>
            <p className="empty-state-description">Create a booking for export orders</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Booking #</th>
                <th>Shipping Line</th>
                <th>Container</th>
                <th>Route</th>
                <th>CRO #</th>
                <th>Vessel</th>
                <th>Cutoff</th>
                <th>Pickup</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((booking) => (
                <tr key={booking.id} data-testid={`booking-row-${booking.booking_number}`}>
                  <td className="font-medium">{booking.booking_number}</td>
                  <td>{booking.shipping_line}</td>
                  <td>{booking.container_count}x {booking.container_type?.toUpperCase()}</td>
                  <td className="text-xs">{booking.port_of_loading} → {booking.port_of_discharge}</td>
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
                  <td>{booking.cutoff_date ? formatDate(booking.cutoff_date) : '-'}</td>
                  <td className="text-sky-400">{booking.pickup_date ? formatDate(booking.pickup_date) : '-'}</td>
                  <td><Badge className={getStatusColor(booking.status)}>{booking.status?.replace(/_/g, ' ')}</Badge></td>
                  <td>
                    {canCreate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openCRODialog(booking)}
                        title="Enter/Edit CRO Details"
                        data-testid={`cro-booking-${booking.booking_number}`}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CRO Dialog */}
      <Dialog open={croOpen} onOpenChange={setCroOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CRO Details - {selectedBooking?.booking_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCroOpen(false)}>Cancel</Button>
              <Button onClick={handleCROUpdate} data-testid="save-cro-btn">Save CRO & Generate Schedule</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
