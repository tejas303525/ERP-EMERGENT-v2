import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import api from '../../lib/api';

export default function LocalDrumToPlantCosting({ costing, quotation, onUpdate }) {
  const [jobOrder, setJobOrder] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [costs, setCosts] = useState({
    transportation_from_to: costing?.transportation_from_to || '',
    transportation_rate: costing?.transportation_rate || 0,
    transportation_units: costing?.transportation_units || 1,
    transportation_total: costing?.transportation_total || 0,
    total_charges_aed: costing?.total_charges_aed || 0,
    usd_conversion: costing?.usd_conversion || 3.675,
    total_charges_usd: costing?.total_charges_usd || 0,
    product_name: costing?.product_name || '',
    drum_ctn: costing?.drum_ctn || 0,
    kg_per_drum_ctn: costing?.kg_per_drum_ctn || 0,
    loaded_weight_mt: costing?.loaded_weight_mt || 0,
    cost_per_mt: costing?.cost_per_mt || 0,
    product_cost: costing?.product_cost || 0,
    product_cost_per_drum_ctn: costing?.product_cost_per_drum_ctn || 0,
    product_cost_per_mt: costing?.product_cost_per_mt || 0,
    import_shipment_charges: costing?.import_shipment_charges || 0,
    import_shipment_charges_per_mt: costing?.import_shipment_charges_per_mt || 0,
    total_cost: costing?.total_cost || 0,
    sales_price: costing?.sales_price || quotation?.total || 0,
    net_profit_loss: costing?.net_profit_loss || 0,
  });

  // Fetch job order from quotation's sales order
  useEffect(() => {
    const fetchJobOrder = async () => {
      if (!quotation?.id) return;
      
      setLoadingJob(true);
      try {
        // First get sales order from quotation
        const salesOrdersRes = await api.get('/sales-orders', {
          params: { quotation_id: quotation.id }
        });
        
        if (salesOrdersRes.data?.length > 0) {
          const salesOrder = salesOrdersRes.data[0];
          
          // Then get job order from sales order
          const jobOrdersRes = await api.get('/job-orders', {
            params: { sales_order_id: salesOrder.id }
          });
          
          if (jobOrdersRes.data?.data?.length > 0) {
            setJobOrder(jobOrdersRes.data.data[0]);
          } else if (Array.isArray(jobOrdersRes.data) && jobOrdersRes.data.length > 0) {
            setJobOrder(jobOrdersRes.data[0]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch job order:', error);
      } finally {
        setLoadingJob(false);
      }
    };

    fetchJobOrder();
  }, [quotation?.id]);

  useEffect(() => {
    if (costing) {
      setCosts(prev => ({ ...prev, ...costing }));
    }
  }, [costing]);

  const handleChange = (field, value) => {
    const newCosts = { ...costs, [field]: value };
    
  // Auto-calculate transportation total
  if (field === 'transportation_rate' || field === 'transportation_units') {
    const rate = newCosts.transportation_rate || 0;
    const units = newCosts.transportation_units || 0;
    newCosts.transportation_total = rate * units;
  }

  // Auto-calculate loaded weight in MT from drums and KG per drum
  if (field === 'drum_ctn' || field === 'kg_per_drum_ctn') {
    const drums = newCosts.drum_ctn || 0;
    const kgPerDrum = newCosts.kg_per_drum_ctn || 0;
    if (drums > 0 && kgPerDrum > 0) {
      newCosts.loaded_weight_mt = (drums * kgPerDrum) / 1000; // KG → MT
    }
  }
  
  // Calculate total charges in AED (only transportation for this type)
  newCosts.total_charges_aed = newCosts.transportation_total || 0;
  
  // Calculate total charges in USD
  newCosts.total_charges_usd = newCosts.total_charges_aed / (newCosts.usd_conversion || 3.675);
  
  // Calculate cost per MT from Product & Weight
  if (newCosts.loaded_weight_mt > 0) {
    newCosts.cost_per_mt = newCosts.total_charges_usd / newCosts.loaded_weight_mt;
  } else {
    newCosts.cost_per_mt = 0;
  }

  // Import shipment charge should show Cost Per MT from Table 3
  newCosts.import_shipment_charges = newCosts.cost_per_mt || 0;
  // Cost/MT for import shipment is the same per‑MT value
  newCosts.import_shipment_charges_per_mt = newCosts.import_shipment_charges;
    
    // Calculate total cost
    newCosts.total_cost = (newCosts.product_cost || 0) + (newCosts.import_shipment_charges || 0);
    
    // Calculate net profit/loss
    newCosts.net_profit_loss = (newCosts.sales_price || 0) - newCosts.total_cost;
    
    setCosts(newCosts);
    if (onUpdate) {
      onUpdate(newCosts);
    }
  };

  return (
    <div className="space-y-6">
      {/* Job Order Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Job Order</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingJob ? (
            <p className="text-sm text-muted-foreground">Loading job order...</p>
          ) : jobOrder ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{jobOrder.job_number || 'N/A'}</Badge>
              <span className="text-sm text-muted-foreground">
                {jobOrder.product_name || 'N/A'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No job order found</p>
          )}
        </CardContent>
      </Card>

      {/* Table 1: Charges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Table 1: Charges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-2 text-left text-xs font-medium">Sr. No.</th>
                  <th className="p-2 text-left text-xs font-medium">Description</th>
                  <th className="p-2 text-right text-xs font-medium">Rate</th>
                  <th className="p-2 text-right text-xs font-medium">No. of Units/Container</th>
                  <th className="p-2 text-right text-xs font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="p-2 font-mono text-xs">1</td>
                  <td className="p-2">
                    <Input
                      type="text"
                      value={costs.transportation_from_to}
                      onChange={(e) => handleChange('transportation_from_to', e.target.value)}
                      placeholder="From --- to ---"
                      className="w-full"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={costs.transportation_rate || 0}
                      onChange={(e) => handleChange('transportation_rate', parseFloat(e.target.value) || 0)}
                      className="text-right"
                      step="0.01"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={costs.transportation_units || 1}
                      onChange={(e) => handleChange('transportation_units', parseFloat(e.target.value) || 1)}
                      className="text-right"
                      step="0.01"
                    />
                  </td>
                  <td className="p-2 text-right font-mono">
                    {costs.transportation_total?.toFixed(2) || '0.00'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Table 2: Total Charges Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Table 2: Total Charges Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Total charges in AED</Label>
            <Input
              type="number"
              value={costs.total_charges_aed || 0}
              readOnly
              className="w-32 text-right bg-muted font-mono"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>$ Conversion</Label>
            <Input
              type="number"
              value={costs.usd_conversion || 3.675}
              onChange={(e) => handleChange('usd_conversion', parseFloat(e.target.value) || 3.675)}
              className="w-32 text-right"
              step="0.001"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Total charges in $</Label>
            <Input
              type="number"
              value={costs.total_charges_usd?.toFixed(2) || '0.00'}
              readOnly
              className="w-32 text-right bg-muted font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table 3: Product Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Table 3: Product Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>PRODUCT NAME</Label>
              <Input
                type="text"
                value={costs.product_name || quotation?.items?.[0]?.product_name || ''}
                onChange={(e) => handleChange('product_name', e.target.value)}
              />
            </div>
            <div>
              <Label>Drum/CTN</Label>
              <Input
                type="number"
                value={costs.drum_ctn || 0}
                onChange={(e) => handleChange('drum_ctn', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>KG/ Drum&CTN</Label>
              <Input
                type="number"
                value={costs.kg_per_drum_ctn || 0}
                onChange={(e) => handleChange('kg_per_drum_ctn', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <Label>Loaded Weight in MT</Label>
            <Input
              type="number"
              value={costs.loaded_weight_mt || 0}
              onChange={(e) => handleChange('loaded_weight_mt', parseFloat(e.target.value) || 0)}
              className="w-32 text-right"
              step="0.001"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Cost Per MT ($)</Label>
            <Input
              type="number"
              value={costs.cost_per_mt?.toFixed(2) || '0.00'}
              readOnly
              className="w-32 text-right bg-muted font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table 4: Cost and Profit Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Table 4: Cost and Profit Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Product (Cost/MT)</Label>
              <Input
                type="number"
                value={costs.product_cost || 0}
                onChange={(e) => handleChange('product_cost', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>Cost/MT (from Product Details)</Label>
              <Input
                type="number"
                value={costs.cost_per_mt?.toFixed(2) || '0.00'}
                readOnly
                className="bg-muted font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Import Shipment Charges</Label>
              <Input
                type="number"
                value={costs.import_shipment_charges || costs.cost_per_mt || 0}
                onChange={(e) => handleChange('import_shipment_charges', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>Cost/MT</Label>
              <Input
                type="number"
                value={costs.import_shipment_charges_per_mt?.toFixed(2) || '0.00'}
                readOnly
                className="bg-muted font-mono"
              />
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <Label className="font-semibold">Total Cost</Label>
            <Input
              type="number"
              value={costs.total_cost?.toFixed(2) || '0.00'}
              readOnly
              className="w-32 text-right bg-muted font-mono font-bold"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label className="font-semibold">Sales Price</Label>
            <Input
              type="number"
              value={costs.sales_price || quotation?.total || 0}
              onChange={(e) => handleChange('sales_price', parseFloat(e.target.value) || 0)}
              className="w-32 text-right font-mono"
              step="0.01"
            />
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <Label className={`font-bold ${costs.net_profit_loss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              Net Profit / -Loss
            </Label>
            <Input
              type="number"
              value={costs.net_profit_loss?.toFixed(2) || '0.00'}
              readOnly
              className={`w-32 text-right font-mono font-bold bg-muted ${
                costs.net_profit_loss >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

