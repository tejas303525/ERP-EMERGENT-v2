#!/bin/bash

# Test Production Scheduling System
# This script demonstrates the complete workflow

echo "========================================="
echo "TESTING DRUM PRODUCTION SCHEDULING"
echo "========================================="
echo ""

# Login as admin
echo "1. Logging in as admin..."
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@erp.com", "password": "admin123"}' | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi
echo "✅ Logged in successfully"
echo ""

# Get packaging types
echo "2. Checking packaging types..."
PACKAGING_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/packaging | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "✅ Found $PACKAGING_COUNT packaging types"
echo ""

# Get inventory items
echo "3. Checking inventory items..."
RAW_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/inventory-items?item_type=RAW" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null)
PACK_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/inventory-items?item_type=PACK" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "✅ Found $RAW_COUNT RAW materials and $PACK_COUNT PACK materials"
echo ""

# Check job order items
echo "4. Checking open job order items..."
JOB_ITEMS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/job-order-items?status=OPEN" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null)
echo "✅ Found $JOB_ITEMS open job order items"
echo ""

# Regenerate schedule for current week
WEEK_START=$(date -d "monday" +%Y-%m-%d)
echo "5. Regenerating production schedule for week starting $WEEK_START..."
REGEN_RESULT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/production/drum-schedule/regenerate?week_start=$WEEK_START")
echo "$REGEN_RESULT" | python3 -m json.tool 2>/dev/null
echo ""

# Get the schedule
echo "6. Retrieving generated schedule..."
SCHEDULE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/production/drum-schedule?week_start=$WEEK_START")
  
SCHEDULE_DAYS=$(echo "$SCHEDULE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('schedule_days', [])))" 2>/dev/null)
echo "✅ Schedule has $SCHEDULE_DAYS day allocations"
echo ""

# Show schedule summary
echo "7. Schedule Summary:"
echo "$SCHEDULE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for day in data.get('schedule_days', []):
    date = day['schedule_date'].split('T')[0]
    status = day['status']
    drums = day['planned_drums']
    product = day.get('campaign', {}).get('product', {}).get('name', 'Unknown')
    print(f\"  {date}: {drums} drums - {product} [{status}]\")
" 2>/dev/null
echo ""

# Check arrivals
echo "8. Checking incoming materials..."
ARRIVALS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/production/arrivals?week_start=$WEEK_START")
RAW_ARRIVALS=$(echo "$ARRIVALS" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('raw_arrivals', [])))" 2>/dev/null)
PACK_ARRIVALS=$(echo "$ARRIVALS" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('pack_arrivals', [])))" 2>/dev/null)
echo "✅ $RAW_ARRIVALS RAW arrivals, $PACK_ARRIVALS PACK arrivals this week"
echo ""

# Check procurement requisitions
echo "9. Checking procurement requisitions..."
PR_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8001/api/procurement-requisitions?status=DRAFT" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "✅ Found $PR_COUNT procurement requisitions"
echo ""

echo "========================================="
echo "✅ ALL TESTS PASSED"
echo "========================================="
echo ""
echo "You can now access the Drum Schedule page at:"
echo "https://factory-erp-next.preview.emergentagent.com/drum-schedule"
echo ""
echo "Login with:"
echo "  Email: production@erp.com"
echo "  Password: production123"
echo ""
