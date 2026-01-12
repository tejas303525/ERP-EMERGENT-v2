import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { 
  Calendar, Package, Truck, ArrowDownToLine, ArrowUpFromLine,
  ChevronDown, ChevronRight, Container, RefreshCw, Clock, Bell, X, Search
} from 'lucide-react';
import api from '../lib/api';

export default function LoadingUnloadingWindow() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadingOps, setLoadingOps] = useState([]);
  const [loadingAwaiting, setLoadingAwaiting] = useState([]);
  const [unloadingOps, setUnloadingOps] = useState([]);
  const [unloadingAwaiting, setUnloadingAwaiting] = useState([]);
  const [expandedDates, setExpandedDates] = useState({});
  const [activeTab, setActiveTab] = useState('loading');
  const [dismissedNotifications, setDismissedNotifications] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get dispatch schedules for container loading (has pickup_date)
      const dispatchRes = await api.get('/dispatch-schedules').catch(() => ({ data: [] }));
      
      // Get outward transports for local loading
      const outwardRes = await api.get('/transport/outward').catch(() => ({ data: [] }));
      const outwardLocal = (outwardRes.data || []).filter(t => 
        t.transport_type === 'LOCAL' && 
        ['PENDING', 'LOADING'].includes(t.status)
      );

      // Get job orders ready for loading (local customers without shipping bookings)
      const loadingReadyJobs = await api.get('/loading-unloading/loading-ready').catch(() => ({ data: [] }));

      // Separate booked items (with confirmed dates) from awaiting items
      const loading = [
        ...(dispatchRes.data || []).map(d => {
          const createdDate = new Date(d.created_at);
          const now = new Date();
          const hoursSinceCreation = (now - createdDate) / (1000 * 60 * 60);
          const isRecentlyBooked = hoursSinceCreation <= 24;
          
          return {
            ...d,
            type: 'CONTAINER',
            operation_type: 'LOADING',
            schedule_date: d.pickup_date,
            transport_number: d.schedule_number,
            container_number: d.container_count ? `${d.container_count}x ${d.container_type}` : null,
            is_booked: true,
            is_recently_booked: isRecentlyBooked,
            arrival_date: d.pickup_date,
            // Transport booking details are already in dispatch schedule (transporter, vehicle_number, driver_name, driver_phone)
          };
        }),
        ...outwardLocal.map(t => {
          const createdDate = new Date(t.created_at);
          const now = new Date();
          const hoursSinceCreation = (now - createdDate) / (1000 * 60 * 60);
          const isRecentlyBooked = hoursSinceCreation <= 24 && t.status === 'PENDING';
          
          return {
            ...t,
            type: 'LOCAL',
            operation_type: 'LOADING',
            schedule_date: t.dispatch_date || t.created_at?.split('T')[0],
            transport_number: t.transport_number,
            container_number: null,
            is_booked: true,
            is_recently_booked: isRecentlyBooked,
            arrival_date: t.dispatch_date || t.created_at?.split('T')[0],
          };
        })
      ];

      // Separate awaiting items (no transport booked yet) - no schedule_date
      const loadingAwaiting = (loadingReadyJobs.data || []).map(job => ({
        ...job,
        type: 'LOCAL',
        operation_type: 'LOADING',
        schedule_date: null, // No date until transport is booked
        transport_number: job.job_number, // Use job number as identifier
        container_number: null,
        is_ready_job: true, // Flag to indicate this is a ready job, not yet booked
        estimated_date: job.delivery_date, // Show as estimated, not scheduled
      }));

      // Get inward transports for unloading
      const inwardRes = await api.get('/transport/inward').catch(() => ({ data: [] }));
      const unloading = (inwardRes.data || []).filter(t => 
        ['PENDING', 'SCHEDULED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'].includes(t.status)
      ).map(t => {
        const scheduleDate = (t.status === 'ARRIVED' && t.actual_arrival) 
          ? t.actual_arrival.split('T')[0]
          : t.eta || t.scheduled_date || t.created_at?.split('T')[0];
        
        // Check if transport was recently booked (within last 24 hours)
        const createdDate = new Date(t.created_at);
        const now = new Date();
        const hoursSinceCreation = (now - createdDate) / (1000 * 60 * 60);
        const isRecentlyBooked = hoursSinceCreation <= 24 && t.status === 'PENDING';
        
        return {
          ...t,
          type: t.source === 'EXW' ? 'EXW' : 'IMPORT',
          operation_type: 'UNLOADING',
          schedule_date: scheduleDate,
          transport_number: t.transport_number,
          is_recently_booked: isRecentlyBooked,
          arrival_date: t.eta || t.scheduled_date || scheduleDate,
        };
      });

      // Get approved POs ready for unloading (transport not booked yet)
      const unloadingReadyPOs = await api.get('/loading-unloading/unloading-ready').catch(() => ({ data: [] }));
      
      // Separate awaiting POs (no transport booked yet) - no schedule_date
      const unloadingAwaiting = (unloadingReadyPOs.data || []).map(po => ({
        ...po,
        type: po.incoterm === 'EXW' ? 'EXW' : 'IMPORT',
        operation_type: 'UNLOADING',
        schedule_date: null, // No date until transport is booked
        transport_number: po.po_number, // Use PO number as identifier
        is_ready_po: true, // Flag to indicate transport not booked yet
        estimated_date: po.delivery_date, // Show as estimated, not scheduled
        supplier_name: po.supplier_name,
        po_items: po.po_items || [],
      }));

      setLoadingOps(loading);
      setLoadingAwaiting(loadingAwaiting);
      setUnloadingOps(unloading);
      setUnloadingAwaiting(unloadingAwaiting);

      // Auto-expand today's date
      const today = new Date().toISOString().split('T')[0];
      setExpandedDates({ [today]: true });
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load loading/unloading schedule');
    } finally {
      setLoading(false);
    }
  };

  // Get week dates starting from today
  const weekDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) { // 2 weeks view
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  }, []);

  // Filter operations based on search term
  const filteredOperations = useMemo(() => {
    const operations = activeTab === 'loading' ? [...loadingOps, ...loadingAwaiting] : [...unloadingOps, ...unloadingAwaiting];
    
    if (!searchTerm) return operations;
    
    const search = searchTerm.toLowerCase();
    return operations.filter(op => {
      return (
        op.transport_number?.toLowerCase().includes(search) ||
        op.schedule_number?.toLowerCase().includes(search) ||
        op.booking_number?.toLowerCase().includes(search) ||
        op.job_number?.toLowerCase().includes(search) ||
        op.job_numbers?.some(jn => jn.toLowerCase().includes(search)) ||
        op.po_number?.toLowerCase().includes(search) ||
        op.container_number?.toLowerCase().includes(search) ||
        op.transporter?.toLowerCase().includes(search) ||
        op.vehicle_number?.toLowerCase().includes(search) ||
        op.driver_name?.toLowerCase().includes(search) ||
        op.supplier_name?.toLowerCase().includes(search) ||
        op.customer_name?.toLowerCase().includes(search) ||
        op.type?.toLowerCase().includes(search)
      );
    });
  }, [loadingOps, loadingAwaiting, unloadingOps, unloadingAwaiting, activeTab, searchTerm]);

  // Group operations by date (only booked operations with schedule_date)
  const groupedOperations = useMemo(() => {
    const grouped = {};
    
    weekDates.forEach(date => {
      grouped[date] = [];
    });

    filteredOperations.forEach(op => {
      // Only group operations that have a schedule_date (booked operations)
      if (!op.schedule_date) return;
      
      const scheduleDate = op.schedule_date.split('T')[0];
      if (scheduleDate && grouped[scheduleDate]) {
        grouped[scheduleDate].push(op);
      } else if (scheduleDate) {
        // If date is outside range, add to first day as reference
        const dateObj = new Date(scheduleDate);
        const today = new Date();
        if (dateObj >= today) {
          grouped[weekDates[0]] = grouped[weekDates[0]] || [];
          grouped[weekDates[0]].push(op);
        }
      }
    });

    return grouped;
  }, [filteredOperations, weekDates]);

  // Get awaiting operations (no schedule_date) filtered by search
  const filteredAwaiting = useMemo(() => {
    const awaiting = activeTab === 'loading' ? loadingAwaiting : unloadingAwaiting;
    if (!searchTerm) return awaiting;
    
    const search = searchTerm.toLowerCase();
    return awaiting.filter(op => {
      return (
        op.transport_number?.toLowerCase().includes(search) ||
        op.job_number?.toLowerCase().includes(search) ||
        op.po_number?.toLowerCase().includes(search) ||
        op.supplier_name?.toLowerCase().includes(search) ||
        op.customer_name?.toLowerCase().includes(search) ||
        op.type?.toLowerCase().includes(search)
      );
    });
  }, [loadingAwaiting, unloadingAwaiting, activeTab, searchTerm]);

  const toggleDate = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const formatDateHeader = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Stats
  const todayLoading = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return loadingOps.filter(op => op.schedule_date?.split('T')[0] === today).length;
  }, [loadingOps]);

  const todayUnloading = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return unloadingOps.filter(op => op.schedule_date?.split('T')[0] === today).length;
  }, [unloadingOps]);

  const weekLoading = loadingOps.length;
  const weekUnloading = unloadingOps.length;

  // Get recently booked transports for notifications
  const recentlyBookedLoading = useMemo(() => {
    return loadingOps.filter(op => op.is_recently_booked && !dismissedNotifications.has(`loading-${op.transport_number || op.schedule_number || op.id}`));
  }, [loadingOps, dismissedNotifications]);

  const recentlyBookedUnloading = useMemo(() => {
    return unloadingOps.filter(op => op.is_recently_booked && !dismissedNotifications.has(`unloading-${op.transport_number || op.id}`));
  }, [unloadingOps, dismissedNotifications]);

  const dismissNotification = (key) => {
    setDismissedNotifications(prev => new Set([...prev, key]));
  };

  return (
    <div className="page-container" data-testid="loading-unloading-window">
      {/* Transport Booking Notifications */}
      {activeTab === 'loading' && recentlyBookedLoading.length > 0 && (
        <div className="mb-4 space-y-2">
          {recentlyBookedLoading.map((op) => (
            <Card key={`loading-${op.transport_number || op.schedule_number || op.id}`} className="bg-blue-500/10 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Bell className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-blue-400">Transport Booked</p>
                        <Badge className="bg-blue-500/20 text-blue-400">{op.transport_number || op.schedule_number}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {op.type === 'CONTAINER' && op.booking_number && (
                          <p>Booking: {op.booking_number}</p>
                        )}
                        {op.job_numbers && op.job_numbers.length > 0 && (
                          <p>Job Orders: {op.job_numbers.join(', ')}</p>
                        )}
                        {op.arrival_date && (
                          <p className="text-blue-400 font-medium">
                            {op.type === 'CONTAINER' ? 'Pickup Date' : 'Dispatch Date'}: {formatDate(op.arrival_date)}
                          </p>
                        )}
                        {op.transporter && (
                          <p>Transporter: {op.transporter}</p>
                        )}
                        {op.vehicle_number && (
                          <p>Vehicle: {op.vehicle_number}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissNotification(`loading-${op.transport_number || op.schedule_number || op.id}`)}
                    className="ml-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'unloading' && recentlyBookedUnloading.length > 0 && (
        <div className="mb-4 space-y-2">
          {recentlyBookedUnloading.map((op) => (
            <Card key={`unloading-${op.transport_number || op.id}`} className="bg-green-500/10 border-green-500/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Bell className="w-5 h-5 text-green-400 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-green-400">Transport Booked</p>
                        <Badge className="bg-green-500/20 text-green-400">{op.transport_number}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {op.po_number && (
                          <p>PO: {op.po_number}</p>
                        )}
                        {op.import_number && (
                          <p>Import: {op.import_number}</p>
                        )}
                        {op.supplier_name && (
                          <p>Supplier: {op.supplier_name}</p>
                        )}
                        {op.arrival_date && (
                          <p className="text-green-400 font-medium">
                            Arrival Date: {formatDate(op.arrival_date)}
                          </p>
                        )}
                        {op.eta && (
                          <p className="text-green-400 font-medium">
                            ETA: {formatDate(op.eta)}
                          </p>
                        )}
                        {op.transporter_name && (
                          <p>Transporter: {op.transporter_name}</p>
                        )}
                        {op.vehicle_number && (
                          <p>Vehicle: {op.vehicle_number}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissNotification(`unloading-${op.transport_number || op.id}`)}
                    className="ml-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="module-header">
        <div>
          <h1 className="module-title">Loading & Unloading Window</h1>
          <p className="text-muted-foreground text-sm">
            Daily schedule of transports arriving for loading and unloading operations
          </p>
        </div>
        <div className="module-actions">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-blue-400">{todayLoading}</p>
                <p className="kpi-label">Today's Loading</p>
              </div>
              <ArrowUpFromLine className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-green-400">{todayUnloading}</p>
                <p className="kpi-label">Today's Unloading</p>
              </div>
              <ArrowDownToLine className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-500/10 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-purple-400">{weekLoading}</p>
                <p className="kpi-label">Week Loading Ops</p>
              </div>
              <Truck className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-amber-400">{weekUnloading}</p>
                <p className="kpi-label">Week Unloading Ops</p>
              </div>
              <Package className="w-8 h-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Filter */}
      <div className="mb-4 flex gap-2 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by transport number, job number, PO number, supplier, vehicle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {searchTerm && (
          <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="loading" data-testid="tab-loading">
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Loading Schedule ({weekLoading})
          </TabsTrigger>
          <TabsTrigger value="unloading" data-testid="tab-unloading">
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Unloading Schedule ({weekUnloading})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loading">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <LoadingScheduleView 
              groupedOperations={groupedOperations}
              awaitingOperations={filteredAwaiting}
              expandedDates={expandedDates}
              onToggleDate={toggleDate}
              formatDateHeader={formatDateHeader}
              searchTerm={searchTerm}
            />
          )}
        </TabsContent>

        <TabsContent value="unloading">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <UnloadingScheduleView 
              groupedOperations={groupedOperations}
              awaitingOperations={filteredAwaiting}
              expandedDates={expandedDates}
              onToggleDate={toggleDate}
              formatDateHeader={formatDateHeader}
              searchTerm={searchTerm}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Loading Schedule View Component
function LoadingScheduleView({ groupedOperations, awaitingOperations, expandedDates, onToggleDate, formatDateHeader, searchTerm }) {
  const weekDates = Object.keys(groupedOperations).sort();
  const hasScheduledOps = weekDates.some(date => groupedOperations[date]?.length > 0);
  const hasAwaitingOps = awaitingOperations?.length > 0;

  if (!hasScheduledOps && !hasAwaitingOps) {
    return (
      <div className="empty-state">
        <Package className="empty-state-icon" />
        <p className="empty-state-title">
          {searchTerm ? 'No operations match your search' : 'No loading operations scheduled'}
        </p>
        <p className="empty-state-description">
          {searchTerm ? 'Try a different search term' : 'Loading schedules appear when containers are scheduled for pickup'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Awaiting Transport Section */}
      {hasAwaitingOps && (
        <Card className="overflow-hidden border-amber-500/30">
          <div className="p-4 bg-amber-500/10 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="font-semibold text-amber-400">Awaiting Transport Booking</span>
              <Badge className="bg-amber-500/20 text-amber-400">
                {awaitingOperations.length}
              </Badge>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {awaitingOperations.map((op) => (
              <LoadingOperationCard key={op.id || op.transport_number || op.job_number} operation={op} />
            ))}
          </div>
        </Card>
      )}

      {/* Scheduled Operations */}
      {weekDates.map((date) => {
        const dateOps = groupedOperations[date] || [];
        const isExpanded = expandedDates[date];

        if (dateOps.length === 0) return null;

        return (
          <Card key={date} className="overflow-hidden">
            <button
              className="w-full p-4 flex items-center justify-between bg-muted/20 hover:bg-muted/30 transition-colors border-b border-border"
              onClick={() => onToggleDate(date)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
                <Calendar className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-lg">{formatDateHeader(date)}</span>
                <span className="text-muted-foreground">({date})</span>
              </div>
              <Badge className="bg-blue-500/20 text-blue-400">
                {dateOps.length} operation{dateOps.length !== 1 ? 's' : ''}
              </Badge>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-4">
                {dateOps.map((op) => (
                  <LoadingOperationCard key={op.id || op.transport_number || op.job_number} operation={op} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Unloading Schedule View Component
function UnloadingScheduleView({ groupedOperations, awaitingOperations, expandedDates, onToggleDate, formatDateHeader, searchTerm }) {
  const weekDates = Object.keys(groupedOperations).sort();
  const hasScheduledOps = weekDates.some(date => groupedOperations[date]?.length > 0);
  const hasAwaitingOps = awaitingOperations?.length > 0;

  if (!hasScheduledOps && !hasAwaitingOps) {
    return (
      <div className="empty-state">
        <Package className="empty-state-icon" />
        <p className="empty-state-title">
          {searchTerm ? 'No operations match your search' : 'No unloading operations scheduled'}
        </p>
        <p className="empty-state-description">
          {searchTerm ? 'Try a different search term' : 'Unloading schedules appear when transports are scheduled to arrive'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Awaiting Transport Section */}
      {hasAwaitingOps && (
        <Card className="overflow-hidden border-amber-500/30">
          <div className="p-4 bg-amber-500/10 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="font-semibold text-amber-400">Awaiting Transport Booking</span>
              <Badge className="bg-amber-500/20 text-amber-400">
                {awaitingOperations.length}
              </Badge>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {awaitingOperations.map((op) => (
              <UnloadingOperationCard key={op.id || op.transport_number || op.po_number} operation={op} />
            ))}
          </div>
        </Card>
      )}

      {/* Scheduled Operations */}
      {weekDates.map((date) => {
        const dateOps = groupedOperations[date] || [];
        const isExpanded = expandedDates[date];

        if (dateOps.length === 0) return null;

        return (
          <Card key={date} className="overflow-hidden">
            <button
              className="w-full p-4 flex items-center justify-between bg-muted/20 hover:bg-muted/30 transition-colors border-b border-border"
              onClick={() => onToggleDate(date)}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
                <Calendar className="w-5 h-5 text-green-400" />
                <span className="font-semibold text-lg">{formatDateHeader(date)}</span>
                <span className="text-muted-foreground">({date})</span>
              </div>
              <Badge className="bg-green-500/20 text-green-400">
                {dateOps.length} operation{dateOps.length !== 1 ? 's' : ''}
              </Badge>
            </button>

            {isExpanded && (
              <div className="p-4 space-y-4">
                {dateOps.map((op) => (
                  <UnloadingOperationCard key={op.id || op.transport_number || op.po_number} operation={op} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Loading Operation Card Component
function LoadingOperationCard({ operation }) {
  const isContainer = operation.type === 'CONTAINER';
  const isReadyJob = operation.is_ready_job;

  return (
    <Card className="card-hover border-blue-500/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono font-medium text-lg">{operation.transport_number || operation.job_number}</span>
              <Badge className={isContainer ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}>
                {isContainer ? <Container className="w-3 h-3 mr-1" /> : <Truck className="w-3 h-3 mr-1" />}
                {isContainer ? 'CONTAINER' : 'LOCAL'}
              </Badge>
              {isReadyJob && (
                <Badge className="bg-yellow-500/20 text-yellow-400">
                  Awaiting Transport Booking
                </Badge>
              )}
              {operation.booking_number && (
                <Badge variant="outline" className="text-xs">
                  Booking: {operation.booking_number}
                </Badge>
              )}
            </div>
            {operation.cro_number && (
              <p className="text-sm text-emerald-400 font-mono">CRO: {operation.cro_number}</p>
            )}
            {isReadyJob && operation.customer_name && (
              <p className="text-sm text-muted-foreground">Customer: {operation.customer_name}</p>
            )}
          </div>
        </div>

        {/* Container/Vehicle Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
          {operation.container_number && (
            <div>
              <p className="text-muted-foreground text-xs">Container</p>
              <p className="font-medium">{operation.container_number}</p>
            </div>
          )}
          {operation.vehicle_number && (
            <div>
              <p className="text-muted-foreground text-xs">Vehicle</p>
              <p className="font-mono font-medium">{operation.vehicle_number}</p>
            </div>
          )}
          {operation.transporter && (
            <div>
              <p className="text-muted-foreground text-xs">Transporter</p>
              <p>{operation.transporter}</p>
            </div>
          )}
          {operation.cutoff_date && (
            <div>
              <p className="text-muted-foreground text-xs">Cutoff Date</p>
              <p className="text-red-400 font-medium">{formatDate(operation.cutoff_date)}</p>
            </div>
          )}
          {isReadyJob && operation.estimated_date && (
            <div>
              <p className="text-muted-foreground text-xs">Estimated Delivery</p>
              <p className="text-yellow-400 font-medium">{formatDate(operation.estimated_date)}</p>
            </div>
          )}
        </div>

        {/* Materials to Load */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-sm p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-blue-400" />
            <p className="text-xs font-semibold text-blue-400 uppercase">Materials to Load:</p>
          </div>
          <div className="space-y-2">
            {operation.job_items && operation.job_items.length > 0 ? (
              operation.job_items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-background/50 p-2 rounded">
                  <div>
                    <span className="font-medium">{item.product_name || 'Unknown Product'}</span>
                    {item.packaging && (
                      <span className="ml-2 text-muted-foreground text-xs">({item.packaging})</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {item.quantity} {item.unit || 'KG'}
                  </Badge>
                </div>
              ))
            ) : operation.job_numbers && operation.job_numbers.length > 0 ? (
              operation.job_numbers.map((job, idx) => (
                <div key={job} className="flex items-center justify-between text-sm bg-background/50 p-2 rounded">
                  <div>
                    <span className="font-mono font-medium">{job}</span>
                    {operation.product_names?.[idx] && (
                      <span className="ml-2 text-muted-foreground">- {operation.product_names[idx]}</span>
                    )}
                  </div>
                  {operation.quantities?.[idx] && (
                    <Badge variant="outline" className="text-xs">
                      {operation.quantities[idx]} KG
                    </Badge>
                  )}
                </div>
              ))
            ) : operation.products_summary ? (
              <div className="text-sm bg-background/50 p-2 rounded">
                <span>{operation.products_summary}</span>
                {operation.total_quantity && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {operation.total_quantity} KG
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No materials specified</p>
            )}
          </div>
        </div>

        {/* Transport Details */}
        {operation.driver_name && (
          <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t border-border">
            <div>
              <p className="text-muted-foreground text-xs">Driver</p>
              <p>{operation.driver_name}</p>
            </div>
            {operation.driver_phone && (
              <div>
                <p className="text-muted-foreground text-xs">Contact</p>
                <p>{operation.driver_phone}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Unloading Operation Card Component
function UnloadingOperationCard({ operation }) {
  const isEXW = operation.type === 'EXW';
  const isReadyPO = operation.is_ready_po;

  return (
    <Card className="card-hover border-green-500/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono font-medium text-lg">{operation.transport_number || operation.po_number}</span>
              <Badge className={isEXW ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}>
                {isEXW ? 'EXW' : 'IMPORT'}
              </Badge>
              {isReadyPO && (
                <Badge className="bg-yellow-500/20 text-yellow-400">
                  Transport Not Booked
                </Badge>
              )}
            </div>
            {operation.po_number && (
              <p className="text-sm text-muted-foreground">PO: {operation.po_number}</p>
            )}
            {operation.import_number && (
              <p className="text-sm text-muted-foreground">Import: {operation.import_number}</p>
            )}
          </div>
        </div>

        {/* Supplier/Transport Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
          {operation.supplier_name && (
            <div>
              <p className="text-muted-foreground text-xs">Supplier</p>
              <p className="font-medium">{operation.supplier_name}</p>
            </div>
          )}
          {operation.vehicle_number && (
            <div>
              <p className="text-muted-foreground text-xs">Vehicle</p>
              <p className="font-mono font-medium">{operation.vehicle_number}</p>
            </div>
          )}
          {operation.eta && (
            <div>
              <p className="text-muted-foreground text-xs">ETA</p>
              <p className="text-green-400 font-medium">{formatDate(operation.eta)}</p>
            </div>
          )}
          {operation.status && (
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <Badge variant="outline">{operation.status}</Badge>
            </div>
          )}
          {isReadyPO && operation.estimated_date && (
            <div>
              <p className="text-muted-foreground text-xs">Estimated Delivery</p>
              <p className="text-yellow-400 font-medium">{formatDate(operation.estimated_date)}</p>
            </div>
          )}
        </div>

        {/* Materials to Unload */}
        <div className="bg-green-500/10 border border-green-500/30 rounded-sm p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-green-400" />
            <p className="text-xs font-semibold text-green-400 uppercase">Materials to Unload:</p>
          </div>
          <div className="space-y-2">
            {operation.po_items && operation.po_items.length > 0 ? (
              operation.po_items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-background/50 p-2 rounded">
                  <div>
                    <span className="font-medium">{item.product_name || item.item_name || 'Unknown Product'}</span>
                    {item.item_sku && (
                      <span className="ml-2 text-muted-foreground text-xs font-mono">({item.item_sku})</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {item.quantity} {item.uom || item.unit || 'KG'}
                  </Badge>
                </div>
              ))
            ) : operation.products_summary ? (
              <div className="text-sm bg-background/50 p-2 rounded">
                <span>{operation.products_summary}</span>
                {operation.total_quantity && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {operation.total_quantity} KG
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No materials specified</p>
            )}
          </div>
        </div>

        {/* Driver Info */}
        {operation.driver_name && (
          <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t border-border">
            <div>
              <p className="text-muted-foreground text-xs">Driver</p>
              <p>{operation.driver_name}</p>
            </div>
            {operation.driver_contact && (
              <div>
                <p className="text-muted-foreground text-xs">Contact</p>
                <p>{operation.driver_contact}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

