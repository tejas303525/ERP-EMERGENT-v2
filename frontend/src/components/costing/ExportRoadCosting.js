import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import api from '../../lib/api';

export default function ExportRoadCosting({ costing, quotation, onUpdate }) {
  const [jobOrder, setJobOrder] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [costs, setCosts] = useState({
    transportation_from_to: costing?.transportation_from_to || '',
    transportation_rate: costing?.transportation_rate || 0,
    transportation_units: costing?.transportation_units || 1,
    transportation_total: costing?.transportation_total || 0,
    boarder_charges_rate: costing?.boarder_charges_rate || 0,
    boarder_charges_units: costing?.boarder_charges_units || 1,
    boarder_charges_total: costing?.boarder_charges_total || 0,
    mofa_charge_rate: costing?.mofa_charge_rate || 0,
    mofa_charge_units: costing?.mofa_charge_units || 1,
    mofa_charge_total: costing?.mofa_charge_total || 0,
    rak_chamber_rate: costing?.rak_chamber_rate || 0,
    rak_chamber_units: costing?.rak_chamber_units || 1,
    rak_chamber_total: costing?.rak_chamber_total || 0,
    epda_rate: costing?.epda_rate || 0,
    epda_units: costing?.epda_units || 1,
    epda_total: costing?.epda_total || 0,
    sira_rate: costing?.sira_rate || 0,
    sira_units: costing?.sira_units || 0,
    sira_total: costing?.sira_total || 0,
    moh_rate: costing?.moh_rate || 0,
    moh_units: costing?.moh_units || 1,
    moh_total: costing?.moh_total || 0,
    certificate_of_origin_rate: costing?.certificate_of_origin_rate || 0,
    certificate_of_origin_units: costing?.certificate_of_origin_units || 0,
    certificate_of_origin_total: costing?.certificate_of_origin_total || 0,
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
    flexi_rate: costing?.flexi_rate || 1010.63,
    flexi_units: costing?.flexi_units || 0,
    flexi_total: costing?.flexi_total || 0,
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
    product_cost_per_mt: costing?.product_cost_per_mt || 0,
    export_shipment_charges: costing?.export_shipment_charges || 0,
    export_shipment_charges_per_mt: costing?.export_shipment_charges_per_mt || 0,
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
    
    // Calculate total charges in AED (including all charges and packaging)
    const totalAED = 
      (newCosts.transportation_total || 0) +
      (newCosts.boarder_charges_total || 0) +
      (newCosts.mofa_charge_total || 0) +
      (newCosts.rak_chamber_total || 0) +
      (newCosts.epda_total || 0) +
      (newCosts.sira_total || 0) +
      (newCosts.moh_total || 0) +
      (newCosts.certificate_of_origin_total || 0) +
      (newCosts.steel_drum_210_reconditioned_total || 0) +
      (newCosts.steel_drum_210_new_total || 0) +
      (newCosts.hdpe_drum_210_reconditioned_total || 0) +
      (newCosts.hdpe_drum_210_new_total || 0) +
      (newCosts.hdpe_drum_250_new_total || 0) +
      (newCosts.open_top_drum_210_reconditioned_total || 0) +
      (newCosts.ibc_total || 0) +
      (newCosts.flexi_total || 0) +
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
    
    // Calculate export shipment charges per MT
    if (newCosts.loaded_weight_mt > 0) {
      newCosts.export_shipment_charges_per_mt = newCosts.export_shipment_charges / newCosts.loaded_weight_mt;
    } else {
      newCosts.export_shipment_charges_per_mt = 0;
    }
    
    // Calculate total cost
    newCosts.total_cost = (newCosts.product_cost || 0) + (newCosts.export_shipment_charges || 0);
    
    // Calculate net profit/loss
    newCosts.net_profit_loss = (newCosts.sales_price || 0) - newCosts.total_cost;
    
    setCosts(newCosts);
    if (onUpdate) {
      onUpdate(newCosts);
    }
  };

  const charges = [
    { key: 'transportation', label: 'Transportation From --- to ---', field: 'transportation', defaultUnits: 1 },
    { key: 'boarder_charges', label: 'Boarder Charges', field: 'boarder_charges', defaultUnits: 1 },
    { key: 'mofa_charge', label: 'MOFA CHARGE', field: 'mofa_charge', defaultUnits: 1 },
    { key: 'rak_chamber', label: 'RAK CHAMBER', field: 'rak_chamber', defaultUnits: 1 },
    { key: 'epda', label: 'EPDA', field: 'epda', defaultUnits: 1 },
    { key: 'sira', label: 'SIRA', field: 'sira', defaultUnits: 0 },
    { key: 'moh', label: 'MOH', field: 'moh', defaultUnits: 1 },
    { key: 'certificate_of_origin', label: 'CERTIFICATE OF ORIGIN', field: 'certificate_of_origin', defaultUnits: 0 },
  ];

  const packagingCharges = [
    { key: 'steel_drum_210_reconditioned', label: 'Steel Drum 210 Ltr-Reconditioned', field: 'steel_drum_210_reconditioned', defaultRate: 39.00 },
    { key: 'steel_drum_210_new', label: 'Steel Drum 210 Ltr-New', field: 'steel_drum_210_new', defaultRate: 61.00 },
    { key: 'hdpe_drum_210_reconditioned', label: 'HDPE Drum 210 Ltr-Reconditioned', field: 'hdpe_drum_210_reconditioned', defaultRate: 40.00 },
    { key: 'hdpe_drum_210_new', label: 'HDPE Drum 210 Ltr-New', field: 'hdpe_drum_210_new', defaultRate: 52.00 },
    { key: 'hdpe_drum_250_new', label: 'HDPE Drum 250 Ltr-New', field: 'hdpe_drum_250_new', defaultRate: 70.00 },
    { key: 'open_top_drum_210_reconditioned', label: 'Open Top Drum 210 Ltr-Reconditioned', field: 'open_top_drum_210_reconditioned', defaultRate: 53.00 },
    { key: 'ibc', label: 'IBC', field: 'ibc', defaultRate: 340.00 },
    { key: 'flexi', label: 'Flexi', field: 'flexi', defaultRate: 1010.63 },
    { key: 'pallets', label: 'Pallets', field: 'pallets', defaultRate: 22.00 },
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
                        value={costs[`${charge.field}_units`] !== undefined ? costs[`${charge.field}_units`] : charge.defaultUnits}
                        onChange={(e) => handleChange(`${charge.field}_units`, parseFloat(e.target.value) || charge.defaultUnits)}
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
                        value={costs[`${charge.field}_rate`] !== undefined ? costs[`${charge.field}_rate`] : charge.defaultRate}
                        onChange={(e) => handleChange(`${charge.field}_rate`, parseFloat(e.target.value) || charge.defaultRate)}
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
              <Label>Product Cost</Label>
              <Input
                type="number"
                value={costs.product_cost || 0}
                onChange={(e) => handleChange('product_cost', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>Cost/MT</Label>
              <Input
                type="number"
                value={costs.product_cost_per_mt || 0}
                onChange={(e) => handleChange('product_cost_per_mt', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Export Shipment Charges</Label>
              <Input
                type="number"
                value={costs.export_shipment_charges || costs.total_charges_usd || 0}
                onChange={(e) => handleChange('export_shipment_charges', parseFloat(e.target.value) || 0)}
                step="0.01"
              />
            </div>
            <div>
              <Label>Cost/MT</Label>
              <Input
                type="number"
                value={costs.export_shipment_charges_per_mt?.toFixed(2) || '0.00'}
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

