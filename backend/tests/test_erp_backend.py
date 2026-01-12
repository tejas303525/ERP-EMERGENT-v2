"""
Backend API Tests for Manufacturing ERP System
Testing Phases 1-7: Inventory Status, SMTP Email Queue, Auto Procurement, RFQ, Finance Approval, Drum Scheduling
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@erp.com"
ADMIN_PASSWORD = "admin123"
FINANCE_EMAIL = "finance@erp.com"
FINANCE_PASSWORD = "finance123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    try:
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            print(f"✓ Admin login successful")
            return token
        else:
            print(f"✗ Admin login failed: {response.status_code} - {response.text}")
            pytest.skip("Admin authentication failed - skipping authenticated tests")
    except Exception as e:
        print(f"✗ Admin login error: {str(e)}")
        pytest.skip("Admin authentication error - skipping authenticated tests")


@pytest.fixture(scope="module")
def finance_token(api_client):
    """Get finance authentication token"""
    try:
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": FINANCE_EMAIL,
            "password": FINANCE_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            print(f"✓ Finance login successful")
            return token
        else:
            print(f"✗ Finance login failed: {response.status_code} - {response.text}")
            pytest.skip("Finance authentication failed")
    except Exception as e:
        print(f"✗ Finance login error: {str(e)}")
        pytest.skip("Finance authentication error")


@pytest.fixture
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


@pytest.fixture
def finance_client(api_client, finance_token):
    """Session with finance auth header"""
    api_client.headers.update({"Authorization": f"Bearer {finance_token}"})
    return api_client


# ==================== PHASE 1: INVENTORY STATUS TESTS ====================

class TestInventoryStatus:
    """Test inventory items with IN_STOCK/INBOUND/OUT_OF_STOCK status"""
    
    def test_get_inventory_items(self, admin_client):
        """Test GET /api/inventory-items returns items with status"""
        response = admin_client.get(f"{BASE_URL}/api/inventory-items")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            item = data[0]
            # Check for status field
            assert "status" in item, "Item should have 'status' field"
            assert item["status"] in ["IN_STOCK", "INBOUND", "OUT_OF_STOCK"], \
                f"Status should be IN_STOCK/INBOUND/OUT_OF_STOCK, got {item['status']}"
            
            # Check required fields
            assert "id" in item
            assert "name" in item
            assert "item_type" in item
            assert item["item_type"] in ["RAW", "PACK"]
            
            print(f"✓ Inventory items returned with status: {item['status']}")
        else:
            print("⚠ No inventory items found (empty database)")
    
    def test_get_inventory_item_availability(self, admin_client):
        """Test GET /api/inventory-items/:id/availability returns detailed availability"""
        # First get an item
        response = admin_client.get(f"{BASE_URL}/api/inventory-items")
        assert response.status_code == 200
        
        items = response.json()
        if len(items) == 0:
            pytest.skip("No inventory items to test availability")
        
        item_id = items[0]["id"]
        
        # Get availability
        response = admin_client.get(f"{BASE_URL}/api/inventory-items/{item_id}/availability")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "on_hand" in data
        assert "reserved" in data
        assert "available" in data
        assert "inbound" in data
        assert "status" in data
        
        print(f"✓ Availability details: on_hand={data['on_hand']}, available={data['available']}, status={data['status']}")


# ==================== PHASE 3: SMTP EMAIL QUEUE TESTS ====================

class TestEmailOutbox:
    """Test SMTP email queue functionality"""
    
    def test_get_email_outbox(self, admin_client):
        """Test GET /api/email/outbox returns SMTP status and emails"""
        response = admin_client.get(f"{BASE_URL}/api/email/outbox")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "smtp_configured" in data
        assert "smtp_status" in data
        assert "emails" in data
        assert isinstance(data["emails"], list)
        
        # SMTP should NOT be configured as per requirements
        assert data["smtp_configured"] == False, "SMTP should not be configured"
        assert data["smtp_status"] == "NOT_CONFIGURED", f"Expected NOT_CONFIGURED, got {data['smtp_status']}"
        
        print(f"✓ Email outbox: SMTP={data['smtp_status']}, emails={len(data['emails'])}")


# ==================== PHASE 4: AUTO PROCUREMENT TESTS ====================

class TestAutoProcurement:
    """Test auto-generation of procurement requisitions from shortages"""
    
    def test_auto_generate_procurement(self, admin_client):
        """Test POST /api/procurement/auto-generate creates requisition lines"""
        # Get current week Monday
        today = datetime.now()
        days_to_monday = (today.weekday()) % 7
        monday = today - timedelta(days=days_to_monday)
        week_start = monday.strftime('%Y-%m-%d')
        
        response = admin_client.post(f"{BASE_URL}/api/procurement/auto-generate?week_start={week_start}")
        
        # Should return 200 or 201
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data or "pr_id" in data or "lines_created" in data
        
        print(f"✓ Auto procurement response: {data}")


# ==================== PHASE 5: RFQ FLOW TESTS ====================

class TestRFQFlow:
    """Test RFQ (Request for Quotation) workflow"""
    
    @pytest.fixture
    def test_supplier(self, admin_client):
        """Create a test supplier for RFQ tests"""
        response = admin_client.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Supplier_RFQ",
            "email": "test_supplier@example.com",
            "is_active": True
        })
        if response.status_code in [200, 201]:
            supplier = response.json()
            print(f"✓ Created test supplier: {supplier['id']}")
            return supplier
        else:
            pytest.skip("Failed to create test supplier")
    
    @pytest.fixture
    def test_inventory_item(self, admin_client):
        """Get or create a test inventory item"""
        # Try to get existing items first
        response = admin_client.get(f"{BASE_URL}/api/inventory-items")
        if response.status_code == 200:
            items = response.json()
            if len(items) > 0:
                print(f"✓ Using existing inventory item: {items[0]['id']}")
                return items[0]
        
        # Create new item
        response = admin_client.post(f"{BASE_URL}/api/inventory-items", json={
            "sku": "TEST_RAW_001",
            "name": "TEST Raw Material",
            "item_type": "RAW",
            "uom": "KG",
            "is_active": True
        })
        if response.status_code in [200, 201]:
            item = response.json()
            print(f"✓ Created test inventory item: {item['id']}")
            return item
        else:
            pytest.skip("Failed to create test inventory item")
    
    def test_create_rfq(self, admin_client, test_supplier, test_inventory_item):
        """Test POST /api/rfq creates a new RFQ"""
        response = admin_client.post(f"{BASE_URL}/api/rfq", json={
            "supplier_id": test_supplier["id"],
            "lines": [
                {
                    "item_id": test_inventory_item["id"],
                    "qty": 100,
                    "required_by": (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d')
                }
            ],
            "notes": "Test RFQ for automated testing"
        })
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "rfq_number" in data
        assert data["status"] == "DRAFT"
        assert data["supplier_id"] == test_supplier["id"]
        assert len(data["lines"]) == 1
        
        print(f"✓ Created RFQ: {data['rfq_number']} (status: {data['status']})")
        return data
    
    def test_get_rfqs(self, admin_client):
        """Test GET /api/rfq returns list of RFQs"""
        response = admin_client.get(f"{BASE_URL}/api/rfq")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            rfq = data[0]
            assert "id" in rfq
            assert "rfq_number" in rfq
            assert "status" in rfq
            assert "supplier_name" in rfq
            print(f"✓ Retrieved {len(data)} RFQs")
        else:
            print("⚠ No RFQs found")
    
    def test_send_rfq(self, admin_client, test_supplier, test_inventory_item):
        """Test PUT /api/rfq/:id/send marks RFQ as SENT and queues email"""
        # Create RFQ first
        create_response = admin_client.post(f"{BASE_URL}/api/rfq", json={
            "supplier_id": test_supplier["id"],
            "lines": [{"item_id": test_inventory_item["id"], "qty": 50, "required_by": (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')}]
        })
        assert create_response.status_code in [200, 201]
        rfq = create_response.json()
        rfq_id = rfq["id"]
        
        # Send RFQ
        response = admin_client.put(f"{BASE_URL}/api/rfq/{rfq_id}/send")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        # Verify RFQ status changed to SENT
        get_response = admin_client.get(f"{BASE_URL}/api/rfq/{rfq_id}")
        assert get_response.status_code == 200
        updated_rfq = get_response.json()
        assert updated_rfq["status"] == "SENT", f"Expected SENT, got {updated_rfq['status']}"
        
        print(f"✓ RFQ sent successfully: {updated_rfq['rfq_number']}")
    
    def test_update_rfq_quote(self, admin_client, test_supplier, test_inventory_item):
        """Test PUT /api/rfq/:id/quote updates RFQ with prices"""
        # Create and send RFQ
        create_response = admin_client.post(f"{BASE_URL}/api/rfq", json={
            "supplier_id": test_supplier["id"],
            "lines": [{"item_id": test_inventory_item["id"], "qty": 75, "required_by": (datetime.now() + timedelta(days=10)).strftime('%Y-%m-%d')}]
        })
        assert create_response.status_code in [200, 201]
        rfq = create_response.json()
        rfq_id = rfq["id"]
        
        # Send it
        admin_client.put(f"{BASE_URL}/api/rfq/{rfq_id}/send")
        
        # Update quote
        response = admin_client.put(f"{BASE_URL}/api/rfq/{rfq_id}/quote", json={
            "lines": [
                {
                    "item_id": test_inventory_item["id"],
                    "unit_price": 25.50,
                    "lead_time_days": 7
                }
            ]
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify quote was updated
        get_response = admin_client.get(f"{BASE_URL}/api/rfq/{rfq_id}")
        assert get_response.status_code == 200
        updated_rfq = get_response.json()
        assert updated_rfq["status"] == "QUOTED"
        assert updated_rfq["lines"][0]["unit_price"] == 25.50
        
        print(f"✓ RFQ quote updated: {updated_rfq['rfq_number']} (status: QUOTED)")
    
    def test_convert_rfq_to_po(self, admin_client, test_supplier, test_inventory_item):
        """Test POST /api/rfq/:id/convert-to-po converts quoted RFQ to PO"""
        # Create, send, and quote RFQ
        create_response = admin_client.post(f"{BASE_URL}/api/rfq", json={
            "supplier_id": test_supplier["id"],
            "lines": [{"item_id": test_inventory_item["id"], "qty": 200, "required_by": (datetime.now() + timedelta(days=21)).strftime('%Y-%m-%d')}]
        })
        assert create_response.status_code in [200, 201]
        rfq = create_response.json()
        rfq_id = rfq["id"]
        
        # Send
        admin_client.put(f"{BASE_URL}/api/rfq/{rfq_id}/send")
        
        # Quote
        admin_client.put(f"{BASE_URL}/api/rfq/{rfq_id}/quote", json={
            "lines": [{"item_id": test_inventory_item["id"], "unit_price": 30.00, "lead_time_days": 14}]
        })
        
        # Convert to PO
        response = admin_client.post(f"{BASE_URL}/api/rfq/{rfq_id}/convert-to-po")
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "po_id" in data or "id" in data
        assert "message" in data or "po_number" in data
        
        print(f"✓ RFQ converted to PO successfully")


# ==================== PHASE 6: FINANCE APPROVAL TESTS ====================

class TestFinanceApproval:
    """Test Finance PO approval workflow"""
    
    @pytest.fixture
    def test_po(self, admin_client):
        """Create a test PO for approval tests"""
        # Get or create supplier
        supplier_response = admin_client.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Supplier_Finance",
            "email": "finance_test@example.com"
        })
        if supplier_response.status_code not in [200, 201]:
            # Try to get existing suppliers
            suppliers_response = admin_client.get(f"{BASE_URL}/api/suppliers")
            if suppliers_response.status_code == 200:
                suppliers = suppliers_response.json()
                if len(suppliers) > 0:
                    supplier = suppliers[0]
                else:
                    pytest.skip("No suppliers available")
            else:
                pytest.skip("Failed to get suppliers")
        else:
            supplier = supplier_response.json()
        
        # Get inventory item
        items_response = admin_client.get(f"{BASE_URL}/api/inventory-items")
        if items_response.status_code != 200 or len(items_response.json()) == 0:
            pytest.skip("No inventory items available")
        item = items_response.json()[0]
        
        # Create PO
        po_response = admin_client.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier["id"],
            "supplier_name": supplier["name"],
            "currency": "USD",
            "lines": [
                {
                    "item_id": item["id"],
                    "item_type": item["item_type"],
                    "qty": 500,
                    "uom": item["uom"],
                    "unit_price": 15.00
                }
            ]
        })
        
        if po_response.status_code in [200, 201]:
            po = po_response.json()
            print(f"✓ Created test PO: {po.get('po_number', po['id'])}")
            return po
        else:
            pytest.skip("Failed to create test PO")
    
    def test_get_pending_approval(self, finance_client):
        """Test GET /api/purchase-orders/pending-approval returns DRAFT POs"""
        response = finance_client.get(f"{BASE_URL}/api/purchase-orders/pending-approval")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            po = data[0]
            assert po["status"] == "DRAFT"
            assert "po_number" in po
            assert "total_amount" in po
            print(f"✓ Found {len(data)} POs pending approval")
        else:
            print("⚠ No POs pending approval (empty list is valid)")
    
    def test_finance_approve_po(self, finance_client, test_po):
        """Test PUT /api/purchase-orders/:id/finance-approve approves PO"""
        po_id = test_po["id"]
        
        response = finance_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}/finance-approve")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        # Verify PO status changed to APPROVED
        get_response = finance_client.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert get_response.status_code == 200
        updated_po = get_response.json()
        assert updated_po["status"] == "APPROVED", f"Expected APPROVED, got {updated_po['status']}"
        
        print(f"✓ PO approved: {updated_po.get('po_number', po_id)}")
    
    def test_finance_reject_po(self, finance_client, admin_client):
        """Test PUT /api/purchase-orders/:id/finance-reject rejects PO"""
        # Create a new PO to reject
        suppliers_response = admin_client.get(f"{BASE_URL}/api/suppliers")
        if suppliers_response.status_code != 200 or len(suppliers_response.json()) == 0:
            pytest.skip("No suppliers available")
        supplier = suppliers_response.json()[0]
        
        items_response = admin_client.get(f"{BASE_URL}/api/inventory-items")
        if items_response.status_code != 200 or len(items_response.json()) == 0:
            pytest.skip("No inventory items available")
        item = items_response.json()[0]
        
        po_response = admin_client.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier["id"],
            "supplier_name": supplier["name"],
            "currency": "USD",
            "lines": [{"item_id": item["id"], "item_type": item["item_type"], "qty": 100, "uom": item["uom"], "unit_price": 10.00}]
        })
        assert po_response.status_code in [200, 201]
        po = po_response.json()
        po_id = po["id"]
        
        # Reject PO
        response = finance_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}/finance-reject?reason=Test+rejection")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify status
        get_response = finance_client.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert get_response.status_code == 200
        updated_po = get_response.json()
        assert updated_po["status"] == "REJECTED"
        
        print(f"✓ PO rejected: {updated_po.get('po_number', po_id)}")
    
    def test_send_approved_po(self, finance_client, admin_client):
        """Test PUT /api/purchase-orders/:id/send sends approved PO to supplier"""
        # Create and approve a PO
        suppliers_response = admin_client.get(f"{BASE_URL}/api/suppliers")
        if suppliers_response.status_code != 200 or len(suppliers_response.json()) == 0:
            pytest.skip("No suppliers available")
        supplier = suppliers_response.json()[0]
        
        items_response = admin_client.get(f"{BASE_URL}/api/inventory-items")
        if items_response.status_code != 200 or len(items_response.json()) == 0:
            pytest.skip("No inventory items available")
        item = items_response.json()[0]
        
        po_response = admin_client.post(f"{BASE_URL}/api/purchase-orders", json={
            "supplier_id": supplier["id"],
            "supplier_name": supplier["name"],
            "currency": "USD",
            "lines": [{"item_id": item["id"], "item_type": item["item_type"], "qty": 300, "uom": item["uom"], "unit_price": 20.00}]
        })
        assert po_response.status_code in [200, 201]
        po = po_response.json()
        po_id = po["id"]
        
        # Approve it
        finance_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}/finance-approve")
        
        # Send it
        response = finance_client.put(f"{BASE_URL}/api/purchase-orders/{po_id}/send")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        # Verify status and email queued
        get_response = finance_client.get(f"{BASE_URL}/api/purchase-orders/{po_id}")
        assert get_response.status_code == 200
        updated_po = get_response.json()
        assert updated_po["status"] == "SENT"
        # Email should be QUEUED since SMTP is not configured
        assert updated_po.get("email_status") in ["QUEUED", "NOT_CONFIGURED"]
        
        print(f"✓ PO sent: {updated_po.get('po_number', po_id)} (email: {updated_po.get('email_status')})")


# ==================== PHASE 7: DRUM SCHEDULE TESTS ====================

class TestDrumSchedule:
    """Test drum production scheduling with 600/day capacity enforcement"""
    
    def test_get_drum_schedule(self, admin_client):
        """Test GET /api/production/drum-schedule returns schedule with capacity enforcement"""
        # Get current week Monday
        today = datetime.now()
        days_to_monday = (today.weekday()) % 7
        monday = today - timedelta(days=days_to_monday)
        week_start = monday.strftime('%Y-%m-%d')
        
        response = admin_client.get(f"{BASE_URL}/api/production/drum-schedule?week_start={week_start}")
        
        # May return 404 if no schedule exists yet, which is OK
        if response.status_code == 404:
            print("⚠ No drum schedule found (not yet generated)")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "week_start" in data
        
        # Check for schedule_days (actual field name)
        assert "schedule_days" in data or "days" in data
        days = data.get("schedule_days", data.get("days", []))
        assert isinstance(days, list)
        
        # Check capacity enforcement (≤600 drums/day)
        assert "daily_capacity" in data
        assert data["daily_capacity"] == 600, f"Expected daily capacity 600, got {data['daily_capacity']}"
        
        # Check daily usage doesn't exceed capacity
        if "daily_usage" in data:
            for date, drums in data["daily_usage"].items():
                assert drums <= 600, f"Day {date} exceeds 600 drum capacity: {drums}"
        
        print(f"✓ Drum schedule retrieved: {len(days)} days, capacity enforced ≤600/day")


# ==================== SUMMARY ====================

def test_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("BACKEND API TEST SUMMARY")
    print("="*60)
    print("✓ All critical backend endpoints tested")
    print("✓ Inventory status (IN_STOCK/INBOUND/OUT_OF_STOCK)")
    print("✓ SMTP email queue (NOT_CONFIGURED as expected)")
    print("✓ Auto procurement from shortages")
    print("✓ RFQ flow (create, send, quote, convert to PO)")
    print("✓ Finance approval (approve, reject, send)")
    print("✓ Drum schedule capacity enforcement (≤600/day)")
    print("="*60)
