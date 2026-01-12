import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  Calendar, Package, AlertTriangle, Check, Clock, 
  ChevronLeft, ChevronRight, RefreshCw, Factory, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const DRUMS_PER_DAY = 600;
const JOB_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'bg-gray-500/20 text-gray-400' },
  { value: 'approved', label: 'Approved', color: 'bg-green-500/20 text-green-400' },
  { value: 'in_production', label: 'In Production', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'production_completed', label: 'Production Completed', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'rescheduled', label: 'Rescheduled', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'ready_for_dispatch', label: 'Ready for Dispatch', color: 'bg-purple-500/20 text-purple-400' },
];

const UnifiedProductionSchedulePage = () => {
  const [schedule, setSchedule] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [days, setDays] = useState(14);

  useEffect(() => {
    loadSchedule();
  }, [startDate, days]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const res = await api.get('/production/unified-schedule', {
        params: { start_date: startDate, days }
      });
      setSchedule(res.data.schedule || []);
      setSummary(res.data.summary || {});
    } catch (error) {
      toast.error('Failed to load production schedule');
      setSchedule([]);
    } finally {
      setLoading(false);
    }
  };

  const navigateWeek = (direction) => {
    const current = new Date(startDate);
    current.setDate(current.getDate() + (direction * 7));
    setStartDate(current.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setStartDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="unified-production-schedule-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Factory className="w-8 h-8 text-indigo-500" />
          Production Schedule
        </h1>
        <p className="text-muted-foreground mt-1">
          What needs to be produced • {DRUMS_PER_DAY} drums/day capacity
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-indigo-500/30">
          <p className="text-sm text-muted-foreground">Total Drums Scheduled</p>
          <p className="text-2xl font-bold text-indigo-400">{summary.total_drums_scheduled || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Jobs Scheduled</p>
          <p className="text-2xl font-bold text-blue-400">{summary.jobs_scheduled || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Unscheduled Jobs</p>
          <p className="text-2xl font-bold text-amber-400">{summary.unscheduled_jobs || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Days with Capacity</p>
          <p className="text-2xl font-bold text-green-400">{summary.days_with_capacity || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Avg Utilization</p>
          <p className="text-2xl font-bold text-cyan-400">{summary.average_utilization || 0}%</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateWeek(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground ml-2">
            Starting {new Date(startDate).toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-background border border-border rounded px-3 py-1.5 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
            <option value={30}>30 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={loadSchedule} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Schedule Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4">
          {schedule.map((day, idx) => (
            <DayCard 
              key={day.date} 
              day={day} 
              isToday={day.date === new Date().toISOString().split('T')[0]} 
              onStatusChange={loadSchedule}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Day Card Component
const DayCard = ({ day, isToday, onStatusChange, onReschedule }) => {
  const [expanded, setExpanded] = useState(isToday);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [newShift, setNewShift] = useState('Morning');
  
  const utilizationColor = day.utilization >= 90 
    ? 'text-red-400' 
    : day.utilization >= 70 
      ? 'text-amber-400' 
      : 'text-green-400';

  const hasShortages = day.jobs.some(j => !j.material_ready);

  const handleStatusChange = async (job, newStatus) => {
    if (newStatus === 'rescheduled') {
      setRescheduleModal(job);
      setNewDate('');
      setNewShift('Morning');
    } else {
      try {
        await api.put(`/job-orders/${job.job_id}/status?status=${newStatus}`);
        toast.success(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
        if (onStatusChange) onStatusChange();
      } catch (error) {
        toast.error('Failed to update status');
      }
    }
  };

  const handleRescheduleConfirm = async () => {
    if (!newDate) {
      toast.error('Please select a new date');
      return;
    }
    try {
      await api.put(`/job-orders/${rescheduleModal.job_id}/reschedule`, {
        new_date: newDate,
        new_shift: newShift
      });
      toast.success('Job rescheduled successfully');
      setRescheduleModal(null);
      if (onStatusChange) onStatusChange();
    } catch (error) {
      toast.error('Failed to reschedule job');
    }
  };

  return (
    <div className={`glass rounded-lg border ${
      isToday ? 'border-indigo-500/50 bg-indigo-500/5' : 
      day.is_full ? 'border-red-500/30' : 'border-border'
    }`}>
      {/* Day Header */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/10"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4">
          <div className="text-center min-w-[80px]">
            <div className="text-xs text-muted-foreground uppercase">{day.day_name}</div>
            <div className="text-lg font-bold">
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            {isToday && <span className="px-1.5 py-0.5 text-xs rounded bg-indigo-500/20 text-indigo-400">TODAY</span>}
          </div>
          
          {/* Progress Bar */}
          <div className="flex-1 max-w-[300px]">
            <div className="flex justify-between text-xs mb-1">
              <span>{day.drums_scheduled} / {day.drums_capacity} drums</span>
              <span className={utilizationColor}>{day.utilization}%</span>
            </div>
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  day.utilization >= 90 ? 'bg-red-500' : 
                  day.utilization >= 70 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(day.utilization, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status Indicators */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <Package className="w-4 h-4" />
              <span>{day.jobs.length} jobs</span>
            </div>
            {hasShortages && (
              <span className="flex items-center gap-1 text-sm text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                Material shortage
              </span>
            )}
            {day.is_full && (
              <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400">FULL</span>
            )}
          </div>
          
          <ChevronRight className={`w-5 h-5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {/* Expanded Jobs List */}
      {expanded && day.jobs.length > 0 && (
        <div className="border-t border-border/50 p-4">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-2">Job #</th>
                <th className="text-left py-2 px-2">Product</th>
                <th className="text-left py-2 px-2">Packaging</th>
                <th className="text-right py-2 px-2">Qty</th>
                <th className="text-left py-2 px-2">Delivery</th>
                <th className="text-left py-2 px-2">Material</th>
                <th className="text-left py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {day.jobs.map((job, idx) => (
                <tr key={idx} className="border-t border-border/30">
                  <td className="py-2 px-2 font-mono font-medium">{job.job_number}</td>
                  <td className="py-2 px-2">
                    <div>{job.product_name}</div>
                    <div className="text-xs text-muted-foreground">{job.product_sku}</div>
                  </td>
                  <td className="py-2 px-2">{job.packaging}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    {job.quantity}
                    {job.is_partial && (
                      <span className="text-xs text-muted-foreground ml-1">
                        /{job.total_quantity}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-sm">
                    {job.delivery_date ? new Date(job.delivery_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="py-2 px-2">
                    {job.material_ready ? (
                      <span className="flex items-center gap-1 text-green-400">
                        <Check className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="w-3 h-3" /> {job.shortage_items} short
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <select
                      className="bg-background border border-border rounded px-2 py-1 text-xs"
                      value={job.status}
                      onChange={(e) => handleStatusChange(job, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {JOB_STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <Dialog open={true} onOpenChange={() => setRescheduleModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reschedule Job {rescheduleModal.job_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>New Scheduled Date *</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label>Shift</Label>
                <select
                  className="w-full bg-background border border-border rounded px-3 py-2"
                  value={newShift}
                  onChange={(e) => setNewShift(e.target.value)}
                >
                  <option value="Morning">Morning (6AM-2PM)</option>
                  <option value="Evening">Evening (2PM-10PM)</option>
                  <option value="Night">Night (10PM-6AM)</option>
                </select>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Product: {rescheduleModal.product_name}</p>
                <p>Quantity: {rescheduleModal.quantity}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRescheduleModal(null)}>Cancel</Button>
              <Button onClick={handleRescheduleConfirm}>Confirm Reschedule</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {expanded && day.jobs.length === 0 && (
        <div className="border-t border-border/50 p-8 text-center text-muted-foreground">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No jobs scheduled</p>
          <p className="text-xs">{day.drums_remaining} drums capacity available</p>
        </div>
      )}
    </div>
  );
};

export default UnifiedProductionSchedulePage;
