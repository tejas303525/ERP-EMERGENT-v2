import React, { useState, useEffect } from 'react';
import { drumScheduleAPI, procurementReqAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Calendar, Package, AlertTriangle, CheckCircle, Clock, TrendingUp, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';

// Get Monday of current week
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

const DrumSchedulePage = () => {
  const [weekStart, setWeekStart] = useState(() => {
    const monday = getMonday(new Date());
    return monday.toISOString().split('T')[0];
  });
  const [schedule, setSchedule] = useState(null);
  const [arrivals, setArrivals] = useState(null);
  const [procurementReqs, setProcurementReqs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    loadSchedule();
    loadArrivals();
    loadProcurementReqs();
  }, [weekStart]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const response = await drumScheduleAPI.getSchedule(weekStart);
      setSchedule(response.data);
    } catch (error) {
      if (error.response?.status !== 404) {
        toast.error('Failed to load schedule');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadArrivals = async () => {
    try {
      const response = await drumScheduleAPI.getArrivals(weekStart);
      setArrivals(response.data);
    } catch (error) {
      console.error('Failed to load arrivals:', error);
    }
  };

  const loadProcurementReqs = async () => {
    try {
      const response = await procurementReqAPI.getAll('DRAFT');
      setProcurementReqs(response.data);
    } catch (error) {
      console.error('Failed to load procurement requisitions:', error);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const response = await drumScheduleAPI.regenerate(weekStart);
      toast.success(response.data.message);
      loadSchedule();
      loadArrivals();
      loadProcurementReqs();
    } catch (error) {
      toast.error('Failed to regenerate schedule: ' + (error.response?.data?.detail || error.message));
    } finally {
      setRegenerating(false);
    }
  };

  const handleApproveSchedule = async () => {
    try {
      const response = await drumScheduleAPI.approveSchedule(weekStart);
      toast.success(response.data.message);
      loadSchedule();
    } catch (error) {
      toast.error('Failed to approve schedule: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handlePrevWeek = () => {
    const prevMonday = new Date(weekStart);
    prevMonday.setDate(prevMonday.getDate() - 7);
    setWeekStart(prevMonday.toISOString().split('T')[0]);
  };

  const handleNextWeek = () => {
    const nextMonday = new Date(weekStart);
    nextMonday.setDate(nextMonday.getDate() + 7);
    setWeekStart(nextMonday.toISOString().split('T')[0]);
  };

  const getStatusColor = (status) => {
    const colors = {
      READY: 'bg-green-500/20 text-green-400 border-green-500/50',
      BLOCKED: 'bg-red-500/20 text-red-400 border-red-500/50',
      DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      IN_PROGRESS: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      DONE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
    };
    return colors[status] || colors.DRAFT;
  };

  const getStatusIcon = (status) => {
    const icons = {
      READY: <CheckCircle className="w-4 h-4" />,
      BLOCKED: <AlertTriangle className="w-4 h-4" />,
      DRAFT: <Clock className="w-4 h-4" />,
      IN_PROGRESS: <TrendingUp className="w-4 h-4" />,
      DONE: <CheckCircle className="w-4 h-4" />
    };
    return icons[status] || icons.DRAFT;
  };

  // Group schedule days by date
  const groupScheduleDaysByDate = () => {
    if (!schedule?.schedule_days) return {};
    
    const grouped = {};
    schedule.schedule_days.forEach(day => {
      const date = day.schedule_date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(day);
    });
    return grouped;
  };

  const scheduleDaysByDate = groupScheduleDaysByDate();
  
  // Generate 7 days from week_start
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    try {
      const date = new Date(weekStart);
      if (isNaN(date.getTime())) {
        // Invalid date, use current date
        const today = new Date();
        today.setDate(today.getDate() + i);
        return today.toISOString().split('T')[0];
      }
      date.setDate(date.getDate() + i);
      return date.toISOString().split('T')[0];
    } catch (error) {
      console.error('Error generating week days:', error);
      return new Date().toISOString().split('T')[0];
    }
  });

  const getDayName = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getDailyDrums = (dateStr) => {
    const days = scheduleDaysByDate[dateStr] || [];
    return days.reduce((sum, day) => sum + day.planned_drums, 0);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Package className="w-8 h-8 text-sky-500" />
              Drum Production Schedule
            </h1>
            <p className="text-muted-foreground mt-1">
              Weekly capacity-aware planning • 600 drums/day capacity
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-sky-500 hover:bg-sky-600"
            >
              {regenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate Schedule
                </>
              )}
            </Button>
            <Button
              onClick={handleApproveSchedule}
              variant="outline"
              className="border-green-500/50 text-green-400 hover:bg-green-500/10"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve & Reserve
            </Button>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-4 glass p-4 rounded-lg border border-border">
          <Button
            onClick={handlePrevWeek}
            variant="outline"
            size="sm"
          >
            ← Prev Week
          </Button>
          <div className="flex items-center gap-2 flex-1 justify-center">
            <Calendar className="w-4 h-4 text-sky-500" />
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="bg-background border border-border rounded px-3 py-1.5 text-sm"
            />
            <span className="text-muted-foreground text-sm">
              Week of {new Date(weekStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <Button
            onClick={handleNextWeek}
            variant="outline"
            size="sm"
          >
            Next Week →
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading schedule...</div>
        </div>
      ) : !schedule?.schedule_days || schedule.schedule_days.length === 0 ? (
        <div className="glass p-12 rounded-lg border border-border text-center">
          <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold mb-2">No Schedule Generated</h3>
          <p className="text-muted-foreground mb-4">
            Click "Regenerate Schedule" to create a production plan for this week
          </p>
          <Button
            onClick={handleRegenerate}
            className="bg-sky-500 hover:bg-sky-600"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Generate Schedule
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Weekly Grid */}
          <div className="grid grid-cols-7 gap-3">
            {weekDays.map((dateStr) => {
              const dailyDrums = getDailyDrums(dateStr);
              const capacity = schedule.daily_capacity || 600;
              const utilizationPct = (dailyDrums / capacity) * 100;
              const daySchedule = scheduleDaysByDate[dateStr] || [];
              
              return (
                <div key={dateStr} className="glass rounded-lg border border-border overflow-hidden">
                  {/* Day Header */}
                  <div className="p-3 border-b border-border bg-muted/5">
                    <div className="font-semibold text-sm">{getDayName(dateStr)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {dailyDrums} / {capacity} drums
                    </div>
                    {/* Capacity Bar */}
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          utilizationPct > 100
                            ? 'bg-red-500'
                            : utilizationPct > 80
                            ? 'bg-amber-500'
                            : 'bg-sky-500'
                        }`}
                        style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Campaign Cards */}
                  <div className="p-2 space-y-2 min-h-[200px]">
                    {daySchedule.map((day) => (
                      <button
                        key={day.id}
                        onClick={() => setSelectedCampaign(day)}
                        className={`w-full text-left p-2.5 rounded border transition-colors hover:bg-accent/50 ${getStatusColor(
                          day.status
                        )}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          {getStatusIcon(day.status)}
                          <span className="text-xs font-medium uppercase">{day.status}</span>
                        </div>
                        <div className="text-sm font-semibold truncate">
                          {day.campaign?.product?.name || 'Unknown Product'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {day.planned_drums} drums
                        </div>
                        {day.blocking_reason && day.blocking_reason !== 'NONE' && (
                          <div className="text-xs text-red-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {day.blocking_reason.replace(/_/g, ' ')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Campaign Detail Panel */}
          {selectedCampaign && (
            <CampaignDetailPanel
              campaign={selectedCampaign}
              onClose={() => setSelectedCampaign(null)}
            />
          )}

          {/* Arrivals Panel */}
          {arrivals && (arrivals.raw_arrivals?.length > 0 || arrivals.pack_arrivals?.length > 0) && (
            <ArrivalsPanel arrivals={arrivals} />
          )}

          {/* Procurement Suggestions */}
          {procurementReqs.length > 0 && (
            <ProcurementPanel procurementReqs={procurementReqs} />
          )}
        </div>
      )}
    </div>
  );
};

// Campaign Detail Panel Component
const CampaignDetailPanel = ({ campaign, onClose }) => {
  const rawRequirements = campaign.requirements?.filter(r => r.item_type === 'RAW') || [];
  const packRequirements = campaign.requirements?.filter(r => r.item_type === 'PACK') || [];

  return (
    <div className="glass rounded-lg border border-border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold">{campaign.campaign?.product?.name}</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {campaign.campaign?.packaging?.name} • {campaign.planned_drums} drums
          </p>
        </div>
        <Button onClick={onClose} variant="ghost" size="sm">✕</Button>
      </div>

      {/* Status */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-4 ${getStatusColor(campaign.status)}`}>
        {getStatusIcon(campaign.status)}
        <span>{campaign.status}</span>
      </div>

      {/* Blocking Details */}
      {campaign.blocking_details && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
          <div className="font-semibold text-red-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Material Shortages
          </div>
          {campaign.blocking_details.shortages?.map((shortage, idx) => (
            <div key={idx} className="text-sm text-red-300 ml-6 mb-1">
              • {shortage.item_name}: Need {shortage.required.toFixed(2)}, Available {shortage.available.toFixed(2)}, Short {shortage.shortage.toFixed(2)}
            </div>
          ))}
        </div>
      )}

      {/* Linked Job Orders */}
      {campaign.campaign?.job_links && (
        <div className="mb-4">
          <h4 className="font-semibold mb-2">Linked Job Orders</h4>
          <div className="space-y-2">
            {campaign.campaign.job_links.map((link, idx) => (
              <div key={idx} className="glass p-3 rounded border border-border text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{link.job_order?.customer_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Drums Allocated:</span>
                  <span className="font-medium">{link.drums_allocated}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Delivery Date:</span>
                  <span className="font-medium">{link.job_item?.delivery_date?.split('T')[0] || 'N/A'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Material Requirements */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-semibold mb-2 text-sm">RAW Materials</h4>
          <div className="space-y-1">
            {rawRequirements.map((req, idx) => (
              <div key={idx} className="text-xs p-2 rounded bg-muted/20">
                <div className="font-medium">{req.item?.name}</div>
                <div className="text-muted-foreground mt-0.5">
                  Required: {req.required_qty.toFixed(2)} {req.item?.uom}
                </div>
                {req.shortage_qty > 0 && (
                  <div className="text-red-400 mt-0.5">
                    Short: {req.shortage_qty.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-2 text-sm">Packaging Materials</h4>
          <div className="space-y-1">
            {packRequirements.map((req, idx) => (
              <div key={idx} className="text-xs p-2 rounded bg-muted/20">
                <div className="font-medium">{req.item?.name}</div>
                <div className="text-muted-foreground mt-0.5">
                  Required: {req.required_qty.toFixed(2)} {req.item?.uom}
                </div>
                {req.shortage_qty > 0 && (
                  <div className="text-red-400 mt-0.5">
                    Short: {req.shortage_qty.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get status icon
const getStatusIcon = (status) => {
  const icons = {
    READY: <CheckCircle className="w-4 h-4" />,
    BLOCKED: <AlertTriangle className="w-4 h-4" />,
    DRAFT: <Clock className="w-4 h-4" />,
    IN_PROGRESS: <TrendingUp className="w-4 h-4" />,
    DONE: <CheckCircle className="w-4 h-4" />
  };
  return icons[status] || icons.DRAFT;
};

// Helper function to get status color
const getStatusColor = (status) => {
  const colors = {
    READY: 'bg-green-500/20 text-green-400 border-green-500/50',
    BLOCKED: 'bg-red-500/20 text-red-400 border-red-500/50',
    DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
    IN_PROGRESS: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    DONE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
  };
  return colors[status] || colors.DRAFT;
};

// Arrivals Panel Component
const ArrivalsPanel = ({ arrivals }) => {
  return (
    <div className="glass rounded-lg border border-border p-6">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Download className="w-5 h-5 text-green-500" />
        Incoming Materials This Week
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* RAW Arrivals */}
        <div>
          <h4 className="font-semibold text-sm mb-3 text-sky-400">RAW Materials ({arrivals.raw_arrivals?.length || 0})</h4>
          <div className="space-y-2">
            {arrivals.raw_arrivals?.map((arrival, idx) => (
              <div key={idx} className="p-3 rounded bg-muted/10 border border-border text-sm">
                <div className="font-medium">{arrival.item_name}</div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                  <div>
                    <span>PO: </span>
                    <span className="text-foreground">{arrival.po_number}</span>
                  </div>
                  <div>
                    <span>Qty: </span>
                    <span className="text-foreground">{arrival.remaining_qty.toFixed(2)} {arrival.uom}</span>
                  </div>
                  <div>
                    <span>ETA: </span>
                    <span className="text-foreground">{arrival.promised_delivery_date?.split('T')[0]}</span>
                  </div>
                  <div>
                    <span>Needed By: </span>
                    <span className="text-foreground">{arrival.required_by?.split('T')[0]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PACK Arrivals */}
        <div>
          <h4 className="font-semibold text-sm mb-3 text-emerald-400">Packaging Materials ({arrivals.pack_arrivals?.length || 0})</h4>
          <div className="space-y-2">
            {arrivals.pack_arrivals?.map((arrival, idx) => (
              <div key={idx} className="p-3 rounded bg-muted/10 border border-border text-sm">
                <div className="font-medium">{arrival.item_name}</div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                  <div>
                    <span>PO: </span>
                    <span className="text-foreground">{arrival.po_number}</span>
                  </div>
                  <div>
                    <span>Qty: </span>
                    <span className="text-foreground">{arrival.remaining_qty.toFixed(2)} {arrival.uom}</span>
                  </div>
                  <div>
                    <span>ETA: </span>
                    <span className="text-foreground">{arrival.promised_delivery_date?.split('T')[0]}</span>
                  </div>
                  <div>
                    <span>Needed By: </span>
                    <span className="text-foreground">{arrival.required_by?.split('T')[0]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Procurement Panel Component
const ProcurementPanel = ({ procurementReqs }) => {
  const totalLines = procurementReqs.reduce((sum, pr) => sum + (pr.lines?.length || 0), 0);
  
  return (
    <div className="glass rounded-lg border border-amber-500/30 p-6 bg-amber-500/5">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        Procurement Suggestions ({totalLines} items)
      </h3>
      
      <div className="space-y-4">
        {procurementReqs.map((pr) => (
          <div key={pr.id} className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-medium">PR Status: </span>
                <span className="text-amber-400">{pr.status}</span>
              </div>
              <Button size="sm" className="bg-sky-500 hover:bg-sky-600">
                Create PO
              </Button>
            </div>
            
            <div className="space-y-2">
              {pr.lines?.map((line, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm p-2 rounded bg-muted/10">
                  <div>
                    <span className="font-medium">{line.item?.name}</span>
                    <span className="text-muted-foreground ml-2">
                      ({line.item_type})
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{line.qty.toFixed(2)} {line.uom}</div>
                    <div className="text-xs text-muted-foreground">
                      Needed by: {line.required_by?.split('T')[0]}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DrumSchedulePage;
