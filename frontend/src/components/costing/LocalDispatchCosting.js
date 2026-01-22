import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Button } from '../ui/button';
import { AlertCircle, DollarSign, Calculator } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import api from '../../lib/api';

export default function LocalDispatchCosting({ costing, quotation, onUpdate }) {
  const [costs, setCosts] = useState({
    raw_material_cost: costing?.raw_material_cost || 0,
    packaging_cost: costing?.packaging_cost || 0,
    local_transport_cost: costing?.local_transport_cost || 0,
    raw_material_source: costing?.raw_material_source || 'SYSTEM',
    packaging_type: costing?.packaging_type || null,
    incoterm_type: costing?.incoterm_type || null,
  });

  const [calculating, setCalculating] = useState(false);
  const [transportCostSource, setTransportCostSource] = useState(null);

  // Determine initial packaging type from quotation items
  const initialIsBulk = quotation?.items?.every(item => (item.packaging || 'Bulk').toUpperCase() === 'BULK') || false;
  const initialPackagingType = costing?.packaging_type || (initialIsBulk ? 'BULK' : 'DRUM');

  useEffect(() => {
    if (costing) {
      setCosts({
        raw_material_cost: costing.raw_material_cost || 0,
        packaging_cost: costing.packaging_cost || 0,
        local_transport_cost: costing.local_transport_cost || 0,
        raw_material_source: costing.raw_material_source || 'SYSTEM',
        packaging_type: costing.packaging_type || initialPackagingType,
        incoterm_type: costing.incoterm_type || (quotation?.incoterm === 'EXW' ? 'EXW' : 'DELIVERED'),
      });
      
      // Determine transport cost source (this would ideally come from backend)
      // For now, we'll check if transport cost is non-zero to infer it was calculated
      if (costing.local_transport_cost > 0) {
        setTransportCostSource('CALCULATED');
      }
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
        }
      });
      
      if (response.data) {
        setCosts(prev => ({
          ...prev,
          raw_material_cost: response.data.raw_material_cost || prev.raw_material_cost,
          packaging_cost: response.data.packaging_cost || prev.packaging_cost,
          local_transport_cost: response.data.local_transport_cost || prev.local_transport_cost,
        }));
        
        if (onUpdate) {
          onUpdate({
            ...costs,
            raw_material_cost: response.data.raw_material_cost || costs.raw_material_cost,
            packaging_cost: response.data.packaging_cost || costs.packaging_cost,
            local_transport_cost: response.data.local_transport_cost || costs.local_transport_cost,
          });
        }
      }
    } catch (error) {
      console.error('Failed to calculate from system:', error);
    } finally {
      setCalculating(false);
    }
  };

  const isBulk = costs.packaging_type === 'BULK';
  const totalCost = (
    costs.raw_material_cost +
    (isBulk ? 0 : costs.packaging_cost) +
    costs.local_transport_cost
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
              value={costs.raw_material_cost}
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
            {isBulk ? (
              <p className="text-xs text-muted-foreground mt-1">Not applicable for bulk</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">Auto from cost sheet</p>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Local Transport Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.local_transport_cost}
              onChange={(e) => handleChange('local_transport_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {transportCostSource === 'CALCULATED' 
                ? 'From transport booking charges' 
                : 'Auto from transport master (or booking charges if available)'}
            </p>
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

