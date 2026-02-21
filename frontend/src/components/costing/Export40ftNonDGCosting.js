import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import api from '../../lib/api';

export default function Export40ftNonDGCosting({ costing, quotation, onUpdate }) {
  const [jobOrder, setJobOrder] = useState(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [costs, setCosts] = useState({
    transportation_rate: costing?.transportation_rate || 375.00,
    transportation_units: costing?.transportation_units || 5,
    transportation_total: costing?.transportation_total || 1875.00,
    tluc_rate: costing?.tluc_rate || 314.00,
    tluc_units: costing?.tluc_units || 5,
    tluc_total: costing?.tluc_total || 1570.00,
    thc_40ft_non_dg_rate: costing?.thc_40ft_non_dg_rate || 1100.00,
    thc_40ft_non_dg_units: costing?.thc_40ft_non_dg_units || 5,
    thc_40ft_non_dg_total: costing?.thc_40ft_non_dg_total || 5500.00,
    document_processing_charges_rate: costing?.document_processing_charges_rate || 55.00,
    document_processing_charges_units: costing?.document_processing_charges_units || 1,
    document_processing_charges_total: costing?.document_processing_charges_total || 55.00,
    isps_rate: costing?.isps_rate || 110.55,
    isps_units: costing?.isps_units || 0,
    isps_total: costing?.isps_total || 0,
    bill_of_lading_surrender_charges_rate: costing?.bill_of_lading_surrender_charges_rate || 250.00,
    bill_of_lading_surrender_charges_units: costing?.bill_of_lading_surrender_charges_units || 0,
    bill_of_lading_surrender_charges_total: costing?.bill_of_lading_surrender_charges_total || 0,
    seal_charges_rate: costing?.seal_charges_rate || 40.00,
    seal_charges_units: costing?.seal_charges_units || 5,
    seal_charges_total: costing?.seal_charges_total || 200.00,
    container_protection_charges_rate: costing?.container_protection_charges_rate || 25.00,
    container_protection_charges_units: costing?.container_protection_charges_units || 0,
    container_protection_charges_total: costing?.container_protection_charges_total || 0,
    vgm_token_rate: costing?.vgm_token_rate || 115.00,
    vgm_token_units: costing?.vgm_token_units || 5,
    vgm_token_total: costing?.vgm_token_total || 575.00,
    dp_word_handling_charges_non_uae_rate: costing?.dp_word_handling_charges_non_uae_rate || 200.00,
    dp_word_handling_charges_non_uae_units: costing?.dp_word_handling_charges_non_uae_units || 0,
    dp_word_handling_charges_non_uae_total: costing?.dp_word_handling_charges_non_uae_total || 0,
    bl_charges_rate: costing?.bl_charges_rate || 575.00,
    bl_charges_units: costing?.bl_charges_units || 1,
    bl_charges_total: costing?.bl_charges_total || 575.00,
    bill_of_entry_export_declaration_rate: costing?.bill_of_entry_export_declaration_rate || 125.00,
    bill_of_entry_export_declaration_units: costing?.bill_of_entry_export_declaration_units || 1,
    bill_of_entry_export_declaration_total: costing?.bill_of_entry_export_declaration_total || 125.00,
    crosstuffing_rate: costing?.crosstuffing_rate || 700.00,
    crosstuffing_units: costing?.crosstuffing_units || 1,
    crosstuffing_total: costing?.crosstuffing_total || 700.00,
    label_removing_labeling_rate: costing?.label_removing_labeling_rate || 0.25,
    label_removing_labeling_units: costing?.label_removing_labeling_units || 700,
    label_removing_labeling_total: costing?.label_removing_labeling_total || 175.00,
    label_price_rate: costing?.label_price_rate || 0,
    label_price_units: costing?.label_price_units || 0,
    label_price_total: costing?.label_price_total || 0,
    hdpe_drum_210_new_rate: costing?.hdpe_drum_210_new_rate || 51.25,
    hdpe_drum_210_new_units: costing?.hdpe_drum_210_new_units || 0,
    hdpe_drum_210_new_total: costing?.hdpe_drum_210_new_total || 0,
    hdpe_drum_250_new_rate: costing?.hdpe_drum_250_new_rate || 70.00,
    hdpe_drum_250_new_units: costing?.hdpe_drum_250_new_units || 0,
    hdpe_drum_250_new_total: costing?.hdpe_drum_250_new_total || 0,
    open_top_drum_210_reconditioned_rate: costing?.open_top_drum_210_reconditioned_rate || 53.00,
    open_top_drum_210_reconditioned_units: costing?.open_top_drum_210_reconditioned_units || 0,
    open_top_drum_210_reconditioned_total: costing?.open_top_drum_210_reconditioned_total || 0,
    ibc_rate: costing?.ibc_rate || 400.00,
    ibc_units: costing?.ibc_units || 0,
    ibc_total: costing?.ibc_total || 0,
    flexi_rate: costing?.flexi_rate || 1010.63,
    flexi_units: costing?.flexi_units || 0,
    flexi_total: costing?.flexi_total || 0,
    pallets_rate: costing?.pallets_rate || 24.00,
    pallets_units: costing?.pallets_units || 0,
    pallets_total: costing?.pallets_total || 0,
    other_charges_rate: costing?.other_charges_rate || 571.175,
    other_charges_units: costing?.other_charges_units || 0,
    other_charges_total: costing?.other_charges_total || 0,
    total_charges_aed: costing?.total_charges_aed || 0,
    usd_conversion: costing?.usd_conversion || 3.675,
    total_charges_usd: costing?.total_charges_usd || 0,
    ocean_freight_rate_per_container: costing?.ocean_freight_rate_per_container || 0,
    number_of_containers: costing?.number_of_containers || quotation?.container_count || 1,
    total_ocean_freight_cost_usd: costing?.total_ocean_freight_cost_usd || 0,
    total_cost_usd: costing?.total_cost_usd || 0,
    product_name: costing?.product_name || '',
    drum_ctn: costing?.drum_ctn || 0,
    kg_per_drum_ctn: costing?.kg_per_drum_ctn || 0,
    total_kg: costing?.total_kg || 0,
    loaded_weight_mt: costing?.loaded_weight_mt || 0,
    cost_per_mt: costing?.cost_per_mt || 0,
    product_cost: costing?.product_cost || 0,
    import_shipment_charges: costing?.import_shipment_charges || 0,
    export_shipment_charges: costing?.export_shipment_charges || 0,
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
        const salesOrdersRes = await api.get('/sales-orders', {
          params: { quotation_id: quotation.id }
        });
        
        if (salesOrdersRes.data?.length > 0) {
          const salesOrder = salesOrdersRes.data[0];
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
    
    // Calculate ocean freight total
    if (field === 'ocean_freight_rate_per_container' || field === 'number_of_containers') {
      newCosts.total_ocean_freight_cost_usd = (newCosts.ocean_freight_rate_per_container || 0) * (newCosts.number_of_containers || 0);
    }
    
    // Calculate total charges in AED (sum of all charge totals)
    const totalAED = 
      (newCosts.transportation_total || 0) +
      (newCosts.tluc_total || 0) +
      (newCosts.thc_40ft_non_dg_total || 0) +
      (newCosts.document_processing_charges_total || 0) +
      (newCosts.isps_total || 0) +
      (newCosts.bill_of_lading_surrender_charges_total || 0) +
      (newCosts.seal_charges_total || 0) +
      (newCosts.container_protection_charges_total || 0) +
      (newCosts.vgm_token_total || 0) +
      (newCosts.dp_word_handling_charges_non_uae_total || 0) +
      (newCosts.bl_charges_total || 0) +
      (newCosts.bill_of_entry_export_declaration_total || 0) +
      (newCosts.crosstuffing_total || 0) +
      (newCosts.label_removing_labeling_total || 0) +
      (newCosts.label_price_total || 0) +
      (newCosts.hdpe_drum_210_new_total || 0) +
      (newCosts.hdpe_drum_250_new_total || 0) +
      (newCosts.open_top_drum_210_reconditioned_total || 0) +
      (newCosts.ibc_total || 0) +
      (newCosts.flexi_total || 0) +
      (newCosts.pallets_total || 0) +
      (newCosts.other_charges_total || 0);
    newCosts.total_charges_aed = totalAED;
    
    // Calculate total charges in USD
    newCosts.total_charges_usd = totalAED / (newCosts.usd_conversion || 3.675);
    
    // Calculate total cost (A+B)
    newCosts.total_cost_usd = newCosts.total_charges_usd + (newCosts.total_ocean_freight_cost_usd || 0);
    
    // Auto-calculate total KG and Loaded Weight in MT from Drum/CTN and KG/Drum&CTN
    // Handle both single product (legacy) and multi-product fields
    if (field === 'drum_ctn' || field === 'kg_per_drum_ctn') {
      const drumCtn = newCosts.drum_ctn || 0;
      const kgPerDrum = newCosts.kg_per_drum_ctn || 0;
      newCosts.total_kg = drumCtn * kgPerDrum;
      newCosts.loaded_weight_mt = newCosts.total_kg / 1000;
    }
    
    // Handle product-specific fields (indexed by item index)
    if (field.startsWith('drum_ctn_') || field.startsWith('kg_per_drum_ctn_')) {
      const itemIdx = field.split('_').pop();
      const drumCtn = newCosts[`drum_ctn_${itemIdx}`] || 0;
      const kgPerDrum = newCosts[`kg_per_drum_ctn_${itemIdx}`] || 0;
      newCosts[`total_kg_${itemIdx}`] = drumCtn * kgPerDrum;
      newCosts[`loaded_weight_mt_${itemIdx}`] = (drumCtn * kgPerDrum) / 1000;
      
      // Recalculate totals across all products
      const items = quotation?.items || [];
      let totalKg = 0;
      let totalMT = 0;
      items.forEach((_, idx) => {
        const itemDrumCtn = newCosts[`drum_ctn_${idx}`] || newCosts.drum_ctn || 0;
        const itemKgPerDrum = newCosts[`kg_per_drum_ctn_${idx}`] || newCosts.kg_per_drum_ctn || 0;
        const itemKg = itemDrumCtn * itemKgPerDrum;
        totalKg += itemKg;
        totalMT += itemKg / 1000;
      });
      newCosts.total_kg = totalKg;
      newCosts.loaded_weight_mt = totalMT;
    }
    
    // Calculate cost per MT
    if (newCosts.loaded_weight_mt > 0) {
      newCosts.cost_per_mt = newCosts.total_cost_usd / newCosts.loaded_weight_mt;
    } else {
      newCosts.cost_per_mt = 0;
    }
    
    // Export Shipment Charges = Cost Per MT from Section D
    newCosts.export_shipment_charges = newCosts.cost_per_mt || 0;
    
    // Calculate total cost (Product Cost + Import Shipment + Export Shipment)
    newCosts.total_cost = (newCosts.product_cost || 0) + (newCosts.import_shipment_charges || 0) + (newCosts.export_shipment_charges || 0);
    
    // Calculate net profit/loss
    newCosts.net_profit_loss = (newCosts.sales_price || 0) - newCosts.total_cost;
    
    setCosts(newCosts);
    if (onUpdate) {
      onUpdate(newCosts);
    }
  };

  const charges = [
    { key: 'transportation', label: 'Transportation', field: 'transportation', defaultRate: 375.00, defaultUnits: 5 },
    { key: 'tluc', label: 'TLUC', field: 'tluc', defaultRate: 314.00, defaultUnits: 5 },
    { key: 'thc_40ft_non_dg', label: 'THC 40ft NON DG', field: 'thc_40ft_non_dg', defaultRate: 1100.00, defaultUnits: 5 },
    { key: 'document_processing_charges', label: 'Document Processing Charges', field: 'document_processing_charges', defaultRate: 55.00, defaultUnits: 1 },
    { key: 'isps', label: 'ISPS', field: 'isps', defaultRate: 110.55, defaultUnits: 0 },
    { key: 'bill_of_lading_surrender_charges', label: 'Bill of Lading Surrender Charges', field: 'bill_of_lading_surrender_charges', defaultRate: 250.00, defaultUnits: 0 },
    { key: 'seal_charges', label: 'Seal Charges', field: 'seal_charges', defaultRate: 40.00, defaultUnits: 5 },
    { key: 'container_protection_charges', label: 'Container Protection Charges', field: 'container_protection_charges', defaultRate: 25.00, defaultUnits: 0 },
    { key: 'vgm_token', label: 'VGM + TOKEN', field: 'vgm_token', defaultRate: 115.00, defaultUnits: 5 },
    { key: 'dp_word_handling_charges_non_uae', label: 'DP Word Handling Charges Non UAE', field: 'dp_word_handling_charges_non_uae', defaultRate: 200.00, defaultUnits: 0 },
    { key: 'bl_charges', label: 'BL Charges', field: 'bl_charges', defaultRate: 575.00, defaultUnits: 1 },
    { key: 'bill_of_entry_export_declaration', label: 'Bill of Entry/ Export Declaration Charges', field: 'bill_of_entry_export_declaration', defaultRate: 125.00, defaultUnits: 1 },
    { key: 'crosstuffing', label: 'CROSSTUFFING', field: 'crosstuffing', defaultRate: 700.00, defaultUnits: 1 },
    { key: 'label_removing_labeling', label: 'LABEL REMOVING/ LABELING', field: 'label_removing_labeling', defaultRate: 0.25, defaultUnits: 700 },
    { key: 'label_price', label: 'Label Price', field: 'label_price', defaultRate: 0, defaultUnits: 0 },
  ];

  const packagingCharges = [
    { key: 'hdpe_drum_210_new', label: 'HDPE Drum 210 Ltr-New', field: 'hdpe_drum_210_new', defaultRate: 51.25 },
    { key: 'hdpe_drum_250_new', label: 'HDPE Drum 250 Ltr-New', field: 'hdpe_drum_250_new', defaultRate: 70.00 },
    { key: 'open_top_drum_210_reconditioned', label: 'Open Top Drum 210 Ltr-Reconditioned', field: 'open_top_drum_210_reconditioned', defaultRate: 53.00 },
    { key: 'ibc', label: 'IBC', field: 'ibc', defaultRate: 400.00 },
    { key: 'flexi', label: 'Flexi', field: 'flexi', defaultRate: 1010.63 },
    { key: 'pallets', label: 'Pallets', field: 'pallets', defaultRate: 24.00 },
    { key: 'other_charges', label: 'Other Charges', field: 'other_charges', defaultRate: 571.175 },
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
                        value={costs[`${charge.field}_units`] !== undefined ? costs[`${charge.field}_units`] : 0}
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

      {/* Section A: Total Charges Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Section A: Total Charges Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Total charges in AED</Label>
            <Input
              type="number"
              value={costs.total_charges_aed?.toFixed(2) || '0.00'}
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

      {/* Section B: Ocean Freight Cost */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Section B: Ocean Freight Cost</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Approved Ocean Freight Rate/ Container</Label>
            <Input
              type="number"
              value={costs.ocean_freight_rate_per_container || 0}
              onChange={(e) => handleChange('ocean_freight_rate_per_container', parseFloat(e.target.value) || 0)}
              className="w-32 text-right"
              step="0.01"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Number of Containers</Label>
            <Input
              type="number"
              value={costs.number_of_containers || 1}
              onChange={(e) => handleChange('number_of_containers', parseFloat(e.target.value) || 1)}
              className="w-32 text-right"
              step="0.01"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Total ocean freight cost $</Label>
            <Input
              type="number"
              value={costs.total_ocean_freight_cost_usd?.toFixed(2) || '0.00'}
              readOnly
              className="w-32 text-right bg-muted font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section A+B: Overall Total Cost */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Section A+B: Overall Total Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <Label className="font-semibold">Total cost in $</Label>
            <Input
              type="number"
              value={costs.total_cost_usd?.toFixed(2) || '0.00'}
              readOnly
              className="w-32 text-right bg-muted font-mono font-bold"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section D: Product Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Section D: Product Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {quotation?.items && quotation.items.length > 0 ? (
            <>
              {quotation.items.map((item, itemIdx) => (
                <div key={itemIdx} className="border border-border rounded-lg p-4 space-y-3 bg-muted/10">
                  <div className="font-semibold text-sm mb-2 text-blue-400">{item.product_name}</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>PRODUCT NAME</Label>
                      <Input
                        type="text"
                        value={costs[`product_name_${itemIdx}`] || item.product_name || ''}
                        onChange={(e) => handleChange(`product_name_${itemIdx}`, e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Drum/CTN</Label>
                      <Input
                        type="number"
                        value={costs[`drum_ctn_${itemIdx}`] !== undefined ? costs[`drum_ctn_${itemIdx}`] : (itemIdx === 0 ? (costs.drum_ctn || 0) : 0)}
                        onChange={(e) => handleChange(`drum_ctn_${itemIdx}`, parseFloat(e.target.value) || 0)}
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label>KG/ Drum&CTN</Label>
                      <Input
                        type="number"
                        value={costs[`kg_per_drum_ctn_${itemIdx}`] !== undefined ? costs[`kg_per_drum_ctn_${itemIdx}`] : (itemIdx === 0 ? (costs.kg_per_drum_ctn || 0) : 0)}
                        onChange={(e) => handleChange(`kg_per_drum_ctn_${itemIdx}`, parseFloat(e.target.value) || 0)}
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex justify-between items-center">
                      <Label>Total (KG)</Label>
                      <Input
                        type="number"
                        value={(costs[`total_kg_${itemIdx}`] || (costs[`drum_ctn_${itemIdx}`] !== undefined ? (costs[`drum_ctn_${itemIdx}`] || 0) * (costs[`kg_per_drum_ctn_${itemIdx}`] || 0) : (itemIdx === 0 ? (costs.total_kg || 0) : 0)))?.toFixed(2) || '0.00'}
                        readOnly
                        className="w-32 text-right bg-muted font-mono"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <Label>Total (MT)</Label>
                      <Input
                        type="number"
                        value={(costs[`loaded_weight_mt_${itemIdx}`] || (costs[`total_kg_${itemIdx}`] || (costs[`drum_ctn_${itemIdx}`] !== undefined ? (costs[`drum_ctn_${itemIdx}`] || 0) * (costs[`kg_per_drum_ctn_${itemIdx}`] || 0) : (itemIdx === 0 ? (costs.total_kg || 0) : 0))) / 1000)?.toFixed(2) || '0.00'}
                        readOnly
                        className="w-32 text-right bg-muted font-mono"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {/* Overall totals */}
              <div className="border-t border-border pt-3 mt-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between items-center">
                    <Label className="font-semibold">Total (KG) - All Products</Label>
                    <Input
                      type="number"
                      value={costs.total_kg?.toFixed(2) || '0.00'}
                      readOnly
                      className="w-32 text-right bg-muted font-mono font-semibold"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <Label className="font-semibold">Total (MT) - All Products</Label>
                    <Input
                      type="number"
                      value={costs.loaded_weight_mt?.toFixed(2) || '0.00'}
                      readOnly
                      className="w-32 text-right bg-muted font-mono font-semibold"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3">
                  <Label className="font-semibold">Cost Per MT($)</Label>
                  <Input
                    type="number"
                    value={costs.cost_per_mt?.toFixed(2) || '0.00'}
                    readOnly
                    className="w-32 text-right bg-muted font-mono font-semibold"
                  />
                </div>
              </div>
            </>
          ) : (
            // Fallback to single product display if items array is not available
            <div className="space-y-3">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between items-center">
                  <Label>Total (KG)</Label>
                  <Input
                    type="number"
                    value={costs.total_kg?.toFixed(2) || '0.00'}
                    readOnly
                    className="w-32 text-right bg-muted font-mono"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <Label>Total (MT)</Label>
                  <Input
                    type="number"
                    value={costs.loaded_weight_mt?.toFixed(2) || '0.00'}
                    readOnly
                    className="w-32 text-right bg-muted font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <Label>Cost Per MT($)</Label>
                <Input
                  type="number"
                  value={costs.cost_per_mt?.toFixed(2) || '0.00'}
                  readOnly
                  className="w-32 text-right bg-muted font-mono"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Final Costing & Margin Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Final Costing & Margin Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Product Cost (Cost/MT)</Label>
            <Input
              type="number"
              value={costs.product_cost || 0}
              onChange={(e) => handleChange('product_cost', parseFloat(e.target.value) || 0)}
              className="w-32 text-right"
              step="0.01"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Import Shipment Charges</Label>
            <Input
              type="number"
              value={costs.import_shipment_charges || 0}
              onChange={(e) => handleChange('import_shipment_charges', parseFloat(e.target.value) || 0)}
              className="w-32 text-right"
              step="0.01"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Export Shipment Charges</Label>
            <Input
              type="number"
              value={costs.cost_per_mt?.toFixed(2) || '0.00'}
              readOnly
              className="w-32 text-right bg-muted font-mono"
            />
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
              Net Profit/ -Loss
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

