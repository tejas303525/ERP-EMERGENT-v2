import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import api from '../../lib/api';

export default function GccByRoadCosting({ costing, quotation, onUpdate }) {
  const [jobOrder, setJobOrder] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);

  const [costs, setCosts] = useState({
    transportation_rate: costing?.transportation_rate || 0,
    transportation_units: costing?.transportation_units || 1,
    transportation_total: costing?.transportation_total || 0,

    border_charges_rate: costing?.border_charges_rate || 0,
    border_charges_units: costing?.border_charges_units || 1,
    border_charges_total: costing?.border_charges_total || 0,

    // MOFA (added between Border Charges and RAK Chamber)
    mofa_rate: costing?.mofa_rate || 0,
    mofa_units: costing?.mofa_units || 1,
    mofa_total: costing?.mofa_total || 0,

    rak_chamber_rate: costing?.rak_chamber_rate || 0,
    rak_chamber_units: costing?.rak_chamber_units || 1,
    rak_chamber_total: costing?.rak_chamber_total || 0,

    epda_rate: costing?.epda_rate || 0,
    epda_units: costing?.epda_units || 1,
    epda_total: costing?.epda_total || 0,

    sira_rate: costing?.sira_rate || 0,
    sira_units: costing?.sira_units || 1,
    sira_total: costing?.sira_total || 0,

    moh_rate: costing?.moh_rate || 0,
    moh_units: costing?.moh_units || 1,
    moh_total: costing?.moh_total || 0,

    certificate_of_origin_rate: costing?.certificate_of_origin_rate || 0,
    certificate_of_origin_units: costing?.certificate_of_origin_units || 1,
    certificate_of_origin_total: costing?.certificate_of_origin_total || 0,

    steel_drum_210_reconditioned_rate: costing?.steel_drum_210_reconditioned_rate || 39.0,
    steel_drum_210_reconditioned_units: costing?.steel_drum_210_reconditioned_units || 0,
    steel_drum_210_reconditioned_total: costing?.steel_drum_210_reconditioned_total || 0,

    steel_drum_210_new_rate: costing?.steel_drum_210_new_rate || 61.0,
    steel_drum_210_new_units: costing?.steel_drum_210_new_units || 0,
    steel_drum_210_new_total: costing?.steel_drum_210_new_total || 0,

    hdpe_drum_210_reconditioned_rate: costing?.hdpe_drum_210_reconditioned_rate || 40.0,
    hdpe_drum_210_reconditioned_units: costing?.hdpe_drum_210_reconditioned_units || 0,
    hdpe_drum_210_reconditioned_total: costing?.hdpe_drum_210_reconditioned_total || 0,

    hdpe_drum_210_new_rate: costing?.hdpe_drum_210_new_rate || 52.0,
    hdpe_drum_210_new_units: costing?.hdpe_drum_210_new_units || 0,
    hdpe_drum_210_new_total: costing?.hdpe_drum_210_new_total || 0,

    hdpe_drum_250_new_rate: costing?.hdpe_drum_250_new_rate || 70.0,
    hdpe_drum_250_new_units: costing?.hdpe_drum_250_new_units || 0,
    hdpe_drum_250_new_total: costing?.hdpe_drum_250_new_total || 0,

    open_top_drum_210_reconditioned_rate: costing?.open_top_drum_210_reconditioned_rate || 53.0,
    open_top_drum_210_reconditioned_units: costing?.open_top_drum_210_reconditioned_units || 0,
    open_top_drum_210_reconditioned_total: costing?.open_top_drum_210_reconditioned_total || 0,

    ibc_rate: costing?.ibc_rate || 340.0,
    ibc_units: costing?.ibc_units || 0,
    ibc_total: costing?.ibc_total || 0,

    flexi_rate: costing?.flexi_rate || 1010.63,
    flexi_units: costing?.flexi_units || 0,
    flexi_total: costing?.flexi_total || 0,

    pallets_rate: costing?.pallets_rate || 22.0,
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

  // Fetch job order so finance can see reference
  useEffect(() => {
    const fetchJobOrder = async () => {
      if (!quotation?.id) return;

      setLoadingJob(true);
      try {
        const salesOrdersRes = await api.get('/sales-orders', {
          params: { quotation_id: quotation.id },
        });

        if (salesOrdersRes.data?.length > 0) {
          const salesOrder = salesOrdersRes.data[0];
          const jobOrdersRes = await api.get('/job-orders', {
            params: { sales_order_id: salesOrder.id },
          });

          if (jobOrdersRes.data?.data?.length > 0) {
            setJobOrder(jobOrdersRes.data.data[0]);
          } else if (Array.isArray(jobOrdersRes.data) && jobOrdersRes.data.length > 0) {
            setJobOrder(jobOrdersRes.data[0]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch job order for GCC-by-road costing:', error);
      } finally {
        setLoadingJob(false);
      }
    };

    fetchJobOrder();
  }, [quotation?.id]);

  // Initialise from existing costing if present (prefer saved custom_breakdown)
  useEffect(() => {
    if (costing?.custom_breakdown) {
      setCosts((prev) => ({ ...prev, ...costing.custom_breakdown }));
    } else if (costing) {
      setCosts((prev) => ({ ...prev, ...costing }));
    }
  }, [costing]);

  // Try to auto-fill KG per drum/ctn from quotation when packaged
  useEffect(() => {
    if (!costs.kg_per_drum_ctn && quotation?.items?.length > 0) {
      const item = quotation.items[0];
      const netKg = item.net_weight_kg || item.net_weight || null;
      if (netKg) {
        setCosts((prev) => ({ ...prev, kg_per_drum_ctn: prev.kg_per_drum_ctn || netKg }));
      }
    }
  }, [quotation, costs.kg_per_drum_ctn]);

  const handleChange = (field, value) => {
    const newCosts = { ...costs, [field]: value };

    // Auto-calc totals for charges
    if (field.includes('_rate') || field.includes('_units')) {
      const baseField = field.replace('_rate', '').replace('_units', '');
      const rate = newCosts[`${baseField}_rate`] || 0;
      const units = newCosts[`${baseField}_units`] || 0;
      newCosts[`${baseField}_total`] = rate * units;
    }

    // Auto-calc loaded weight in MT from drums/CTN and KG per drum/CTN
    // Auto-calculate Loaded Weight in MT from Drum/CTN and KG/Drum&CTN
    // Handle both single product (legacy) and multi-product fields
    if (field === 'drum_ctn' || field === 'kg_per_drum_ctn') {
      const drums = newCosts.drum_ctn || 0;
      const kgPerDrum = newCosts.kg_per_drum_ctn || 0;
      if (drums > 0 && kgPerDrum > 0) {
        newCosts.loaded_weight_mt = (drums * kgPerDrum) / 1000; // KG → MT
      }
    }
    
    // Handle product-specific fields (indexed by item index)
    if (field.startsWith('drum_ctn_') || field.startsWith('kg_per_drum_ctn_')) {
      const itemIdx = field.split('_').pop();
      const drumCtn = newCosts[`drum_ctn_${itemIdx}`] || 0;
      const kgPerDrum = newCosts[`kg_per_drum_ctn_${itemIdx}`] || 0;
      if (drumCtn > 0 && kgPerDrum > 0) {
        newCosts[`loaded_weight_mt_${itemIdx}`] = (drumCtn * kgPerDrum) / 1000;
      }
      
      // Recalculate totals across all products
      const items = quotation?.items || [];
      let totalMT = 0;
      items.forEach((_, idx) => {
        const itemDrumCtn = newCosts[`drum_ctn_${idx}`] || newCosts.drum_ctn || 0;
        const itemKgPerDrum = newCosts[`kg_per_drum_ctn_${idx}`] || newCosts.kg_per_drum_ctn || 0;
        if (itemDrumCtn > 0 && itemKgPerDrum > 0) {
          totalMT += (itemDrumCtn * itemKgPerDrum) / 1000;
        }
      });
      newCosts.loaded_weight_mt = totalMT;
    }

    // Recalculate total charges in AED
    const chargeFields = [
      'transportation',
      'border_charges',
      'mofa',
      'rak_chamber',
      'epda',
      'sira',
      'moh',
      'certificate_of_origin',
      'steel_drum_210_reconditioned',
      'steel_drum_210_new',
      'hdpe_drum_210_reconditioned',
      'hdpe_drum_210_new',
      'hdpe_drum_250_new',
      'open_top_drum_210_reconditioned',
      'ibc',
      'flexi',
      'pallets',
    ];

    let totalAED = 0;
    chargeFields.forEach((key) => {
      totalAED += newCosts[`${key}_total`] || 0;
    });
    newCosts.total_charges_aed = totalAED;

    // USD conversion + cost per MT
    const rateUsd = newCosts.usd_conversion || 3.675;
    newCosts.total_charges_usd = rateUsd ? totalAED / rateUsd : 0;

    if (newCosts.loaded_weight_mt > 0) {
      newCosts.cost_per_mt = newCosts.total_charges_usd / newCosts.loaded_weight_mt;
    } else {
      newCosts.cost_per_mt = 0;
    }

    // Export shipment charges per MT always follows Product & Weight cost per MT
    newCosts.export_shipment_charges_per_mt = newCosts.cost_per_mt || 0;

    // Total cost (per MT) = product cost per MT + export shipment charges per MT
    newCosts.total_cost =
      (newCosts.product_cost || 0) + (newCosts.export_shipment_charges_per_mt || 0);

    // Net profit / loss
    newCosts.net_profit_loss = (newCosts.sales_price || 0) - (newCosts.total_cost || 0);

    setCosts(newCosts);
    if (onUpdate) onUpdate(newCosts);
  };

  const charges = [
    { key: 'transportation', label: 'Transportation', field: 'transportation' },
    { key: 'border_charges', label: 'Border Charges', field: 'border_charges' },
    { key: 'mofa', label: 'MOFA', field: 'mofa' },
    { key: 'rak_chamber', label: 'RAK Chamber', field: 'rak_chamber' },
    { key: 'epda', label: 'EPDA', field: 'epda' },
    { key: 'sira', label: 'SIRA', field: 'sira' },
    { key: 'moh', label: 'MOH', field: 'moh' },
    { key: 'certificate_of_origin', label: 'Certificate of Origin', field: 'certificate_of_origin' },
  ];

  const packagingCharges = [
    { key: 'steel_drum_210_reconditioned', label: 'Steel Drum 210 Ltr-Reconditioned', field: 'steel_drum_210_reconditioned', defaultRate: 39.0 },
    { key: 'steel_drum_210_new', label: 'Steel Drum 210 Ltr-New', field: 'steel_drum_210_new', defaultRate: 61.0 },
    { key: 'hdpe_drum_210_reconditioned', label: 'HDPE Drum 210 Ltr-Reconditioned', field: 'hdpe_drum_210_reconditioned', defaultRate: 40.0 },
    { key: 'hdpe_drum_210_new', label: 'HDPE Drum 210 Ltr-New', field: 'hdpe_drum_210_new', defaultRate: 52.0 },
    { key: 'hdpe_drum_250_new', label: 'HDPE Drum 250 Ltr-New', field: 'hdpe_drum_250_new', defaultRate: 70.0 },
    { key: 'open_top_drum_210_reconditioned', label: 'Open Top Drum 210 Ltr-Reconditioned', field: 'open_top_drum_210_reconditioned', defaultRate: 53.0 },
    { key: 'ibc', label: 'IBC', field: 'ibc', defaultRate: 340.0 },
    { key: 'flexi', label: 'Flexi', field: 'flexi', defaultRate: 1010.63 },
    { key: 'pallets', label: 'Pallets', field: 'pallets', defaultRate: 22.0 },
  ];

  return (
    <div className="space-y-6">
      {/* Job Order */}
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
                {jobOrder.product_name || quotation?.items?.[0]?.product_name || 'N/A'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No job order linked</p>
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
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left text-xs font-medium">Description</th>
                  <th className="p-2 text-right text-xs font-medium">Rate</th>
                  <th className="p-2 text-right text-xs font-medium">No. of Units/Containers</th>
                  <th className="p-2 text-right text-xs font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.key} className="border-b border-border/40">
                    <td className="p-2">{charge.label}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        className="text-right"
                        step="0.01"
                        value={costs[`${charge.field}_rate`] ?? 0}
                        onChange={(e) =>
                          handleChange(`${charge.field}_rate`, parseFloat(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        className="text-right"
                        step="0.01"
                        value={costs[`${charge.field}_units`] ?? 1}
                        onChange={(e) =>
                          handleChange(`${charge.field}_units`, parseFloat(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="p-2 text-right font-mono">
                      {(costs[`${charge.field}_total`] || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {packagingCharges.map((charge) => (
                  <tr key={charge.key} className="border-b border-border/40">
                    <td className="p-2">{charge.label}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        className="text-right"
                        step="0.01"
                        value={costs[`${charge.field}_rate`] ?? charge.defaultRate}
                        onChange={(e) =>
                          handleChange(`${charge.field}_rate`, parseFloat(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        className="text-right"
                        step="0.01"
                        value={costs[`${charge.field}_units`] ?? 0}
                        onChange={(e) =>
                          handleChange(`${charge.field}_units`, parseFloat(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="p-2 text-right font-mono">
                      {(costs[`${charge.field}_total`] || 0).toFixed(2)}
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
          <CardTitle className="text-sm">Total Charges Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Total charges in AED</Label>
            <Input
              type="number"
              className="w-32 text-right bg-muted font-mono"
              readOnly
              value={(costs.total_charges_aed || 0).toFixed(2)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>$ Conversion</Label>
            <Input
              type="number"
              className="w-32 text-right"
              step="0.001"
              value={costs.usd_conversion || 3.675}
              onChange={(e) =>
                handleChange('usd_conversion', parseFloat(e.target.value) || 3.675)
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Total charges in $</Label>
            <Input
              type="number"
              className="w-32 text-right bg-muted font-mono"
              readOnly
              value={(costs.total_charges_usd || 0).toFixed(2)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table 3: Product / Weight */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Product & Weight</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {quotation?.items && quotation.items.length > 0 ? (
            <>
              {quotation.items.map((item, itemIdx) => (
                <div key={itemIdx} className="border border-border rounded-lg p-4 space-y-3 bg-muted/10">
                  <div className="font-semibold text-sm mb-2 text-blue-400">{item.product_name || item.name}</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Product Name</Label>
                      <Input
                        type="text"
                        value={
                          costs[`product_name_${itemIdx}`] ||
                          item.product_name ||
                          item.name ||
                          ''
                        }
                        onChange={(e) => handleChange(`product_name_${itemIdx}`, e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Drum/CTN (for bulk enter 1)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={costs[`drum_ctn_${itemIdx}`] !== undefined ? costs[`drum_ctn_${itemIdx}`] : (itemIdx === 0 ? (costs.drum_ctn || 0) : 0)}
                        onChange={(e) => handleChange(`drum_ctn_${itemIdx}`, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>KG / Drum & CTN</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={costs[`kg_per_drum_ctn_${itemIdx}`] !== undefined ? costs[`kg_per_drum_ctn_${itemIdx}`] : (itemIdx === 0 ? (costs.kg_per_drum_ctn || 0) : 0)}
                        onChange={(e) =>
                          handleChange(`kg_per_drum_ctn_${itemIdx}`, parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Loaded Weight in MT</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      step="0.001"
                      value={costs[`loaded_weight_mt_${itemIdx}`] !== undefined ? costs[`loaded_weight_mt_${itemIdx}`] : (costs[`drum_ctn_${itemIdx}`] !== undefined ? ((costs[`drum_ctn_${itemIdx}`] || 0) * (costs[`kg_per_drum_ctn_${itemIdx}`] || 0)) / 1000 : (itemIdx === 0 ? (costs.loaded_weight_mt || 0) : 0))}
                      onChange={(e) =>
                        handleChange(`loaded_weight_mt_${itemIdx}`, parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                </div>
              ))}
              {/* Overall totals */}
              <div className="border-t border-border pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Total Loaded Weight in MT - All Products</Label>
                  <Input
                    type="number"
                    className="w-32 text-right bg-muted font-mono font-semibold"
                    step="0.001"
                    readOnly
                    value={costs.loaded_weight_mt?.toFixed(3) || '0.000'}
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <Label className="font-semibold">Cost per MT ($)</Label>
                  <Input
                    type="number"
                    className="w-32 text-right bg-muted font-mono font-semibold"
                    readOnly
                    value={(costs.cost_per_mt || 0).toFixed(2)}
                  />
                </div>
              </div>
            </>
          ) : (
            // Fallback to single product display
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Product Name</Label>
                  <Input
                    type="text"
                    value={
                      costs.product_name ||
                      quotation?.items?.[0]?.product_name ||
                      quotation?.items?.[0]?.name ||
                      ''
                    }
                    onChange={(e) => handleChange('product_name', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Drum/CTN (for bulk enter 1)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costs.drum_ctn || 0}
                    onChange={(e) => handleChange('drum_ctn', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>KG / Drum & CTN</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={costs.kg_per_drum_ctn || 0}
                    onChange={(e) =>
                      handleChange('kg_per_drum_ctn', parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Loaded Weight in MT</Label>
                <Input
                  type="number"
                  className="w-32 text-right"
                  step="0.001"
                  value={costs.loaded_weight_mt || 0}
                  onChange={(e) =>
                    handleChange('loaded_weight_mt', parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Cost per MT ($)</Label>
                <Input
                  type="number"
                  className="w-32 text-right bg-muted font-mono"
                  readOnly
                  value={(costs.cost_per_mt || 0).toFixed(2)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table 4: Cost & Margin Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost & Margin Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-1">
              <Label>Product (Cost/MT)</Label>
              <Input
                type="number"
                step="0.01"
                value={costs.product_cost || 0}
                onChange={(e) =>
                  handleChange('product_cost', parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
               <Label>Export Shipment Charges (from Cost/MT)</Label>
              <Input
                type="number"
                step="0.01"
                value={costs.export_shipment_charges || costs.cost_per_mt || 0}
                onChange={(e) =>
                  handleChange(
                    'export_shipment_charges',
                    parseFloat(e.target.value) || 0,
                  )
                }
              />
            </div>
            <div>
              <Label>Export Shipment Charges per MT</Label>
              <Input
                type="number"
                className="bg-muted font-mono"
                readOnly
                value={(costs.export_shipment_charges_per_mt || 0).toFixed(2)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Label className="font-semibold">Total Cost</Label>
            <Input
              type="number"
              className="w-32 text-right bg-muted font-mono font-bold"
              readOnly
              value={(costs.total_cost || 0).toFixed(2)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="font-semibold">Sales Price</Label>
            <Input
              type="number"
              className="w-32 text-right font-mono"
              step="0.01"
              value={costs.sales_price || quotation?.total || 0}
              onChange={(e) =>
                handleChange('sales_price', parseFloat(e.target.value) || 0)
              }
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Label
              className={`font-bold ${
                (costs.net_profit_loss || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              Net Profit / -Loss
            </Label>
            <Input
              type="number"
              className={`w-32 text-right font-mono font-bold bg-muted ${
                (costs.net_profit_loss || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
              readOnly
              value={(costs.net_profit_loss || 0).toFixed(2)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


