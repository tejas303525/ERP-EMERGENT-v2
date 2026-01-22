import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AlertCircle, DollarSign, Calculator } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import api from '../../lib/api';

export default function ExportBulkCosting({ costing, quotation, onUpdate, userRole }) {
  const [costs, setCosts] = useState({
    raw_material_cost: costing?.raw_material_cost || 0,
    inland_transport_cost: costing?.inland_transport_cost || 0,
    port_charges: costing?.port_charges || 0,
    ocean_freight_cost: costing?.ocean_freight_cost || 0,
    raw_material_source: costing?.raw_material_source || 'SYSTEM',
    incoterm_type: costing?.incoterm_type || null,
  });

  const [calculating, setCalculating] = useState(false);

  const incoterm = (quotation?.incoterm || '').toUpperCase();
  const isFOB = incoterm === 'FOB';
  const isCFRCIF = incoterm === 'CFR' || incoterm === 'CIF';
  const isFinance = userRole === 'finance' || userRole === 'admin';

  useEffect(() => {
    if (costing) {
      setCosts({
        raw_material_cost: costing.raw_material_cost || 0,
        inland_transport_cost: costing.inland_transport_cost || 0,
        port_charges: costing.port_charges || 0,
        ocean_freight_cost: costing.ocean_freight_cost || 0,
        raw_material_source: costing.raw_material_source || 'SYSTEM',
        incoterm_type: costing.incoterm_type || (quotation?.incoterm === 'EXW' ? 'EXW' : 'DELIVERED'),
      });
    }
  }, [costing, quotation?.incoterm]);

  const handleChange = (field, value) => {
    const newCosts = { ...costs, [field]: value };
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
          packaging_type: 'BULK',
          incoterm_type: costs.incoterm_type,
        }
      });
      
      if (response.data) {
        setCosts(prev => ({
          ...prev,
          raw_material_cost: response.data.raw_material_cost || prev.raw_material_cost,
          inland_transport_cost: response.data.inland_transport_cost || prev.inland_transport_cost,
          port_charges: response.data.port_charges || prev.port_charges,
        }));
        
        if (onUpdate) {
          onUpdate({
            ...costs,
            raw_material_cost: response.data.raw_material_cost || costs.raw_material_cost,
            inland_transport_cost: response.data.inland_transport_cost || costs.inland_transport_cost,
            port_charges: response.data.port_charges || costs.port_charges,
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
    costs.inland_transport_cost +
    costs.port_charges +
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

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Raw Material Bulk Cost</CardTitle>
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
            <CardTitle className="text-sm">Inland Transport</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.inland_transport_cost}
              onChange={(e) => handleChange('inland_transport_cost', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Port Charges</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.port_charges}
              onChange={(e) => handleChange('port_charges', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground mt-1">Applicable port charges for bulk</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ocean Freight</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              value={costs.ocean_freight_cost}
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
            {!isFOB && !isCFRCIF && (
              <p className="text-xs text-muted-foreground mt-1">Check incoterm: {incoterm}</p>
            )}
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

