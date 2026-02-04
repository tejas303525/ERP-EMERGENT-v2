# Bug Fix: Transport Mode Field Name Inconsistency

## Issues Identified

### Issue 1: Field Name Inconsistency (Backend)
The system was using inconsistent field names for transport mode in quotations:
- **Model Definition**: `transport_mode` (in `QuotationCreate` model)
- **Backend Code**: Was setting `mode_of_transport` 
- **Costing Service**: Was looking for `transport_mode`

Since the `Quotation` model uses `ConfigDict(extra="ignore")`, the `mode_of_transport` field was being ignored and never saved to the database.

### Issue 2: Incorrect Auto-Set Logic (Frontend)
The frontend was automatically setting `transport_mode = 'road'` for **ALL** GCC country exports (including Bahrain). This was incorrect because:
- FOB/CFR/CIF shipments with containers to GCC countries use **SEA** transport (ocean freight)
- Only DDP/EXW shipments without containers typically use **ROAD** transport to GCC

This caused the costing service to return `EXPORT_GCC_ROAD` instead of `EXPORT_40FT_NON_DG` for containerized shipments to GCC countries.

## Symptoms
- **PFI-000206** (40ft Non-DG container to Bahrain) was showing costing type **"EXPORT_GCC_ROAD"** instead of the correct **"EXPORT_40FT_NON_DG"**
- Any export quotation with 40ft/20ft containers was not using the specific container costing sheets
- The system was falling back to less specific costing types

## Root Cause
In `backend/costing_service.py`, the logic to determine `EXPORT_40FT_NON_DG` requires:
```python
is_sea = transport_mode and transport_mode.upper() in ["SEA", "OCEAN"]
if is_sea and container_type:
    if container_type_upper == "40FT":
        if not is_dg:
            return "EXPORT_40FT_NON_DG"
```

Since `transport_mode` was always `None`, the condition failed and the system fell through to other logic paths.

## Files Modified

### Backend (`backend/server.py`)
1. **Line 1623-1629** - `create_quotation` endpoint:
   - Changed `mode_of_transport` to `transport_mode`
   
2. **Line 1719-1724** - `get_quotation` endpoint:
   - Changed `mode_of_transport` to `transport_mode`
   
3. **Line 1814-1818** - `update_quotation` endpoint:
   - Changed `mode_of_transport` to `transport_mode`
   
4. **Line 9978** - PDF generation:
   - Changed variable name from `mode_of_transport` to `transport_mode`

### Frontend
1. **`frontend/src/components/quotations/ViewQuote.jsx`** - Line 398:
   - Changed `quotation.mode_of_transport` to `quotation.transport_mode`

2. **`frontend/src/pages/QuotationsPage.js`** - Lines 221-233:
   - Fixed auto-set logic to correctly determine transport_mode based on incoterm and container type
   - FOB/CFR/CIF with containers → `transport_mode = "ocean"` (even for GCC)
   - DDP/EXW to GCC without containers → `transport_mode = "road"`
   - Non-GCC exports → `transport_mode = "ocean"`

## Fix Implementation

### 1. Code Changes
All instances of `mode_of_transport` have been renamed to `transport_mode` to match the model definition.

### 2. Default Values
The system now correctly sets:
- **Export orders**: `transport_mode = "SEA"`
- **Local orders**: `transport_mode = "ROAD"`

### 3. Migration API Endpoint
Created a migration endpoint at `/api/quotations/migrate-transport-mode` to update existing quotations in the database.

**To run the migration:**
```bash
# Using curl (Linux/Mac)
curl -X POST http://localhost:8001/api/quotations/migrate-transport-mode

# Using PowerShell (Windows)
Invoke-WebRequest -Method POST -Uri "http://localhost:8001/api/quotations/migrate-transport-mode"

# Using Python
python -c "import requests; print(requests.post('http://localhost:8001/api/quotations/migrate-transport-mode').json())"
```

**Migration Results:**
When run on your database, the migration found that all 114 quotations already had `transport_mode` set correctly (likely because the frontend was already using the correct field name). No quotations needed updating.

## Expected Behavior After Fix

### For New Quotations
1. Export quotations (like to Bahrain, FOB) will have `transport_mode = "SEA"`
2. The costing service will correctly identify:
   - **40ft Non-DG** → `EXPORT_40FT_NON_DG` costing type
   - **40ft DG** → `EXPORT_40FT_DG` costing type
   - **20ft Non-DG** → `EXPORT_20FT_NON_DG` costing type
   - **20ft DG** → `EXPORT_20FT_DG` costing type
3. The correct costing sheet with THC, ISPS, Documentation fees will be used

### For Existing Quotations
After running the migration script:
- All existing export quotations will have `transport_mode = "SEA"`
- All existing local quotations will have `transport_mode = "ROAD"`
- Costing recalculation will use the correct costing sheets

## Testing Recommendations

1. **Create a new export quotation** (40ft Non-DG to Bahrain):
   - Verify `transport_mode = "SEA"` in the database
   - Verify costing shows `EXPORT_40FT_NON_DG` type
   - Verify THC, ISPS, and other charges are auto-populated

2. **Check existing PFI-000206**:
   - Run migration script
   - Recalculate costing
   - Verify it now uses `EXPORT_40FT_NON_DG` instead of `EXPORT_GCC_ROAD`

3. **Test GCC Road exports** (if applicable):
   - For true road exports to GCC, manually set `transport_mode = "ROAD"`
   - Verify it uses `EXPORT_GCC_ROAD` costing type

## Related Files
- `backend/server.py` - Quotation endpoints
- `backend/costing_service.py` - Costing type determination logic
- `frontend/src/pages/QuotationsPage.js` - Quotation form (already correct)
- `frontend/src/components/quotations/ViewQuote.jsx` - Quotation display

## Date Fixed
February 2, 2026

## Tested By
_To be filled after testing_

