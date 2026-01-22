---
name: Transport Security QC Shipping Enhancements
overview: "Implement 5 enhancements: remove COMPLETED status from Inward EXW, add vehicle type to transport booking modal, chronological sorting and delivery note display in security page, update QC page columns, and separate import/export tables in shipping page with dual booking modal."
todos: []
---

# Transport, Security, QC, and Shipping Page Enhancements

## Overview

This plan implements 5 separate enhancements across the transportation, security, QC, and shipping modules to improve workflow and data presentation.

## 1. Remove COMPLETED Status from Inward Transport (EXW)

### Files to Modify

- `frontend/src/pages/TransportWindowPage.js`

### Changes

1. **Filter COMPLETED status** in `InwardEXWTab` component (line ~803)

   - Filter transports to exclude `status === 'COMPLETED'` before rendering
   - Update the component to receive filtered list or filter internally

2. **Remove COMPLETED from status color function** (line ~805)

   - Remove the `case 'COMPLETED'` from `getStatusColor` switch statement
   - Keep only: PENDING, IN_TRANSIT, ARRIVED

3. **Remove status update button for COMPLETED**

   - Ensure no action buttons appear for COMPLETED status items

### Implementation Details

```javascript
// In InwardEXWTab component
const filteredTransports = transports.filter(t => t.status !== 'COMPLETED');

// In getStatusColor function - remove:
// case 'COMPLETED': return 'bg-green-500/20 text-green-400';
```

---

## 2. Add Vehicle Type to Transportation Booking Modal

### Files to Modify

- `frontend/src/pages/TransportWindowPage.js`
- `backend/server.py` (verify vehicle_type is stored)

### Frontend Changes

1. **Add vehicle_type to form state** in `TransportBookingModal` (line ~1141)

   - Add `vehicle_type: ''` to initial form state

2. **Add Vehicle Type select field** in modal form (after transporter field, ~line 1300)

   - Use Select component with options: tanker, container, trailer, truck, other
   - Make it required field

3. **Include vehicle_type in API calls** (lines ~1167, ~1196)

   - Add `vehicle_type: form.vehicle_type` to `/transport/inward/book` payload
   - Add `vehicle_type: form.vehicle_type` to `/transport/outward/book` payload
   - Remove hardcoded `vehicle_type: bookingType === 'EXPORT_CONTAINER' ? 'container' : 'tanker'`

### Backend Verification

- Verify `/transport/inward/book` endpoint accepts and stores `vehicle_type` (line ~12875)
- Verify `/transport/outward/book` endpoint accepts and stores `vehicle_type` (line ~12928)
- Both endpoints should already support this based on grep results

### Implementation Details

```javascript
// Add to form state
vehicle_type: '',

// Add Select field
<Select value={form.vehicle_type} onValueChange={(v) => setForm({...form, vehicle_type: v})}>
  <SelectItem value="tanker">Tanker</SelectItem>
  <SelectItem value="container">Container</SelectItem>
  <SelectItem value="trailer">Trailer</SelectItem>
  <SelectItem value="truck">Truck</SelectItem>
  <SelectItem value="other">Other</SelectItem>
</Select>

// Include in API payload
vehicle_type: form.vehicle_type,
```

---

## 3. Security Page: Chronological Order + Delivery Note Integration

### Files to Modify

- `frontend/src/pages/SecurityQCPage.js`

### Changes

1. **Sort transports chronologically** in `loadData` function (line ~65)

   - Sort `inwardFiltered` by `eta` or `delivery_date` (ascending - earliest first)
   - Sort `outwardFiltered` by `eta` or `delivery_date` (ascending)
   - Use fallback to `created_at` if date fields missing

2. **Add Delivery Note column** to `InwardTransportTab` table (line ~374)

   - Add new `<th>Delivery Note</th>` column header
   - Display delivery note number as badge
   - Add button to view delivery note document if available
   - Handle both `delivery_note_number` and `delivery_note_document` fields

