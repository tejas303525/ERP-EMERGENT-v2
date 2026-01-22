import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AlertCircle, DollarSign, Calculator } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import api from '../../lib/api';

export default function ExportContainerizedCosting({ costing, quotation, onUpdate, userRole }) {
  const [costs, setCosts] = useState({
    raw_material_cost: costing?.raw_material_cost || 0,
    packaging_cost: costing?.packaging_cost || 0,
    inland_transport_cost: costing?.inland_transport_cost || 0,
    thc_cost: costing?.thc_cost || 0,
    isps_cost: costing?.isps_cost || 0,
    documentation_cost: costing?.documentation_cost || 0,
    bl_cost: costing?.bl_cost || 0,
    ocean_freight_cost: costing?.ocean_freight_cost || 0,
    is_dg: costing?.is_dg || false,
    raw_material_source: costing?.raw_material_source || 'SYSTEM',
    packaging_type: costing?.packaging_type || null,
    incoterm_type: costing?.incoterm_type || null,
  });

  const [calculating, setCalculating] = useState(false);

  const incoterm = (quotation?.incoterm || '').toUpperCase();
  const containerCount = quotation?.container_count || 1;
  const isFOB = incoterm === 'FOB';
  const isCFRCIF = incoterm === 'CFR' || incoterm === 'CIF';
  const isFinance = userRole === 'finance' || userRole === 'admin';
  
  // Determine initial packaging type from quotation items
  const initialIsBulk = quotation?.items?.every(item => (item.packaging || 'Bulk').toUpperCase() === 'BULK') || false;
  const initialPackagingType = costing?.packaging_type || (initialIsBulk ? 'BULK' : 'DRUM');
  const isBulk = costs.packaging_type === 'BULK' || (costs.packaging_type === null && initialIsBulk);

  useEffect(() => {
    if (costing) {
      console.log('ExportContainerizedCosting - Received costing data:', JSON.stringify(costing, null, 2));
      const updatedCosts = {
        raw_material_cost: costing.raw_material_cost || 0,
        packaging_cost: costing.packaging_cost || 0,
        inland_transport_cost: costing.inland_transport_cost || 0,
        thc_cost: costing.thc_cost || 0,
        isps_cost: costing.isps_cost || 0,
        documentation_cost: costing.documentation_cost || 0,
        bl_cost: costing.bl_cost || 0,
        ocean_freight_cost: costing.ocean_freight_cost || 0,
        is_dg: costing.is_dg || false,
        raw_material_source: costing.raw_material_source || 'SYSTEM',
        packaging_type: costing.packaging_type || initialPackagingType,
        incoterm_type: costing.incoterm_type || (quotation?.incoterm === 'EXW' ? 'EXW' : 'DELIVERED'),
      };
      console.log('ExportContainerizedCosting - Setting costs state:', JSON.stringify(updatedCosts, null, 2));
      setCosts(updatedCosts);
    }
  }, [costing, initialPackagingType, quotation?.incoterm]);

  const handleChange = (field, value) => {
    const newCosts = { ...costs, [field]: value };
    
    // If packaging_type changes to BULK, set packaging_cost to 0
    if (field === 'packaging_type' && value === 'BULK') {
      newCosts.packaging_cost = 0;
    }
    
    setCosts(newCosts);
    if (onUpdate) {
      onUpdate(newCosts);
    }
  };

  const handleCalculateFromSystem = async () => {
    if (!quotation?.id) return;
    
    setCalculating(true);
    try {
      const response = await api.post('/costing/calculate', null, {
        params: {
          reference_type: 'QUOTATION',
          reference_id: quotation.id,
          raw_material_source: 'SYSTEM',
          packaging_type: costs.packaging_type,
          incoterm_type: costs.incoterm_type,
          is_dg: costs.is_dg,
        }
      });
      
      if (response.data) {
        setCosts(prev => ({
          ...prev,
          raw_material_cost: response.data.raw_material_cost || prev.raw_material_cost,
          packaging_cost: response.data.packaging_cost || prev.packaging_cost,
          inland_transport_cost: response.data.inland_transport_cost || prev.inland_transport_cost,
          thc_cost: response.data.thc_cost || prev.thc_cost,
          isps_cost: response.data.isps_cost || prev.isps_cost,
          documentation_cost: response.data.documentation_cost || prev.documentation_cost,
          bl_cost: response.data.bl_cost || prev.bl_cost,
        }));
        
        if (onUpdate) {
          onUpdate({
            ...costs,
            raw_material_cost: response.data.raw_material_cost || costs.raw_material_cost,
            packaging_cost: response.data.packaging_cost || costs.packaging_cost,
            inland_transport_cost: response.data.inland_transport_cost || costs.inland_transport_cost,
            thc_cost: response.data.thc_cost || costs.thc_cost,
            isps_cost: response.data.isps_cost || costs.isps_cost,
            documentation_cost: response.data.documentation_cost || costs.documentation_cost,
            bl_cost: response.data.bl_cost || costs.bl_cost,
          });
        }
      }
    } catch (error) {
      console.error('Failed to calculate from system:', error);
    } finally {
      setCalculating(false);
    }
  };

  const totalCost = (
    costs.raw_material_cost +
    (isBulk ? 0 : costs.packaging_cost) +
    costs.inland_transport_cost +
    costs.thc_cost +
    costs.isps_cost +
    costs.documentation_cost +
    costs.bl_cost +
    costs.ocean_freight_cost
  );

  const sellingPrice = quotation?.total || 0;
  const margin = sellingPrice - totalCost;
  const marginPercent = sellingPrice > 0 ? (margin / sellingPrice * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Raw Material Source Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Raw Material Cost Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={costs.raw_material_source}
            onValueChange={(value) => handleChange('raw_material_source', value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="SYSTEM" id="rm-system" />
              <Label htmlFor="rm-system">From System</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="MANUAL" id="rm-manual" />
              <Label htmlFor="rm-manual">Enter Manually</Label>
            </div>
          </RadioGroup>
          
          {costs.raw_material_source === 'MANUAL' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCalculateFromSystem}
              disabled={calculating}
              className="w-full"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {calculating ? 'Calculating...' : 'Calculate from System'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Bulk/Drum Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Packaging Type</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={costs.packaging_type || initialPackagingType}
            onValueChange={(value) => handleChange('packaging_type', value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="BULK" id="pkg-bulk" />
              <Label htmlFor="pkg-bulk">Bulk</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="DRUM" id="pkg-drum" />
              <Label htmlFor="pkg-drum">Drum</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* EXW/Delivered Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Incoterm Type</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={costs.incoterm_type || (quotation?.incoterm === 'EXW' ? 'EXW' : 'DELIVERED')}
            onValueChange={(value) => handleChange('incoterm_type', value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="EXW" id="incoterm-exw" />
              <Label htmlFor="incoterm-exw">EXW</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="DELIVERED" id="incoterm-delivered" />
              <Label htmlFor="incoterm-delivered">Delivered</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

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
              readOnly={costs.raw_material_source === 'SYSTEM' && !calculating}
              className={costs.raw_material_source === 'SYSTEM' ? 'bg-muted' : ''}
            />
            {costs.raw_material_source === 'SYSTEM' && (
              <p className="text-xs text-muted-foreground mt-1">Calculated from system</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Drum Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={isBulk ? 0 : costs.packaging_cost}
              onChange={(e) => handleChange('packaging_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              disabled={isBulk}
            />
            {isBulk ? (
              <p className="text-xs text-muted-foreground mt-1">Not applicable for bulk</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Auto from cost sheet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Inland Transport</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.inland_transport_cost ?? 0}
              onChange={(e) => handleChange('inland_transport_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">THC (Terminal Handling)</CardTitle>
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
            <p className="text-xs text-muted-foreground mt-1">Auto from master × {containerCount} containers</p>
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
            <p className="text-xs text-muted-foreground mt-1">Auto from master × {containerCount} containers</p>
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
              <p className="text-xs text-muted-foreground">Auto from master × {containerCount} containers</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ocean Freight</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.ocean_freight_cost ?? 0}
              onChange={(e) => handleChange('ocean_freight_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              disabled={isFOB || !isFinance}
            />
            {isFOB && (
              <p className="text-xs text-muted-foreground mt-1">Not applicable for FOB (buyer arranges freight)</p>
            )}
            {!isFOB && !isFinance && (
              <p className="text-xs text-muted-foreground mt-1">Finance role required to enter freight</p>
            )}
            {isCFRCIF && isFinance && (
              <p className="text-xs text-muted-foreground mt-1">Required for {incoterm} - Enter freight cost manually</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">DG / Non-DG</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={costs.is_dg ? 'dg' : 'non-dg'}
              onValueChange={(value) => handleChange('is_dg', value === 'dg')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="non-dg" id="non-dg" />
                <Label htmlFor="non-dg">Non-DG</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dg" id="dg" />
                <Label htmlFor="dg">DG (Dangerous Goods)</Label>
              </div>
            </RadioGroup>
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

