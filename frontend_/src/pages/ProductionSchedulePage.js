import React, { useState, useEffect } from 'react';
import { productionAPI, jobOrderAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { getPriorityColor } from '../lib/utils';
import { 
  Factory, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Play,
  Package,
  ShoppingCart
} from 'lucide-react';

export default function ProductionSchedulePage() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [procurementList, setProcurementList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ready');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [scheduleRes, procurementRes] = await Promise.all([
        productionAPI.getSchedule(),
        productionAPI.getProcurementList(),
      ]);
      setSchedule(scheduleRes.data);
      setProcurementList(procurementRes.data);
    } catch (error) {
      toast.error('Failed to load production schedule');
    } finally {
      setLoading(false);
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

  const canManage = ['admin', 'production'].includes(user?.role);

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
          </div>
          <Badge className={
            job.material_status === 'ready' ? 'status-approved' :
            job.material_status === 'partial' ? 'status-warning' : 'status-rejected'
          }>
            {job.material_status === 'ready' ? <CheckCircle className="w-3 h-3 mr-1" /> :
             job.material_status === 'partial' ? <AlertTriangle className="w-3 h-3 mr-1" /> :
             <Clock className="w-3 h-3 mr-1" />}
            {job.ready_percentage}% Ready
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

        {/* Missing Materials */}
        {job.missing_materials?.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">Missing Materials:</p>
            <div className="space-y-1">
              {job.missing_materials.map((mat, idx) => (
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
          <h1 className="module-title">Production Schedule</h1>
          <p className="text-muted-foreground text-sm">Schedule based on material availability</p>
        </div>
        <Button variant="outline" onClick={loadData}>
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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

        <Card className="bg-emerald-500/10 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-emerald-400">{schedule?.summary?.ready_to_produce || 0}</p>
                <p className="kpi-label">Ready to Produce</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-amber-400">{schedule?.summary?.partial_materials || 0}</p>
                <p className="kpi-label">Partial Materials</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-value text-red-400">{schedule?.summary?.awaiting_procurement || 0}</p>
                <p className="kpi-label">Awaiting Procurement</p>
              </div>
              <ShoppingCart className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ready" data-testid="tab-ready">
            <CheckCircle className="w-4 h-4 mr-1" />
            Ready ({schedule?.ready_jobs?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="partial" data-testid="tab-partial">
            <AlertTriangle className="w-4 h-4 mr-1" />
            Partial ({schedule?.partial_jobs?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="not_ready" data-testid="tab-not-ready">
            <Clock className="w-4 h-4 mr-1" />
            Not Ready ({schedule?.not_ready_jobs?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="procurement" data-testid="tab-procurement">
            <Package className="w-4 h-4 mr-1" />
            Procurement List
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ready">
          {schedule?.ready_jobs?.length === 0 ? (
            <div className="empty-state">
              <CheckCircle className="empty-state-icon" />
              <p className="empty-state-title">No jobs ready for production</p>
              <p className="empty-state-description">Jobs will appear here when all materials are available</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {schedule?.ready_jobs?.map(job => (
                <JobCard key={job.job_id} job={job} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="partial">
          {schedule?.partial_jobs?.length === 0 ? (
            <div className="empty-state">
              <AlertTriangle className="empty-state-icon" />
              <p className="empty-state-title">No jobs with partial materials</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {schedule?.partial_jobs?.map(job => (
                <JobCard key={job.job_id} job={job} showAction={false} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="not_ready">
          {schedule?.not_ready_jobs?.length === 0 ? (
            <div className="empty-state">
              <Clock className="empty-state-icon" />
              <p className="empty-state-title">No jobs waiting for materials</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {schedule?.not_ready_jobs?.map(job => (
                <JobCard key={job.job_id} job={job} showAction={false} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="procurement">
          <Card>
            <CardHeader>
              <CardTitle>Materials to Procure</CardTitle>
            </CardHeader>
            <CardContent>
              {procurementList?.procurement_list?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">All materials are in stock</p>
              ) : (
                <div className="data-grid">
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>SKU</th>
                        <th>Current Stock</th>
                        <th>Total Required</th>
                        <th>Shortage</th>
                        <th>Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {procurementList?.procurement_list?.map((mat, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{mat.product_name}</td>
                          <td className="font-mono">{mat.sku}</td>
                          <td className="font-mono">{mat.current_stock} {mat.unit}</td>
                          <td className="font-mono">{mat.total_required} {mat.unit}</td>
                          <td className="font-mono text-red-400">{mat.total_shortage} {mat.unit}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {mat.jobs?.map((j, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {j.job_number}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
