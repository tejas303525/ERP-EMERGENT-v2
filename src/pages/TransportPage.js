import React, { useState, useEffect } from 'react';
import { transportAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { formatDate, getStatusColor } from '../lib/utils';
import { Truck, Edit2, Calendar, Ship, Package, AlertCircle } from 'lucide-react';

const STATUSES = ['pending', 'assigned', 'dispatched', 'at_factory', 'loaded', 'delivered_to_port'];

export default function TransportPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const [editForm, setEditForm] = useState({
    transporter: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    status: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await transportAPI.getAll();
      setSchedules(res.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    try {
      const updateData = {};
      if (editForm.transporter) updateData.transporter = editForm.transporter;
      if (editForm.status) updateData.status = editForm.status;
      if (editForm.vehicle_number) updateData.vehicle_number = editForm.vehicle_number;
      if (editForm.driver_name) updateData.driver_name = editForm.driver_name;
      if (editForm.driver_phone) updateData.driver_phone = editForm.driver_phone;
      
      await transportAPI.update(selectedSchedule.id, updateData);
      toast.success('Schedule updated');
      setEditOpen(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update');
    }
  };

  const openEdit = (schedule) => {
    setSelectedSchedule(schedule);
    setEditForm({
      transporter: schedule.transporter || '',
      vehicle_number: schedule.vehicle_number || '',
      driver_name: schedule.driver_name || '',
      driver_phone: schedule.driver_phone || '',
      status: schedule.status,
    });
    setEditOpen(true);
  };

  const filteredSchedules = statusFilter === 'all' ? schedules : schedules.filter(s => s.status === statusFilter);
  const pendingAssignment = schedules.filter(s => s.status === 'pending' && !s.transporter).length;
  const canEdit = ['admin', 'transport'].includes(user?.role);

  // Group by pickup date
  const groupedByDate = filteredSchedules.reduce((acc, schedule) => {
    const date = schedule.pickup_date || 'No Date';
    if (!acc[date]) acc[date] = [];
    acc[date].push(schedule);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="page-container" data-testid="transport-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Transport - Container Pickup</h1>
          <p className="text-muted-foreground text-sm">Manage container pickup schedules based on CRO cutoffs</p>
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
        </div>
      </div>

      {/* Alert for pending assignment */}
      {pendingAssignment > 0 && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              <div>
                <p className="font-medium text-amber-400">{pendingAssignment} schedule(s) need transporter assignment</p>
                <p className="text-sm text-muted-foreground">Assign transporters and vehicle details for pending pickups</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedules grouped by date */}
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      ) : filteredSchedules.length === 0 ? (
        <div className="empty-state">
          <Truck className="empty-state-icon" />
          <p className="empty-state-title">No transport schedules</p>
          <p className="empty-state-description">Schedules are auto-generated when CRO details are entered in Shipping</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(date => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-lg">
                  {date === 'No Date' ? 'Unscheduled' : formatDate(date)}
                </h3>
                <Badge variant="outline" className="ml-2">
                  {groupedByDate[date].length} pickup(s)
                </Badge>
              </div>

              <div className="grid gap-4">
                {groupedByDate[date].map(schedule => (
                  <Card key={schedule.id} className="card-hover" data-testid={`schedule-card-${schedule.schedule_number}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="font-mono font-medium text-lg">{schedule.schedule_number}</span>
                            <Badge className={getStatusColor(schedule.status)}>{schedule.status?.replace(/_/g, ' ')}</Badge>
                            {schedule.auto_generated && (
                              <Badge variant="outline" className="text-xs">Auto-Generated</Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs uppercase mb-1">Booking</p>
                              <p className="font-mono">{schedule.booking_number}</p>
                              {schedule.cro_number && (
                                <p className="text-xs text-emerald-400">CRO: {schedule.cro_number}</p>
                              )}
                            </div>

                            <div>
                              <p className="text-muted-foreground text-xs uppercase mb-1">Vessel</p>
                              <p>{schedule.vessel_name || '-'}</p>
                              <p className="text-xs text-muted-foreground">{schedule.vessel_date ? formatDate(schedule.vessel_date) : ''}</p>
                            </div>

                            <div>
                              <p className="text-muted-foreground text-xs uppercase mb-1">Container</p>
                              <p>{schedule.container_count}x {schedule.container_type?.toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">{schedule.port_of_loading}</p>
                            </div>

                            <div>
                              <p className="text-muted-foreground text-xs uppercase mb-1">Cutoff</p>
                              <p className="text-red-400">{schedule.cutoff_date ? formatDate(schedule.cutoff_date) : '-'}</p>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="w-4 h-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Job Orders:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {schedule.job_numbers?.map((job, idx) => (
                                <Badge key={job} variant="outline" className="text-xs">
                                  {job} - {schedule.product_names?.[idx]}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {schedule.transporter && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase mb-1">Transporter</p>
                                  <p>{schedule.transporter}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase mb-1">Vehicle</p>
                                  <p className="font-mono">{schedule.vehicle_number || '-'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase mb-1">Driver</p>
                                  <p>{schedule.driver_name || '-'}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs uppercase mb-1">Phone</p>
                                  <p>{schedule.driver_phone || '-'}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(schedule)}
                            data-testid={`edit-schedule-${schedule.schedule_number}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Transport - {selectedSchedule?.schedule_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Card className="bg-muted/30">
              <CardContent className="py-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Booking:</span> {selectedSchedule?.booking_number}</div>
                  <div><span className="text-muted-foreground">CRO:</span> {selectedSchedule?.cro_number}</div>
                  <div><span className="text-muted-foreground">Pickup:</span> {selectedSchedule?.pickup_date ? formatDate(selectedSchedule.pickup_date) : '-'}</div>
                  <div><span className="text-muted-foreground">Cutoff:</span> <span className="text-red-400">{selectedSchedule?.cutoff_date ? formatDate(selectedSchedule.cutoff_date) : '-'}</span></div>
                </div>
              </CardContent>
            </Card>

            <div className="form-field">
              <Label>Transporter / Company</Label>
              <Input
                value={editForm.transporter}
                onChange={(e) => setEditForm({...editForm, transporter: e.target.value})}
                placeholder="Transport company name"
                data-testid="transporter-input"
              />
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Vehicle Number</Label>
                <Input
                  value={editForm.vehicle_number}
                  onChange={(e) => setEditForm({...editForm, vehicle_number: e.target.value})}
                  placeholder="Plate number"
                />
              </div>
              <div className="form-field">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({...editForm, status: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <Label>Driver Name</Label>
                <Input
                  value={editForm.driver_name}
                  onChange={(e) => setEditForm({...editForm, driver_name: e.target.value})}
                  placeholder="Driver name"
                />
              </div>
              <div className="form-field">
                <Label>Driver Phone</Label>
                <Input
                  value={editForm.driver_phone}
                  onChange={(e) => setEditForm({...editForm, driver_phone: e.target.value})}
                  placeholder="Phone number"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEdit} data-testid="update-schedule-btn">Update Schedule</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
