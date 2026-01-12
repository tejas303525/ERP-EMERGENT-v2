import React, { useState, useEffect } from 'react';
import { dispatchAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { formatDate, getStatusColor } from '../lib/utils';
import { Truck, Package, Calendar, Clock, Play, CheckCircle, Loader2 } from 'lucide-react';

const STATUSES = ['scheduled', 'in_transit', 'arrived', 'loading', 'loaded', 'departed'];

export default function DispatchDashboard() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [allRes, todayRes, upcomingRes] = await Promise.all([
        dispatchAPI.getAll(),
        dispatchAPI.getToday(),
        dispatchAPI.getUpcoming(7),
      ]);
      setSchedules(allRes.data);
      setTodaySchedules(todayRes.data);
      setUpcomingSchedules(upcomingRes.data);
    } catch (error) {
      toast.error('Failed to load dispatch schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (scheduleId, newStatus) => {
    try {
      await dispatchAPI.updateStatus(scheduleId, newStatus);
      toast.success(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  const canUpdate = ['admin', 'security'].includes(user?.role);

  const getNextStatus = (currentStatus) => {
    const flow = {
      'scheduled': 'in_transit',
      'in_transit': 'arrived',
      'arrived': 'loading',
      'loading': 'loaded',
      'loaded': 'departed',
    };
    return flow[currentStatus] || null;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled': return <Calendar className="w-4 h-4" />;
      case 'in_transit': return <Truck className="w-4 h-4" />;
      case 'arrived': return <CheckCircle className="w-4 h-4" />;
      case 'loading': return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'loaded': return <Package className="w-4 h-4" />;
      case 'departed': return <Truck className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const DispatchCard = ({ schedule }) => {
    const nextStatus = getNextStatus(schedule.status);

    return (
      <Card className="card-hover" data-testid={`dispatch-card-${schedule.schedule_number}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{schedule.schedule_number}</span>
                <Badge className={getStatusColor(schedule.status)}>
                  {getStatusIcon(schedule.status)}
                  <span className="ml-1">{schedule.status?.replace(/_/g, ' ')}</span>
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Booking: {schedule.booking_number}</p>
            </div>
            
            {canUpdate && nextStatus && (
              <Button
                size="sm"
                onClick={() => handleStatusUpdate(schedule.id, nextStatus)}
                data-testid={`update-status-${schedule.schedule_number}`}
              >
                <Play className="w-3 h-3 mr-1" />
                {nextStatus.replace(/_/g, ' ')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
            <div>
              <p className="text-muted-foreground text-xs">Container</p>
              <p className="font-medium">{schedule.container_count}x {schedule.container_type?.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Pickup Date</p>
              <p className="font-medium text-sky-400">{formatDate(schedule.pickup_date)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cutoff</p>
              <p className="font-medium text-red-400">{formatDate(schedule.cutoff_date)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Vessel</p>
              <p className="font-medium">{formatDate(schedule.vessel_date)}</p>
            </div>
          </div>

          {/* Job Orders / Cargo */}
          <div className="bg-muted/30 rounded-sm p-3 mb-3">
            <p className="text-xs text-muted-foreground mb-2">CARGO TO LOAD:</p>
            <div className="space-y-1">
              {schedule.job_numbers?.map((job, idx) => (
                <div key={job} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{job}</span>
                  <span>{schedule.product_names?.[idx]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Transport Details */}
          {schedule.transporter && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-3 border-t border-border">
              <div>
                <p className="text-muted-foreground text-xs">Transporter</p>
                <p>{schedule.transporter}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Vehicle</p>
                <p className="font-mono">{schedule.vehicle_number || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Driver</p>
                <p>{schedule.driver_name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Phone</p>
                <p>{schedule.driver_phone || '-'}</p>
              </div>
            </div>
          )}

          {/* Loading times */}
          {(schedule.loading_start || schedule.loading_end) && (
            <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t border-border mt-3">
              {schedule.loading_start && (
                <div>
                  <p className="text-muted-foreground text-xs">Loading Started</p>
                  <p>{new Date(schedule.loading_start).toLocaleTimeString()}</p>
                </div>
              )}
              {schedule.loading_end && (
                <div>
                  <p className="text-muted-foreground text-xs">Loading Completed</p>
                  <p>{new Date(schedule.loading_end).toLocaleTimeString()}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Stats
  const todayCount = todaySchedules.length;
  const inTransit = schedules.filter(s => s.status === 'in_transit').length;
  const atFactory = schedules.filter(s => s.status === 'arrived' || s.status === 'loading').length;
  const loadedToday = schedules.filter(s => s.status === 'loaded').length;

  return (
    <div className="page-container" data-testid="dispatch-dashboard">
      <div className="module-header">
        <div>
          <h1 className="module-title">Dispatch - Security Gate</h1>
          <p className="text-muted-foreground text-sm">Track incoming containers and loading status</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-sky-500/10 border-sky-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-sky-400">{todayCount}</p>
                <p className="kpi-label">Today's Pickups</p>
              </div>
              <Calendar className="w-8 h-8 text-sky-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-amber-400">{inTransit}</p>
                <p className="kpi-label">In Transit</p>
              </div>
              <Truck className="w-8 h-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-500/10 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-purple-400">{atFactory}</p>
                <p className="kpi-label">At Factory</p>
              </div>
              <Package className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-500/10 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-emerald-400">{loadedToday}</p>
                <p className="kpi-label">Loaded</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="today" data-testid="tab-today">
            Today ({todaySchedules.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            Upcoming 7 Days ({upcomingSchedules.length})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All ({schedules.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : todaySchedules.length === 0 ? (
            <div className="empty-state">
              <Calendar className="empty-state-icon" />
              <p className="empty-state-title">No containers expected today</p>
              <p className="empty-state-description">Check upcoming schedule for future arrivals</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {todaySchedules.map(schedule => (
                <DispatchCard key={schedule.id} schedule={schedule} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upcoming">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : upcomingSchedules.length === 0 ? (
            <div className="empty-state">
              <Calendar className="empty-state-icon" />
              <p className="empty-state-title">No upcoming containers</p>
              <p className="empty-state-description">No pickups scheduled for next 7 days</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {upcomingSchedules.map(schedule => (
                <DispatchCard key={schedule.id} schedule={schedule} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : schedules.length === 0 ? (
            <div className="empty-state">
              <Truck className="empty-state-icon" />
              <p className="empty-state-title">No dispatch schedules</p>
              <p className="empty-state-description">Schedules appear when CRO details are entered</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {schedules.map(schedule => (
                <DispatchCard key={schedule.id} schedule={schedule} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
