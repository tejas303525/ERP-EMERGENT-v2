import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import api from '../../lib/api';

export default function LocalBulkToPlantCosting({ costing, quotation, onUpdate }) {
  const [jobOrder, setJobOrder] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [costs, setCosts] = useState({
    transportation_from_to: costing?.transportation_from_to || '',
    transportation_rate: costing?.transportation_rate || 1800.00,
    transportation_units: costing?.transportation_units || 0,
    transportation_total: costing?.transportation_total || 0,
    bill_of_entry_rate: costing?.bill_of_entry_rate || 205.00,
    bill_of_entry_units: costing?.bill_of_entry_units || 0,
    bill_of_entry_total: costing?.bill_of_entry_total || 0,
    epda_rate: costing?.epda_rate || 0,
    epda_units: costing?.epda_units || 0,
    epda_total: costing?.epda_total || 0,
    sira_rate: costing?.sira_rate || 0,
    sira_units: costing?.sira_units || 0,
    sira_total: costing?.sira_total || 0,
    mofaic_rate: costing?.mofaic_rate || 0,
    mofaic_units: costing?.mofaic_units || 0,
    mofaic_total: costing?.mofaic_total || 0,
    duty_exemption_rate: costing?.duty_exemption_rate || 0,
    duty_exemption_units: costing?.duty_exemption_units || 0,
    duty_exemption_total: costing?.duty_exemption_total || 0,
    steel_drum_210_reconditioned_rate: costing?.steel_drum_210_reconditioned_rate || 39.00,
    steel_drum_210_reconditioned_units: costing?.steel_drum_210_reconditioned_units || 0,
    steel_drum_210_reconditioned_total: costing?.steel_drum_210_reconditioned_total || 0,
    steel_drum_210_new_rate: costing?.steel_drum_210_new_rate || 61.00,
    steel_drum_210_new_units: costing?.steel_drum_210_new_units || 0,
    steel_drum_210_new_total: costing?.steel_drum_210_new_total || 0,
    hdpe_drum_210_reconditioned_rate: costing?.hdpe_drum_210_reconditioned_rate || 40.00,
    hdpe_drum_210_reconditioned_units: costing?.hdpe_drum_210_reconditioned_units || 0,
    hdpe_drum_210_reconditioned_total: costing?.hdpe_drum_210_reconditioned_total || 0,
    hdpe_drum_210_new_rate: costing?.hdpe_drum_210_new_rate || 52.00,
    hdpe_drum_210_new_units: costing?.hdpe_drum_210_new_units || 0,
    hdpe_drum_210_new_total: costing?.hdpe_drum_210_new_total || 0,
    hdpe_drum_250_new_rate: costing?.hdpe_drum_250_new_rate || 70.00,
    hdpe_drum_250_new_units: costing?.hdpe_drum_250_new_units || 0,
    hdpe_drum_250_new_total: costing?.hdpe_drum_250_new_total || 0,
    open_top_drum_210_reconditioned_rate: costing?.open_top_drum_210_reconditioned_rate || 53.00,
    open_top_drum_210_reconditioned_units: costing?.open_top_drum_210_reconditioned_units || 0,
    open_top_drum_210_reconditioned_total: costing?.open_top_drum_210_reconditioned_total || 0,
    ibc_rate: costing?.ibc_rate || 340.00,
    ibc_units: costing?.ibc_units || 0,
    ibc_total: costing?.ibc_total || 0,
    pallets_rate: costing?.pallets_rate || 22.00,
    pallets_units: costing?.pallets_units || 0,
    pallets_total: costing?.pallets_total || 0,
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
    shipment_charges: costing?.shipment_charges || 0,
    shipment_charges_per_mt: costing?.shipment_charges_per_mt || 0,
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
    
    // Auto-calculate totals for charge items
    if (field.includes('_rate') || field.includes('_units')) {
      const baseField = field.replace('_rate', '').replace('_units', '');
      const rate = newCosts[`${baseField}_rate`] || 0;
      const units = newCosts[`${baseField}_units`] || 0;
      newCosts[`${baseField}_total`] = rate * units;
    }
    
  // Auto-calculate loaded weight in MT from drums/CTNs and KG per Drum&CTN
  if (field === 'drum_ctn' || field === 'kg_per_drum_ctn') {
    const drumCtn = newCosts.drum_ctn || 0;
    const kgPerDrumCtn = newCosts.kg_per_drum_ctn || 0;
    // Convert KG to MT (1000 KG = 1 MT)
    newCosts.loaded_weight_mt = (drumCtn * kgPerDrumCtn) / 1000;
  }
  
    // Calculate total charges in AED (including all charges and packaging)
    const totalAED = 
      (newCosts.transportation_total || 0) +
      (newCosts.bill_of_entry_total || 0) +
      (newCosts.epda_total || 0) +
      (newCosts.sira_total || 0) +
      (newCosts.mofaic_total || 0) +
      (newCosts.duty_exemption_total || 0) +
      (newCosts.steel_drum_210_reconditioned_total || 0) +
      (newCosts.steel_drum_210_new_total || 0) +
      (newCosts.hdpe_drum_210_reconditioned_total || 0) +
      (newCosts.hdpe_drum_210_new_total || 0) +
      (newCosts.hdpe_drum_250_new_total || 0) +
      (newCosts.open_top_drum_210_reconditioned_total || 0) +
      (newCosts.ibc_total || 0) +
      (newCosts.pallets_total || 0);
    newCosts.total_charges_aed = totalAED;
    
    // Calculate total charges in USD
    newCosts.total_charges_usd = totalAED / (newCosts.usd_conversion || 3.675);
    
    // Calculate cost per MT
    if (newCosts.loaded_weight_mt > 0) {
      newCosts.cost_per_mt = newCosts.total_charges_usd / newCosts.loaded_weight_mt;
    } else {
      newCosts.cost_per_mt = 0;
    }
    
    // Calculate shipment charges per MT
    if (newCosts.loaded_weight_mt > 0) {
      newCosts.shipment_charges_per_mt = newCosts.shipment_charges / newCosts.loaded_weight_mt;
    } else {
      newCosts.shipment_charges_per_mt = 0;
    }
    
    // Calculate total cost = Product Cost + Cost Per MT (from Table 3)
    newCosts.total_cost = (newCosts.product_cost || 0) + (newCosts.cost_per_mt || 0);
    
    // Calculate net profit/loss
    newCosts.net_profit_loss = (newCosts.sales_price || 0) - newCosts.total_cost;
    
    setCosts(newCosts);
    if (onUpdate) {
      onUpdate(newCosts);
    }
  };

  const charges = [
    { key: 'transportation', label: 'Transportation from --- to ---', field: 'transportation' },
    { key: 'bill_of_entry', label: 'Bill of Entry', field: 'bill_of_entry' },
    { key: 'epda', label: 'EPDA', field: 'epda' },
    { key: 'sira', label: 'SIRA', field: 'sira' },
    { key: 'mofaic', label: 'MOFAIC', field: 'mofaic' },
    { key: 'duty_exemption', label: 'Duty Exemption', field: 'duty_exemption' },
  ];

  const packagingCharges = [
    { key: 'steel_drum_210_reconditioned', label: 'Steel Drum 210 Ltr-Reconditioned', field: 'steel_drum_210_reconditioned' },
    { key: 'steel_drum_210_new', label: 'Steel Drum 210 Ltr-New', field: 'steel_drum_210_new' },
    { key: 'hdpe_drum_210_reconditioned', label: 'HDPE Drum 210 Ltr-Reconditioned', field: 'hdpe_drum_210_reconditioned' },
    { key: 'hdpe_drum_210_new', label: 'HDPE Drum 210 Ltr-New', field: 'hdpe_drum_210_new' },
    { key: 'hdpe_drum_250_new', label: 'HDPE Drum 250 Ltr-New', field: 'hdpe_drum_250_new' },
    { key: 'open_top_drum_210_reconditioned', label: 'Open Top Drum 210 Ltr-Reconditioned', field: 'open_top_drum_210_reconditioned' },
    { key: 'ibc', label: 'IBC', field: 'ibc' },
    { key: 'pallets', label: 'Pallets', field: 'pallets' },
  ];

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
                {charges.map((charge, index) => (
                  <tr key={charge.key} className="border-b border-border/30">
                    <td className="p-2 font-mono text-xs">{index + 1}</td>
                    <td className="p-2">
                      {charge.key === 'transportation' ? (
                        <Input
                          type="text"
                          value={costs.transportation_from_to}
                          onChange={(e) => handleChange('transportation_from_to', e.target.value)}
                          placeholder="From --- to ---"
                          className="w-full"
                        />
                      ) : (
                        charge.label
                      )}
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={costs[`${charge.field}_rate`] || 0}
                        onChange={(e) => handleChange(`${charge.field}_rate`, parseFloat(e.target.value) || 0)}
                        className="text-right"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={costs[`${charge.field}_units`] || 0}
                        onChange={(e) => handleChange(`${charge.field}_units`, parseFloat(e.target.value) || 0)}
                        className="text-right"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2 text-right font-mono">
                      {costs[`${charge.field}_total`]?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
                {/* Packaging Charges */}
                {packagingCharges.map((charge, index) => (
                  <tr key={charge.key} className="border-b border-border/30">
                    <td className="p-2 font-mono text-xs">{charges.length + index + 1}</td>
                    <td className="p-2">{charge.label}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={costs[`${charge.field}_rate`] || 0}
                        onChange={(e) => handleChange(`${charge.field}_rate`, parseFloat(e.target.value) || 0)}
                        className="text-right"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={costs[`${charge.field}_units`] || 0}
                        onChange={(e) => handleChange(`${charge.field}_units`, parseFloat(e.target.value) || 0)}
                        className="text-right"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2 text-right font-mono">
                      {costs[`${charge.field}_total`]?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
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
          <div className="flex justify-between items-center">
            <Label>Product Name</Label>
            <Input
              type="text"
              value={costs.product_name || quotation?.items?.[0]?.product_name || ''}
              onChange={(e) => handleChange('product_name', e.target.value)}
              className="w-64"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>DRUM/CTN</Label>
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
            <div>
              <Label>Loaded Weight in MT</Label>
              <Input
                type="number"
                value={costs.loaded_weight_mt || 0}
                onChange={(e) => handleChange('loaded_weight_mt', parseFloat(e.target.value) || 0)}
                step="0.001"
              />
            </div>
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Product Cost</Label>
              <Input
                type="number"
                value={costs.product_cost || ''}
                onChange={(e) => handleChange('product_cost', parseFloat(e.target.value) || 0)}
                step="0.01"
                placeholder="800"
              />
            </div>
            <div>
              <Label>Drum/CTN</Label>
              <Input
                type="number"
                value={costs.product_cost_per_drum_ctn || ''}
                onChange={(e) => handleChange('product_cost_per_drum_ctn', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>Cost/MT</Label>
              <Input
                type="number"
                value={costs.product_cost_per_mt || ''}
                onChange={(e) => handleChange('product_cost_per_mt', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Shipment Charges</Label>
              <Input
                type="number"
              value={costs.shipment_charges || ''}
                onChange={(e) => handleChange('shipment_charges', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>Cost/MT</Label>
              <Input
                type="number"
              value={costs.cost_per_mt ? costs.cost_per_mt.toFixed(2) : ''}
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

