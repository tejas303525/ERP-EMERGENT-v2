import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export default function LocalPurchaseSaleCosting({ costing, quotation, onUpdate }) {
  const [costs, setCosts] = useState({
    transportation_from_to: costing?.transportation_from_to || '',
    transportation_rate: costing?.transportation_rate || 0,
    transportation_units: costing?.transportation_units || 0,
    transportation_total: costing?.transportation_total || 0,
    bill_of_entry_rate: costing?.bill_of_entry_rate || 0,
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

  useEffect(() => {
    // Prefer saved custom_breakdown (full UI state) if present
    if (costing?.custom_breakdown) {
      setCosts(prev => ({ ...prev, ...costing.custom_breakdown }));
    } else if (costing) {
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

    // Auto-calculate loaded weight in MT from DRUM/CTN and KG/Drum&CTN
    // Handle both indexed fields (multi-item) and non-indexed fields (single item)
    if (field.includes('drum_ctn') || field.includes('kg_per_drum_ctn')) {
      // Extract index if present (e.g., "drum_ctn_0" → "0", "drum_ctn" → null)
      const match = field.match(/_(\d+)$/);
      const idx = match ? match[1] : null;
      
      if (idx !== null) {
        // Multi-item: use indexed fields
        const drums = field.includes('drum_ctn') ? value : (newCosts[`drum_ctn_${idx}`] || 0);
        const kgPerDrum = field.includes('kg_per_drum_ctn') ? value : (newCosts[`kg_per_drum_ctn_${idx}`] || 0);
        newCosts[`loaded_weight_mt_${idx}`] = (drums * kgPerDrum) / 1000; // kg → MT
      } else {
        // Single item: use non-indexed fields
        const drums = newCosts.drum_ctn || 0;
        const kgPerDrum = newCosts.kg_per_drum_ctn || 0;
        newCosts.loaded_weight_mt = (drums * kgPerDrum) / 1000; // kg → MT
      }
    }

    // Calculate total charges in AED
    const totalAED = 
      (newCosts.transportation_total || 0) +
      (newCosts.bill_of_entry_total || 0) +
      (newCosts.epda_total || 0) +
      (newCosts.sira_total || 0) +
      (newCosts.mofaic_total || 0) +
      (newCosts.duty_exemption_total || 0);
    newCosts.total_charges_aed = totalAED;
    
    // Calculate total charges in USD
    newCosts.total_charges_usd = totalAED / (newCosts.usd_conversion || 3.675);
    
    // Calculate total loaded weight for cost per MT (sum all items)
    // Clear any stale indexed fields beyond the current number of items
    let totalLoadedWeight = 0;
    if (quotation?.items && quotation.items.length > 0) {
      // Multi-item: recalculate and sum all loaded weights for actual items only
      for (let i = 0; i < quotation.items.length; i++) {
        // Recalculate loaded weight for this item from drums and kg
        const itemDrums = newCosts[`drum_ctn_${i}`] !== undefined ? newCosts[`drum_ctn_${i}`] : (i === 0 ? (newCosts.drum_ctn || 0) : 0);
        const itemKgPerDrum = newCosts[`kg_per_drum_ctn_${i}`] !== undefined ? newCosts[`kg_per_drum_ctn_${i}`] : (i === 0 ? (newCosts.kg_per_drum_ctn || 0) : 0);
        const itemLoadedWeight = (itemDrums * itemKgPerDrum) / 1000;
        
        // Store the calculated value to ensure it's up to date
        newCosts[`loaded_weight_mt_${i}`] = itemLoadedWeight;
        totalLoadedWeight += itemLoadedWeight;
      }
      
      // Clear stale indexed fields beyond the number of items
      Object.keys(newCosts).forEach(key => {
        const match = key.match(/^(drum_ctn|kg_per_drum_ctn|loaded_weight_mt)_(\d+)$/);
        if (match) {
          const fieldIndex = parseInt(match[2]);
          if (fieldIndex >= quotation.items.length) {
            delete newCosts[key];
          }
        }
      });
    } else {
      // Single item
      totalLoadedWeight = newCosts.loaded_weight_mt || 0;
    }
    
    // Calculate cost per MT
    if (totalLoadedWeight > 0) {
      newCosts.cost_per_mt = newCosts.total_charges_usd / totalLoadedWeight;
    } else {
      newCosts.cost_per_mt = 0;
    }
    
    // Calculate shipment charges per MT
    if (totalLoadedWeight > 0) {
      newCosts.shipment_charges_per_mt = newCosts.shipment_charges / totalLoadedWeight;
    } else {
      newCosts.shipment_charges_per_mt = 0;
    }
    
    // Calculate total cost (Product Cost + Cost/MT from Table 3)
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

  return (
    <div className="space-y-6">
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
                  <th className="p-2 text-left text-xs font-medium">Description</th>
                  <th className="p-2 text-right text-xs font-medium">Rate</th>
                  <th className="p-2 text-right text-xs font-medium">No. of Units/Containers</th>
                  <th className="p-2 text-right text-xs font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.key} className="border-b border-border/30">
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
        <CardContent className="space-y-4">
          {quotation?.items && quotation.items.length > 0 ? (
            <>
              {quotation.items.map((item, itemIdx) => (
                <div key={itemIdx} className="border border-border rounded-lg p-4 space-y-3 bg-muted/10">
                  <div className="font-semibold text-sm mb-2 text-blue-400">{item.product_name}</div>
                  <div className="flex justify-between items-center">
                    <Label>Product Name</Label>
                    <Input
                      type="text"
                      value={costs[`product_name_${itemIdx}`] || item.product_name || ''}
                      onChange={(e) => handleChange(`product_name_${itemIdx}`, e.target.value)}
                      className="w-64"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>DRUM/CTN</Label>
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
                    <div>
                      <Label>Loaded Weight in MT</Label>
                      <Input
                        type="number"
                        value={(costs[`loaded_weight_mt_${itemIdx}`] || 0).toFixed(3)}
                        readOnly
                        className="bg-muted font-mono"
                        step="0.001"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {/* Overall totals */}
              <div className="border-t border-border pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <Label className="font-semibold">Cost Per MT</Label>
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
            // Fallback to single product display
            <div className="space-y-3">
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
                    value={(costs.loaded_weight_mt || 0).toFixed(3)}
                    readOnly
                    className="bg-muted font-mono"
                    step="0.001"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <Label>Cost Per MT</Label>
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

      {/* Table 4: Cost and Profit Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Table 4: Cost and Profit Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <Label>Product Cost</Label>
            <Input
              type="number"
              value={costs.product_cost || 0}
              onChange={(e) => handleChange('product_cost', parseFloat(e.target.value) || 0)}
              className="w-32 text-right"
              step="0.01"
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Cost/MT</Label>
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

