import React, { useState, useEffect } from 'react';
import { dispatchAPI, jobOrderAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { formatDate, getStatusColor, hasPagePermission } from '../lib/utils';
import { Truck, Package, Calendar, Clock, Play, CheckCircle, Loader2, PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const STATUSES = ['scheduled', 'in_transit', 'arrived', 'loading', 'loaded', 'departed'];

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347', '#87ceeb'];

export default function DispatchDashboard() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [todaySchedules, setTodaySchedules] = useState([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today');
  const [pendingProducts, setPendingProducts] = useState([]);

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

      // Calculate pending products for pie chart
      await calculatePendingProducts(allRes.data);
    } catch (error) {
      toast.error('Failed to load dispatch schedules');
    } finally {
      setLoading(false);
    }
  };

  const calculatePendingProducts = async (schedules) => {
    try {
      // Get schedules that are not yet departed (pending dispatch)
      const pendingSchedules = schedules.filter(schedule =>
        schedule.status !== 'departed'
      );

      const productQuantities = {};

      // For each pending schedule, get job order details
      for (const schedule of pendingSchedules) {
        if (schedule.job_numbers && schedule.job_numbers.length > 0) {
          for (const jobNumber of schedule.job_numbers) {
            try {
              const jobRes = await jobOrderAPI.getOne(jobNumber);
              const job = jobRes.data;

              if (job.items && job.items.length > 0) {
                // Multiple products in job order
                job.items.forEach((item, index) => {
                  const productName = schedule.product_names?.[index] || item.product_name || 'Unknown Product';
                  const quantity = item.quantity || 0;

                  if (productQuantities[productName]) {
                    productQuantities[productName] += quantity;
                  } else {
                    productQuantities[productName] = quantity;
                  }
                });
              } else {
                // Single product in job order
                const productName = schedule.product_names?.[0] || job.product_name || 'Unknown Product';
                const quantity = job.quantity || 0;

                if (productQuantities[productName]) {
                  productQuantities[productName] += quantity;
                } else {
                  productQuantities[productName] = quantity;
                }
              }
            } catch (error) {
              console.error(`Failed to load job order ${jobNumber}:`, error);
            }
          }
        }
      }

      // Convert to chart data format
      const chartData = Object.entries(productQuantities)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
        .sort((a, b) => b.value - a.value); // Sort by quantity descending

      setPendingProducts(chartData);
    } catch (error) {
      console.error('Failed to calculate pending products:', error);
      toast.error('Failed to load pending products analytics');
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

  const canUpdate = hasPagePermission(user, '/dispatch-gate', ['admin', 'security']);

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

      {/* Pending Products Pie Chart */}
      {pendingProducts.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-blue-400" />
              Products Yet to be Dispatched
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pendingProducts}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pendingProducts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, 'Quantity']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-sm text-muted-foreground text-center">
              Total pending quantity: {pendingProducts.reduce((sum, item) => sum + item.value, 0).toFixed(2)} units
            </div>
          </CardContent>
        </Card>
      )}

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
