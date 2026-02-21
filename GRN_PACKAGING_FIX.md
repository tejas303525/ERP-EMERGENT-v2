# GRN Product-with-Package Procurement Fix

## Problem
When procuring a product with packaging (e.g., "IPA pure in 80 steel drums for 14.8 MT"), the system was only updating the product stock but not the packaging stock. This caused:
- Packaging materials (drums, IBCs) not showing in inventory
- Product-packaging report not reflecting actual stock
- Inconsistent inventory data

## Root Cause
The GRN creation logic only updated packaging stock when:
1. The GRN was linked to a Purchase Order (PO)
2. The PO line had `procurement_type = "Drummed"` OR `packaging_item_id` set

**Manual GRNs without POs could not update packaging stock.**

## Solution Implemented

### 1. Backend Model Update (`backend/server.py`)
**Lines 624-634**: Added packaging fields to `GRNItem` model:
```python
class GRNItem(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str] = None
    quantity: float = Field(gt=0)
    unit: str = "KG"
    net_weight_kg: Optional[float] = None
    # NEW FIELDS:
    procurement_type: Optional[str] = "Bulk"  # "Bulk" or "Drummed"
    packaging_item_id: Optional[str] = None   # Packaging inventory item ID
    packaging_qty: Optional[float] = None     # Number of drums/IBCs/packages
```

### 2. Backend Logic Update (`backend/server.py`)
**Lines 4925-4955**: Enhanced GRN processing to detect drummed procurement from GRN item itself:
```python
# Check if drummed from both PO line and GRN item
is_drummed = False
packaging_item_id_from_source = None
packaging_qty_from_source = None

# First check PO line if exists
if matching_po_line:
    is_drummed = (
        matching_po_line.get("procurement_type") == "Drummed" or 
        matching_po_line.get("packaging_item_id") is not None
    )
    packaging_item_id_from_source = matching_po_line.get("packaging_item_id")
    packaging_qty_from_source = matching_po_line.get("packaging_qty", 0)

# Also check GRN item itself (for manual GRNs without PO)
if hasattr(item, 'procurement_type') and item.procurement_type == "Drummed":
    is_drummed = True
    if hasattr(item, 'packaging_item_id') and item.packaging_item_id:
        packaging_item_id_from_source = item.packaging_item_id
    if hasattr(item, 'packaging_qty') and item.packaging_qty:
        packaging_qty_from_source = item.packaging_qty
```

**Lines 5060-5075**: Updated packaging stock update logic to use data from either PO or GRN item:
```python
if is_drummed:
    packaging_item_id = packaging_item_id_from_source
    
    # For drummed items, use GRN item quantity (drum count) when unit is EA
    grn_unit = item.unit.upper() if item.unit else "KG"
    if grn_unit == "EA":
        packaging_qty = item.quantity  # Use the drum count from GRN item
    else:
        packaging_qty = packaging_qty_from_source if packaging_qty_from_source else 0
    
    if packaging_item_id and packaging_qty > 0:
        # Update packaging material stock
        # ... (existing update logic)
```

### 3. Frontend Form Update (`frontend/src/pages/GRNPage.js`)
**Lines 32-42**: Added packaging fields to form state:
```javascript
const [newItem, setNewItem] = useState({
  product_id: '',
  product_name: '',
  sku: '',
  quantity: 0,
  unit: 'KG',
  procurement_type: 'Bulk',      // NEW
  packaging_item_id: '',         // NEW
  packaging_qty: 0,              // NEW
  net_weight_kg: 0,              // NEW
});
```

**Lines 189-290**: Enhanced UI with:
- Procurement Type selector (Bulk/Drummed)
- Packaging Type dropdown (shows available packaging materials)
- Package Quantity input (number of drums/IBCs)
- Net Weight per Package input (kg per drum)
- Conditional display (packaging fields only shown when "Drummed" is selected)

### 4. Product-Packaging Report Enhancement (`backend/server.py`)
**Lines 7404-7460**: Updated report to read from `product_packaging` collection:
```python
# Check product_packaging collection for actual packaging stock
product_packaging_records = await db.product_packaging.find(
    {"product_id": product_id},
    {"_id": 0}
).to_list(100)

if product_packaging_records:
    # Use product_packaging records for accurate packaging info
    for pp_record in product_packaging_records:
        packaging_name = pp_record.get("packaging_name")
        packaging_qty = pp_record.get("quantity", 0)
        net_weight_kg = pp_record.get("net_weight_kg")
        # ... calculate and display
```

## How to Use

### Creating a GRN with Product + Package

1. Go to **GRN Page** → Click **"New GRN"**
2. Enter supplier information
3. Select product (e.g., "IPA Pure")
4. Set **Procurement Type** to **"Drummed/Packaged"**
5. Enter **Quantity** (e.g., 14.8) and **Unit** (e.g., MT)
6. In the packaging section:
   - Select **Packaging Type** (e.g., "Steel Drum 210L")
   - Enter **Package Qty** (e.g., 80 drums)
   - Enter **Net Weight/Package** (e.g., 185 kg per drum)
7. Click **"Add Item"**
8. Click **"Create GRN"**

### Result
After creating the GRN:
- ✅ **Product stock updated**: IPA Pure +14.8 MT
- ✅ **Packaging stock updated**: Steel Drums +80 units
- ✅ **Inventory page shows**: Both product and packaging
- ✅ **Stock Management page shows**: Updated balances
- ✅ **Product-Packaging Report shows**: 80 drums × 185kg = 14.8 MT

## Testing Checklist

- [ ] Create GRN with Bulk procurement (existing functionality)
- [ ] Create GRN with Drummed procurement (new functionality)
- [ ] Verify product stock updated in Inventory page
- [ ] Verify packaging stock updated in Stock Management page
- [ ] Verify Product-Packaging Report shows correct data
- [ ] Create GRN linked to PO (existing flow still works)
- [ ] Create manual GRN without PO (new flow works)

## Files Modified

1. `backend/server.py`
   - GRNItem model (lines 624-634)
   - GRN creation logic (lines 4925-5075)
   - Product-packaging report (lines 7404-7460)

2. `frontend/src/pages/GRNPage.js`
   - Form state (lines 32-42)
   - UI form fields (lines 189-290)
   - Item table display (lines 292-330)

## Database Collections Updated

- `grn` - GRN records with packaging info
- `inventory_balances` - Product and packaging stock
- `inventory_movements` - Movement history for both
- `product_packaging` - Product-packaging relationships

## Notes

- The fix is **backward compatible** - existing GRNs without packaging info continue to work
- Manual GRNs now support packaging without requiring a PO
- The system automatically updates both product and packaging stock in a single transaction
- Product-packaging report now shows real-time data from the `product_packaging` collection