3. **Add Delivery Note column** to `OutwardTransportTab` table (line ~496)

   - Same implementation as inward tab

4. **Remove separate delivery note page/tab** (if exists)

   - Ensure delivery notes are shown inline, not in separate view

### Implementation Details

```javascript
// Sort in loadData
const inwardFiltered = (inwardRes.data || [])
  .filter(...)
  .sort((a, b) => {
    const dateA = new Date(a.eta || a.delivery_date || a.created_at || 0);
    const dateB = new Date(b.eta || b.delivery_date || b.created_at || 0);
    return dateA - dateB; // Ascending
  });

// Add column in table
<th>Delivery Note</th>
<td>
  {transport.delivery_note_number ? (
    <div className="flex items-center gap-2">
      <Badge variant="outline">{transport.delivery_note_number}</Badge>
      {transport.delivery_note_document && (
        <Button onClick={() => openDocument(transport.delivery_note_document)}>
          <FileText /> View
        </Button>
      )}
    </div>
  ) : '-'}
</td>
```

---

## 4. QC Page: Update Columns (Remove QC#/Reference, Add Seal/Container/Vehicle/Delivery Note)

### Files to Modify

- `frontend/src/pages/QCInspectionPage.js`
- `backend/server.py` (may need to enrich QC inspection data with security checklist fields)

### Frontend Changes

1. **Update PendingInspectionsTab table** (line ~216)

   - **Remove columns**: QC #, Reference
   - **Add columns**: Seal Number, Container Number, Vehicle Type, Delivery Note
   - Update table body to display new fields

2. **Update CompletedInspectionsTab table** (line ~272)

   - Apply same column changes

3. **Data source for new fields**:

   - Seal Number: `inspection.security_checklist?.seal_number` or `inspection.seal_number`
   - Container Number: `inspection.security_checklist?.container_number` or `inspection.container_number`
   - Vehicle Type: `inspection.vehicle_type` or from related transport record
   - Delivery Note: `inspection.delivery_note_number` and `inspection.delivery_note_document`

4. **Add Delivery Note view button**

   - Button to open delivery note document (similar to security page implementation)

### Backend Changes (if needed)

- Verify QC inspection endpoint (`/qc/inspections`) returns security checklist data
- May need to enrich QC inspection response with related transport/security checklist fields
- Check if `ref_id` links to transport which has security_checklist (line ~11767)

### Implementation Details

```javascript
// Remove these columns:
<th>QC #</th>
<th>Reference</th>

// Add these columns:
<th>Seal Number</th>
<th>Container Number</th>
<th>Vehicle Type</th>
<th>Delivery Note</th>

// In table body:
<td>{inspection.seal_number || inspection.security_checklist?.seal_number || '-'}</td>
<td>{inspection.container_number || inspection.security_checklist?.container_number || '-'}</td>
<td>
  {inspection.vehicle_type ? (
    <Badge variant="outline" className="capitalize">{inspection.vehicle_type}</Badge>
  ) : '-'}
</td>
<td>
  {inspection.delivery_note_number ? (
    <Button onClick={() => openDeliveryNote(inspection.delivery_note_document)}>
      <FileText /> View
    </Button>
  ) : '-'}
</td>
```

---

## 5. Shipping Page: Import/Export Tables + Dual Booking Modal

### Files to Modify

- `frontend/src/pages/ShippingPage.js`

### Changes

1. **Add state for booking type and active tab** (line ~20)

   - `const [bookingType, setBookingType] = useState(null); // 'import' or 'export'`
   - `const [activeTab, setActiveTab] = useState('export'); // 'import' or 'export'`
   - `const [jobOrders, setJobOrders] = useState([]);` (for export bookings)

2. **Separate bookings into Import and Export** (in `loadData`, line ~80)

   - Import bookings: `bookings.filter(b => b.ref_type === 'PO_IMPORT' || b.po_id)`
   - Export bookings: `bookings.filter(b => b.ref_type !== 'PO_IMPORT' && !b.po_id)`
   - Sort both by `created_at` or `vessel_date` (descending - newest first)

