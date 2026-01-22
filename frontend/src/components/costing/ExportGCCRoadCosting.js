import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { AlertCircle, DollarSign } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';

export default function ExportGCCRoadCosting({ costing, quotation, onUpdate, userRole }) {
  const [costs, setCosts] = useState({
    raw_material_cost: costing?.raw_material_cost || 0,
    packaging_cost: costing?.packaging_cost || 0,
    road_transport_cost: costing?.road_transport_cost || 0,
    thc_cost: costing?.thc_cost || 0,
    isps_cost: costing?.isps_cost || 0,
    documentation_cost: costing?.documentation_cost || 0,
    bl_cost: costing?.bl_cost || 0,
    is_dg: costing?.is_dg || false,
  });

  const containerCount = quotation?.container_count || 1;
  const containerType = quotation?.container_type || '20ft';
  const isBulk = quotation?.items?.every(item => 
    (item.packaging || 'Bulk').toUpperCase() === 'BULK'
  ) || false;

  useEffect(() => {
    if (costing) {
      console.log('ExportGCCRoadCosting - Received costing data:', JSON.stringify(costing, null, 2));
      const updatedCosts = {
        raw_material_cost: costing.raw_material_cost || 0,
        packaging_cost: costing.packaging_cost || 0,
        road_transport_cost: costing.road_transport_cost || 0,
        thc_cost: costing.thc_cost || 0,
        isps_cost: costing.isps_cost || 0,
        documentation_cost: costing.documentation_cost || 0,
        bl_cost: costing.bl_cost || 0,
        is_dg: costing.is_dg || false,
      };
      console.log('ExportGCCRoadCosting - Setting costs state:', JSON.stringify(updatedCosts, null, 2));
      setCosts(updatedCosts);
    }
  }, [costing]);

  const handleChange = (field, value) => {
    const newCosts = { ...costs, [field]: value };
    setCosts(newCosts);
    if (onUpdate) {
      onUpdate(newCosts);
    }
  };

  const totalCost = (
    costs.raw_material_cost +
    (isBulk ? 0 : costs.packaging_cost) +
    costs.road_transport_cost +
    costs.thc_cost +
    costs.isps_cost +
    costs.documentation_cost +
    costs.bl_cost
  );

  const sellingPrice = quotation?.total || 0;
  const margin = sellingPrice - totalCost;
  const marginPercent = sellingPrice > 0 ? (margin / sellingPrice * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium">Costing Type</p>
          <Badge variant="outline" className="mt-1">EXPORT GCC BY ROAD</Badge>
        </div>
        <div>
          <p className="text-sm font-medium">Container</p>
          <p className="text-sm text-muted-foreground">
            {containerCount}x {containerType.toUpperCase()}
            {costs.is_dg && <span className="ml-2 text-red-500">DG</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Raw Material Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.raw_material_cost ?? 0}
              onChange={(e) => handleChange('raw_material_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Packaging Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={isBulk ? 0 : costs.packaging_cost}
              onChange={(e) => handleChange('packaging_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              disabled={isBulk}
            />
            {isBulk && (
              <p className="text-xs text-muted-foreground mt-1">Disabled for bulk</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Road Transport Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.road_transport_cost ?? 0}
              onChange={(e) => handleChange('road_transport_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground mt-1">Auto from transport master</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">THC ({containerType.toUpperCase()} {costs.is_dg ? 'DG' : 'Non-DG'})</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.thc_cost ?? 0}
              onChange={(e) => handleChange('thc_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              readOnly
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">Auto from fixed charges × {containerCount} containers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ISPS</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.isps_cost ?? 0}
              onChange={(e) => handleChange('isps_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              readOnly
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">Auto from fixed charges × {containerCount} containers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Documentation & B/L Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Input
                type="number"
                value={costs.documentation_cost ?? 0}
                onChange={(e) => handleChange('documentation_cost', parseFloat(e.target.value) || 0)}
                placeholder="Documentation"
                readOnly
                className="bg-muted"
              />
              <Input
                type="number"
                value={costs.bl_cost ?? 0}
                onChange={(e) => handleChange('bl_cost', parseFloat(e.target.value) || 0)}
                placeholder="B/L Fees"
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">Auto from fixed charges × {containerCount} containers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span>Total Cost:</span>
            <span className="font-bold">${totalCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Selling Price:</span>
            <span className="font-bold">${sellingPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Margin:</span>
            <Badge variant={margin >= 0 ? 'default' : 'destructive'} className="font-bold">
              ${margin.toFixed(2)} ({marginPercent.toFixed(2)}%)
            </Badge>
          </div>
          {margin < 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Negative margin detected. Approval will be blocked.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

