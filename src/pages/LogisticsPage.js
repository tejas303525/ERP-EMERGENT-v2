import React, { useState, useEffect } from 'react';
import { logisticsAPI, purchaseOrderAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Truck, Ship, Package, ArrowRight, Check, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const LogisticsPage = () => {
  const [routingRecords, setRoutingRecords] = useState([]);
  const [routingOptions, setRoutingOptions] = useState({ local_terms: [], import_terms: [], incoterms: {} });
  const [pendingPOs, setPendingPOs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedIncoterm, setSelectedIncoterm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [routingRes, optionsRes, posRes] = await Promise.all([
        logisticsAPI.getRouting(),
        logisticsAPI.getRoutingOptions(),
        purchaseOrderAPI.getAll('SENT')
      ]);
      setRoutingRecords(routingRes.data || []);
      setRoutingOptions(optionsRes.data || {});
      setPendingPOs(posRes.data || []);
    } catch (error) {
      toast.error('Failed to load logistics data');
    } finally {
      setLoading(false);
    }
  };

  const handleRoutePO = async (poId, incoterm) => {
    try {
      const res = await logisticsAPI.routePO(poId, incoterm);
      toast.success(res.data.message || 'PO routed successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to route PO: ' + (error.response?.data?.detail || error.message));
    }
  };

  const getRouteIcon = (route) => {
    switch (route) {
      case 'TRANSPORTATION_INWARD':
        return <Truck className="w-5 h-5 text-blue-400" />;
      case 'SHIPPING_BOOKING':
        return <Ship className="w-5 h-5 text-cyan-400" />;
      case 'SECURITY_QC_INWARD':
        return <Package className="w-5 h-5 text-green-400" />;
      case 'IMPORT_INWARD':
        return <MapPin className="w-5 h-5 text-purple-400" />;
      default:
        return <ArrowRight className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto" data-testid="logistics-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="w-8 h-8 text-blue-500" />
          Inward Logistics
        </h1>
        <p className="text-muted-foreground mt-1">Incoterm-Based Routing for POs</p>
      </div>

      {/* Incoterm Legend */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <h3 className="font-semibold text-blue-400 mb-2">LOCAL Incoterms</h3>
          <div className="space-y-1 text-sm">
            {routingOptions.local_terms?.map(term => (
              <div key={term} className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">{term}</span>
                <span className="text-muted-foreground">{routingOptions.incoterms?.[term]?.description}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <h3 className="font-semibold text-cyan-400 mb-2">IMPORT Incoterms</h3>
          <div className="space-y-1 text-sm">
            {routingOptions.import_terms?.map(term => (
              <div key={term} className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">{term}</span>
                <span className="text-muted-foreground">{routingOptions.incoterms?.[term]?.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'pending', label: 'POs to Route', count: pendingPOs.length },
          { id: 'routed', label: 'Routing History', count: routingRecords.length },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-white/20">{tab.count}</span>
            )}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <>
          {/* POs to Route Tab */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Sent POs Awaiting Routing</h2>
              {pendingPOs.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">All POs have been routed</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingPOs.map((po) => (
                    <div key={po.id} className="glass p-4 rounded-lg border border-border" data-testid={`po-route-${po.id}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold">{po.po_number}</span>
                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                              {po.status}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">Supplier: {po.supplier_name}</p>
                          <p className="text-sm font-medium">{po.currency} {po.total_amount?.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedIncoterm}
                            onChange={(e) => setSelectedIncoterm(e.target.value)}
                            className="bg-background border border-border rounded px-3 py-2 text-sm"
                          >
                            <option value="">Select Incoterm</option>
                            <optgroup label="LOCAL">
                              {routingOptions.local_terms?.map(term => (
                                <option key={term} value={term}>{term}</option>
                              ))}
                            </optgroup>
                            <optgroup label="IMPORT">
                              {routingOptions.import_terms?.map(term => (
                                <option key={term} value={term}>{term}</option>
                              ))}
                            </optgroup>
                          </select>
                          <Button 
                            size="sm" 
                            onClick={() => handleRoutePO(po.id, selectedIncoterm)}
                            disabled={!selectedIncoterm}
                            className="bg-blue-500 hover:bg-blue-600"
                          >
                            Route
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Routing History Tab */}
          {activeTab === 'routed' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Routing History</h2>
              {routingRecords.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No routing records yet</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {routingRecords.map((record) => (
                    <div key={record.id} className="glass p-4 rounded-lg border border-border" data-testid={`routing-${record.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {getRouteIcon(record.route)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{record.po_number}</span>
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                record.routing_type === 'LOCAL' ? 'bg-blue-500/20 text-blue-400' : 'bg-cyan-500/20 text-cyan-400'
                              }`}>
                                {record.incoterm}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{record.route}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            record.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {record.status}
                          </span>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(record.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LogisticsPage;