3. **Load Job Orders for Export** (in `loadData`)

   - Add API call: `jobOrderAPI.getAll('ready_for_dispatch')`
   - Store in `jobOrders` state

4. **Update New Booking button** (line ~377)

   - Change to open selection dialog first
   - Show two options: "Import Booking (PO)" and "Export Booking (Job Order)"
   - Set `bookingType` based on selection
   - Then show appropriate form (PO selection or Job Order selection)

5. **Add tabs for Import/Export tables** (before bookings table, line ~717)

   - Two tabs: "Import Bookings" and "Export Bookings"
   - Show count in tab labels
   - Render appropriate table based on `activeTab`

6. **Update table columns based on type**

   - Import table: Show PO #, Supplier columns
   - Export table: Show Job #, Customer columns
   - Both tables: Show Booking #, Shipping Line, Container, CRO #, Vessel, Status, Actions

7. **Update booking creation logic** (line ~203)

   - If `bookingType === 'import'`: Use existing PO selection logic
   - If `bookingType === 'export'`: Show Job Order selection (similar to PO selection)
   - Update `handleCreate` to handle both types

### Implementation Details

```javascript
// Add state
const [bookingType, setBookingType] = useState(null);
const [activeTab, setActiveTab] = useState('export');
const [jobOrders, setJobOrders] = useState([]);

// Separate and sort bookings
const importBookings = bookings.filter(b => b.ref_type === 'PO_IMPORT' || b.po_id)
  .sort((a, b) => new Date(b.created_at || b.vessel_date || 0) - new Date(a.created_at || a.vessel_date || 0));
const exportBookings = bookings.filter(b => b.ref_type !== 'PO_IMPORT' && !b.po_id)
  .sort((a, b) => new Date(b.created_at || b.vessel_date || 0) - new Date(a.created_at || a.vessel_date || 0));

// Booking type selection dialog
<Dialog open={createOpen && !bookingType}>
  <DialogContent>
    <Button onClick={() => setBookingType('import')}>Import Booking (PO)</Button>
    <Button onClick={() => setBookingType('export')}>Export Booking (Job Order)</Button>
  </DialogContent>
</Dialog>

// Show appropriate form based on bookingType
{bookingType === 'import' && (
  // PO selection form (existing)
)}
{bookingType === 'export' && (
  // Job Order selection form (new)
)}

// Tabs
<div className="flex gap-2 mb-4">
  <Button variant={activeTab === 'import' ? 'default' : 'outline'} onClick={() => setActiveTab('import')}>
    Import Bookings ({importBookings.length})
  </Button>
  <Button variant={activeTab === 'export' ? 'default' : 'outline'} onClick={() => setActiveTab('export')}>
    Export Bookings ({exportBookings.length})
  </Button>
</div>

// Render table based on activeTab
{activeTab === 'import' && <ImportBookingsTable bookings={importBookings} />}
{activeTab === 'export' && <ExportBookingsTable bookings={exportBookings} />}
```

### Data Flow

- Import bookings: PO → Shipping Booking → Transport → Security → QC → GRN
- Export bookings: Job Order → Shipping Booking → Transport → Security → QC → Delivery Order
- Both appear in their respective tables after creation
- Tables sorted chronologically by creation/vessel date

---

## Testing Checklist

1. Verify Inward EXW no longer shows COMPLETED status
2. Test vehicle type selection and storage in transport booking
3. Verify security page sorts by delivery date and shows delivery notes
4. Verify QC page shows seal/container/vehicle type and delivery note button
5. Test shipping page import/export separation and dual booking modal
6. Verify all chronological sorting works correctly
7. Test delivery note document viewing functionality

---

## Notes

- Delivery notes are already stored in transport records (`delivery_note_number`, `delivery_note_document`)
- Vehicle type is already supported in backend, just needs frontend form field
- QC inspections link to transports via `ref_id`, which should have security_checklist data
- Shipping bookings already distinguish between PO_IMPORT and export types via `ref_type` field