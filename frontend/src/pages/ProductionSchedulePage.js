import React, { useState, useEffect } from 'react';
import { productionAPI, jobOrderAPI, productionLogAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { getPriorityColor, formatDate, hasPagePermission } from '../lib/utils';
import { 
  Factory, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Play,
  Package,
  X,
  Search,
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Layers
} from 'lucide-react';
import { Input } from '../components/ui/input';
import api from '../lib/api';

export default function ProductionSchedulePage() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Production log states
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [categoryJobs, setCategoryJobs] = useState({
    filling_jobs: [],
    lubricants: [],
    plasticisers: [],
    jelly: []
  });
  const [logForm, setLogForm] = useState({
    job_order_id: '',
    job_number: '',
    product_id: '',
    product_name: '',
    production_date: new Date().toISOString().split('T')[0],
    required_qty: 0,
    quantity_produced: 0,
    batch_number: '',
    pending_qty: 0, // Pending quantity (remaining to be produced)
    production_type: 'drummed' // Production type: 'drummed' or 'bulk'
  });

  // Calendar view states
  const [calendarSchedule, setCalendarSchedule] = useState([]);
  const [calendarSummary, setCalendarSummary] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarStartDate, setCalendarStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [calendarDays, setCalendarDays] = useState(14);

  useEffect(() => {
    loadData();
    // Load all 4 categories on page load
    loadCategoryJobs('filling_jobs');
    loadCategoryJobs('lubricants');
    loadCategoryJobs('plasticisers');
    loadCategoryJobs('jelly');
  }, []);

  useEffect(() => {
    if (activeTab === 'calendar') {
      loadCalendarSchedule();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'calendar') {
      loadCalendarSchedule();
    }
  }, [calendarStartDate, calendarDays]);

  const loadData = async () => {
    try {
      const scheduleRes = await productionAPI.getSchedule();
      setSchedule(scheduleRes.data);
    } catch (error) {
      toast.error('Failed to load production schedule');
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryJobs = async (category) => {
    try {
      const res = await productionLogAPI.getJobsByCategory(category);
      setCategoryJobs(prev => ({
        ...prev,
        [category]: res.data.jobs || []
      }));
    } catch (error) {
      toast.error(`Failed to load ${category} jobs`);
      setCategoryJobs(prev => ({
        ...prev,
        [category]: []
      }));
    }
  };

  const loadCalendarSchedule = async () => {
    setCalendarLoading(true);
    try {
      const res = await api.get('/production/unified-schedule', {
        params: { start_date: calendarStartDate, days: calendarDays }
      });
      const schedule = res.data.schedule || [];
      
      // Fetch production logs for all jobs to calculate pending quantities
      // Fetch production logs for all jobs
      const logsRes = await productionLogAPI.getAll();
      const allLogs = logsRes.data || [];
      
      // Calculate pending quantities for each job
      const scheduleWithPending = schedule.map(day => ({
        ...day,
        jobs: day.jobs.map(job => {
          // Find logs for this job and product
          const jobLogs = allLogs.filter(log => {
            const matchesJob = log.job_order_id === job.job_id;
            const matchesProduct = job.product_id ? log.product_id === job.product_id : true;
            return matchesJob && matchesProduct;
          });
          
          const totalProduced = jobLogs.reduce((sum, log) => sum + (log.quantity_produced || 0), 0);
          const requiredQty = job.quantity || 0;
          const pendingQty = Math.max(0, requiredQty - totalProduced);
          
          return {
            ...job,
            quantity_produced: totalProduced,
            quantity_pending: pendingQty,
            required_qty: requiredQty
          };
        })
      }));
      
      setCalendarSchedule(scheduleWithPending);
      setCalendarSummary(res.data.summary || {});
    } catch (error) {
      toast.error('Failed to load production schedule');
      setCalendarSchedule([]);
    } finally {
      setCalendarLoading(false);
    }
  };

  const navigateCalendarWeek = (direction) => {
    const current = new Date(calendarStartDate);
    current.setDate(current.getDate() + (direction * 7));
    setCalendarStartDate(current.toISOString().split('T')[0]);
  };

  const goToCalendarToday = () => {
    setCalendarStartDate(new Date().toISOString().split('T')[0]);
  };

  const handleCreateLog = async (job) => {
    setSelectedJob(job);
    
    // Use quantity_pending from job if available (from backend API)
    // Otherwise, calculate by fetching existing production logs
    let pendingQty = job.quantity_pending;
    
    if (pendingQty === undefined || pendingQty === null) {
      // If not provided, calculate by fetching existing production logs
      try {
        const logsRes = await productionLogAPI.getAll(job.job_id, job.product_id);
        const logs = logsRes.data || [];
        const totalProduced = logs.reduce((sum, log) => sum + (log.quantity_produced || 0), 0);
        const requiredQty = job.quantity || 0;
        pendingQty = Math.max(0, requiredQty - totalProduced);
      } catch (error) {
        console.warn('Failed to fetch existing production logs:', error);
        // Fallback to job quantity if calculation fails
        pendingQty = job.quantity || 0;
      }
    }
    
    setLogForm({
      job_order_id: job.job_id,
      job_number: job.job_number,
      product_id: job.product_id,
      product_name: job.product_name,
      production_date: new Date().toISOString().split('T')[0],
      required_qty: job.quantity, // Keep total for display
      quantity_produced: 0,
      batch_number: '',
      pending_qty: pendingQty, // Store pending quantity (remaining to be produced)
      production_type: 'drummed' // Default to drummed
    });
    setLogModalOpen(true);
  };

  const handleSubmitLog = async () => {
    if (!logForm.batch_number || logForm.quantity_produced <= 0) {
      toast.error('Please enter batch number and quantity produced');
      return;
    }

    // Validate that quantity_produced doesn't exceed pending quantity
    const pendingQty = logForm.pending_qty || 0;
    if (logForm.quantity_produced > pendingQty) {
      toast.error(`Quantity produced (${logForm.quantity_produced}) cannot exceed pending quantity (${pendingQty})`);
      return;
    }

    try {
      await productionLogAPI.create(logForm);
      toast.success('Production log created successfully');
      setLogModalOpen(false);
      // Reload all category jobs to update quantities
      if (activeTab === 'categories') {
        loadCategoryJobs('filling_jobs');
        loadCategoryJobs('lubricants');
        loadCategoryJobs('plasticisers');
        loadCategoryJobs('jelly');
      }
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create production log');
    }
  };

  const handleStartProduction = async (jobId) => {
    try {
      await jobOrderAPI.updateStatus(jobId, 'in_production');
      toast.success('Production started');
      loadData();
    } catch (error) {
      toast.error('Failed to start production');
    }
  };

  const canManage = hasPagePermission(user, '/production-schedule', ['admin', 'production']);

  // Category Jobs Table Component (Compact version for small windows)
  const CategoryJobsTable = ({ jobs, category, compact = false }) => {
    const filteredJobs = filterJobs(jobs);
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
    
    return (
      <Card className={compact ? 'h-full flex flex-col' : ''}>
        <CardHeader className={compact ? 'pb-3' : ''}>
          <div className="flex items-center justify-between">
            <CardTitle className={compact ? 'text-base' : ''}>{categoryLabel}</CardTitle>
            <Button onClick={() => loadCategoryJobs(category)} variant="outline" size="sm" className={compact ? 'h-7 text-xs' : ''}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className={compact ? 'flex-1 overflow-auto p-3' : ''}>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No jobs found for this category
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`erp-table w-full ${compact ? 'text-xs' : ''}`}>
                <thead>
                  <tr>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>JO</th>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>Product</th>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>Qty</th>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>Produced</th>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>MT Produced</th>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>Pending</th>
                    <th className={compact ? 'px-2 py-1 text-xs' : ''}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job, idx) => {
                    // Calculate MT produced: (quantity_produced * net_weight_kg) / 1000
                    const quantityProduced = job.quantity_produced || 0;
                    const netWeightKg = job.net_weight_kg;
                    const mtProduced = netWeightKg && netWeightKg > 0 
                      ? ((quantityProduced * netWeightKg) / 1000).toFixed(3)
                      : '-';
                    
                    return (
                      <tr key={idx}>
                        <td className={`font-mono font-medium ${compact ? 'px-2 py-1 text-xs' : ''}`}>{job.job_number}</td>
                        <td className={compact ? 'px-2 py-1 text-xs' : ''}>
                          <div className="font-medium">{job.product_name}</div>
                          {job.product_sku && !compact && (
                            <div className="text-xs text-muted-foreground">{job.product_sku}</div>
                          )}
                        </td>
                        <td className={`font-mono ${compact ? 'px-2 py-1 text-xs' : ''}`}>{job.quantity}</td>
                        <td className={`font-mono text-green-400 ${compact ? 'px-2 py-1 text-xs' : ''}`}>{quantityProduced}</td>
                        <td className={`font-mono text-green-400 ${compact ? 'px-2 py-1 text-xs' : ''}`}>{mtProduced}</td>
                        <td className={`font-mono text-amber-400 ${compact ? 'px-2 py-1 text-xs' : ''}`}>{job.quantity_pending || job.quantity}</td>
                        <td className={compact ? 'px-2 py-1' : ''}>
                          <Button
                            size={compact ? 'sm' : 'sm'}
                            onClick={() => handleCreateLog(job)}
                            disabled={!canManage}
                            className={compact ? 'h-6 text-xs px-2' : ''}
                          >
                            <Plus className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
                            {compact ? 'Log' : 'Create Log'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Filter jobs based on search query
  const filterJobs = (jobs) => {
    if (!searchQuery.trim()) return jobs || [];
    
    const query = searchQuery.toLowerCase().trim();
    return (jobs || []).filter(job => {
      const jobNumber = job.job_number?.toLowerCase() || '';
      const productName = job.product_name?.toLowerCase() || '';
      const spaNumber = job.spa_number?.toLowerCase() || '';
      const customerName = job.customer_name?.toLowerCase() || '';
      
      return jobNumber.includes(query) ||
             productName.includes(query) ||
             spaNumber.includes(query) ||
             customerName.includes(query);
    });
  };

  // Calendar Day Card Component
  const CalendarDayCard = ({ day, isToday }) => {
    const [expanded, setExpanded] = useState(isToday);
    
    const utilizationColor = day.utilization >= 90 
      ? 'text-red-400' 
      : day.utilization >= 70 
        ? 'text-amber-400' 
        : 'text-green-400';

    const hasShortages = day.jobs.some(j => !j.material_ready);

    return (
      <div className={`glass rounded-lg border ${
        isToday ? 'border-indigo-500/50 bg-indigo-500/5' : 
        day.is_full ? 'border-red-500/30' : 'border-border'
      }`}>
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
                      <div className="flex flex-col items-end">
                        <span className="text-amber-400">{Math.ceil(job.quantity_pending || job.quantity || 0)}</span>
                        {job.quantity_produced > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({Math.ceil(job.quantity_produced)} produced)
                          </span>
                        )}
                        {job.is_partial && (
                          <span className="text-xs text-muted-foreground">
                            /{Math.ceil(job.total_quantity)} total
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-sm">
                      {job.delivery_date ? new Date(job.delivery_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-2 px-2">
                      {job.material_ready ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle className="w-3 h-3" /> Ready
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3 h-3" /> {job.shortage_items} short
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Badge className={
                        job.status === 'approved' ? 'status-approved' :
                        job.status === 'in_production' ? 'status-warning' :
                        job.status === 'production_completed' ? 'status-approved' :
                        'status-pending'
                      }>
                        {job.status?.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

  const JobCard = ({ job, showAction = true }) => (
    <Card className="card-hover" data-testid={`job-card-${job.job_number}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{job.job_number}</span>
              <span className={`text-sm ${getPriorityColor(job.priority)}`}>
                {job.priority?.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{job.spa_number}</p>
            {(job.schedule_date || job.created_at) && (
              <p className="text-xs text-muted-foreground mt-1">
                {job.schedule_date ? `Scheduled: ${formatDate(job.schedule_date)}` : `Booked: ${formatDate(job.created_at)}`}
              </p>
            )}
          </div>
          <Badge className={
            job.material_status === 'ready' ? 'status-approved' :
            job.material_status === 'partial' ? 'status-warning' :
            job.material_status === 'raw_materials_unavailable' ? 'status-rejected' :
            'status-rejected'
          }>
            {job.material_status === 'ready' ? <CheckCircle className="w-3 h-3 mr-1" /> :
             job.material_status === 'partial' ? <AlertTriangle className="w-3 h-3 mr-1" /> :
             job.material_status === 'raw_materials_unavailable' ? <X className="w-3 h-3 mr-1" /> :
             <Clock className="w-3 h-3 mr-1" />}
            {job.material_status === 'raw_materials_unavailable' ? 'Raw Materials Unavailable' :
             `${job.ready_percentage}% Ready`}
          </Badge>
        </div>

        <div className="mb-3">
          <p className="font-medium">{job.product_name}</p>
          <p className="text-sm text-muted-foreground">Quantity: {job.quantity}</p>
        </div>

        {/* Material Status */}
        <div className="bg-muted/30 rounded-sm p-3 mb-3">
          <p className="text-xs text-muted-foreground mb-2">RECOMMENDATION:</p>
          <p className="text-sm">{job.recommended_action}</p>
        </div>

        {/* Missing Raw Materials */}
        {job.missing_raw_materials?.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">Missing Raw Materials:</p>
            <div className="space-y-1">
              {job.missing_raw_materials.map((mat, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-red-500/10 rounded px-2 py-1">
                  <span>{mat.product_name}</span>
                  <span className="text-red-400">
                    Need: {mat.required_qty} | Have: {mat.available_qty} | Short: {mat.shortage} {mat.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Materials (non-raw) */}
        {job.missing_materials?.length > 0 && job.missing_materials.some(m => m.item_type !== 'RAW') && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">Missing Materials:</p>
            <div className="space-y-1">
              {job.missing_materials.filter(m => m.item_type !== 'RAW').map((mat, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-red-500/10 rounded px-2 py-1">
                  <span>{mat.product_name}</span>
                  <span className="text-red-400">
                    Need: {mat.required_qty} | Have: {mat.available_qty} | Short: {mat.shortage} {mat.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Materials */}
        {job.available_materials?.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">Available Materials:</p>
            <div className="space-y-1">
              {job.available_materials.map((mat, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm bg-emerald-500/10 rounded px-2 py-1">
                  <span>{mat.product_name}</span>
                  <span className="text-emerald-400">
                    {mat.available_qty} / {mat.required_qty} {mat.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAction && canManage && job.material_status === 'ready' && (
          <Button 
            className="w-full mt-2" 
            onClick={() => handleStartProduction(job.job_id)}
            data-testid={`start-production-${job.job_number}`}
          >
            <Play className="w-4 h-4 mr-2" /> Start Production
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="page-container">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" data-testid="production-schedule-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Production Dashboard (Schedule and Planning)</h1>
          <p className="text-muted-foreground text-sm">Schedule based on material availability</p>
        </div>
        <Button variant="outline" onClick={loadData}>
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-1 gap-4 mb-6">
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value">{schedule?.summary?.total_pending || 0}</p>
                <p className="kpi-label">Total Pending</p>
              </div>
              <Factory className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Filter */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by job number, product, SPA, or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">
            <Calendar className="w-4 h-4 mr-1" />
            Calendar View
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Layers className="w-4 h-4 mr-1" />
            Production Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <div className="space-y-6">
            {/* Calendar Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Total Drums Scheduled</p>
                  <p className="text-2xl font-bold text-indigo-400">{calendarSummary.total_drums_scheduled || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Jobs Scheduled</p>
                  <p className="text-2xl font-bold text-blue-400">{calendarSummary.jobs_scheduled || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Unscheduled Jobs</p>
                  <p className="text-2xl font-bold text-amber-400">{calendarSummary.unscheduled_jobs || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Days with Capacity</p>
                  <p className="text-2xl font-bold text-green-400">{calendarSummary.days_with_capacity || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Avg Utilization</p>
                  <p className="text-2xl font-bold text-cyan-400">{calendarSummary.average_utilization || 0}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Calendar Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateCalendarWeek(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToCalendarToday}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigateCalendarWeek(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground ml-2">
                  Starting {new Date(calendarStartDate).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={calendarDays}
                  onChange={(e) => setCalendarDays(parseInt(e.target.value))}
                  className="bg-background border border-border rounded px-3 py-1.5 text-sm"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={21}>21 days</option>
                  <option value={30}>30 days</option>
                </select>
                <Button variant="outline" size="sm" onClick={loadCalendarSchedule} disabled={calendarLoading}>
                  <RefreshCw className={`w-4 h-4 ${calendarLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Calendar Schedule Grid */}
            {calendarLoading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4">
                {calendarSchedule.map((day, idx) => (
                  <CalendarDayCard 
                    key={day.date || idx} 
                    day={day} 
                    isToday={day.date === new Date().toISOString().split('T')[0]} 
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-[600px]">
              <CategoryJobsTable jobs={categoryJobs.filling_jobs} category="filling_jobs" compact={true} />
            </div>
            <div className="h-[600px]">
              <CategoryJobsTable jobs={categoryJobs.lubricants} category="lubricants" compact={true} />
            </div>
            <div className="h-[600px]">
              <CategoryJobsTable jobs={categoryJobs.plasticisers} category="plasticisers" compact={true} />
            </div>
            <div className="h-[600px]">
              <CategoryJobsTable jobs={categoryJobs.jelly} category="jelly" compact={true} />
            </div>
          </div>
        </TabsContent>

      </Tabs>

      {/* Production Log Modal */}
      <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Production Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Job Order</Label>
              <Input value={logForm.job_number} disabled />
            </div>
            <div>
              <Label>Product</Label>
              <Input value={logForm.product_name} disabled />
            </div>
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={logForm.production_date}
                onChange={(e) => setLogForm({...logForm, production_date: e.target.value})}
              />
            </div>
            
            {/* Production Type Dropdown */}
            <div>
              <Label>Production Type *</Label>
              <select
                className="w-full bg-background border border-border rounded px-3 py-2"
                value={logForm.production_type}
                onChange={(e) => setLogForm({
                  ...logForm, 
                  production_type: e.target.value,
                  quantity_produced: 0
                })}
              >
                <option value="drummed">Drummed</option>
                <option value="bulk">Bulk</option>
              </select>
            </div>

            {/* Conditional rendering based on production_type */}
            {logForm.production_type === 'bulk' ? (
              <>
                {/* BULK MODE */}
                <div>
                  <Label>Total Required Qty (KG)</Label>
                  <Input value={logForm.required_qty} disabled />
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {(logForm.required_qty / 1000).toFixed(3)} MT
                  </p>
                </div>
                <div>
                  <Label>Pending Qty (KG)</Label>
                  <Input value={logForm.pending_qty || 0} disabled className="text-amber-400 font-medium" />
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {((logForm.pending_qty || 0) / 1000).toFixed(3)} MT
                  </p>
                </div>
                <div>
                  <Label>Quantity Produced (KG) * (Max: {logForm.pending_qty || 0})</Label>
                  <Input
                    type="number"
                    min="0"
                    max={logForm.pending_qty || 0}
                    step="0.01"
                    value={logForm.quantity_produced}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      const maxValue = logForm.pending_qty || 0;
                      const finalValue = value > maxValue ? maxValue : value;
                      setLogForm({...logForm, quantity_produced: finalValue});
                    }}
                    placeholder="Enter quantity in KG"
                    className={logForm.quantity_produced > (logForm.pending_qty || 0) ? 'border-red-500' : ''}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {(logForm.quantity_produced / 1000).toFixed(3)} MT
                  </p>
                  {logForm.quantity_produced > (logForm.pending_qty || 0) && (
                    <p className="text-xs text-red-400 mt-1">
                      Cannot exceed pending quantity ({logForm.pending_qty || 0} KG)
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* DRUMMED MODE (Current Implementation) */}
                <div>
                  <Label>Total Required Qty</Label>
                  <Input value={logForm.required_qty} disabled />
                </div>
                <div>
                  <Label>Pending Qty (Remaining to Produce)</Label>
                  <Input value={logForm.pending_qty || 0} disabled className="text-amber-400 font-medium" />
                </div>
                <div>
                  <Label>Quantity Produced * (Max: {logForm.pending_qty || 0})</Label>
                  <Input
                    type="number"
                    min="0"
                    max={logForm.pending_qty || 0}
                    step="0.01"
                    value={logForm.quantity_produced}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      const maxValue = logForm.pending_qty || 0;
                      const finalValue = value > maxValue ? maxValue : value;
                      setLogForm({...logForm, quantity_produced: finalValue});
                    }}
                    className={logForm.quantity_produced > (logForm.pending_qty || 0) ? 'border-red-500' : ''}
                  />
                  {logForm.quantity_produced > (logForm.pending_qty || 0) && (
                    <p className="text-xs text-red-400 mt-1">
                      Cannot exceed pending quantity ({logForm.pending_qty || 0})
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <Label>Batch Number (Recorded) *</Label>
              <Input
                value={logForm.batch_number}
                onChange={(e) => setLogForm({...logForm, batch_number: e.target.value})}
                placeholder="Enter batch number"
              />
            </div>
            
            {logForm.required_qty > 0 && (
              <div className="bg-muted/30 p-3 rounded">
                <div className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span>Total Required:</span>
                    <span className="font-medium">
                      {logForm.required_qty} {logForm.production_type === 'bulk' && '(KG)'}
                    </span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>This Entry:</span>
                    <span className="font-medium">
                      {logForm.quantity_produced} {logForm.production_type === 'bulk' && '(KG)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Remaining After This Entry:</span>
                    <span className="font-medium text-amber-400">
                      {Math.max(0, (logForm.pending_qty || 0) - logForm.quantity_produced)}
                      {logForm.production_type === 'bulk' && ' (KG)'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLogModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitLog}>
              Create Log
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
