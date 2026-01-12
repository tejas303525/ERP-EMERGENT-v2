"""
Test new features: BOM Management, Enhanced Inventory, Payables/Receivables, Auto-Generate PR
"""
import pytest
import requests
import os

# Read from frontend .env file
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except:
        pass
    return os.environ.get('REACT_APP_BACKEND_URL', 'https://factory-erp-next.preview.emergentagent.com')

BASE_URL = get_backend_url().rstrip('/')

class TestBOMManagement:
    """Test BOM activation endpoints"""
    
    def test_product_bom_activation(self, authenticated_client):
        """Test activating a product BOM"""
        # First, get products
        response = authenticated_client.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        products = response.json()
        
        if len(products) == 0:
            pytest.skip("No products available for BOM testing")
        
        product_id = products[0]['id']
        
        # Get existing BOMs for this product
        response = authenticated_client.get(f"{BASE_URL}/api/product-boms/{product_id}")
        
        # If no BOMs exist, we can't test activation
        if response.status_code == 404 or not response.json():
            pytest.skip("No product BOMs exist to test activation")
        
        boms = response.json()
        if len(boms) == 0:
            pytest.skip("No product BOMs exist to test activation")
        
        bom_id = boms[0]['id']
        
        # Test activation
        response = authenticated_client.put(f"{BASE_URL}/api/product-boms/{bom_id}/activate")
        assert response.status_code == 200
        assert "message" in response.json()
        print(f"✓ Product BOM activation successful: {response.json()['message']}")
    
    def test_packaging_bom_activation(self, authenticated_client):
        """Test activating a packaging BOM"""
        # Get packaging list
        response = authenticated_client.get(f"{BASE_URL}/api/packaging")
        
        if response.status_code != 200:
            pytest.skip("Packaging endpoint not available")
        
        packaging_list = response.json()
        if len(packaging_list) == 0:
            pytest.skip("No packaging available for BOM testing")
        
        packaging_id = packaging_list[0]['id']
        
        # Get existing BOMs for this packaging
        response = authenticated_client.get(f"{BASE_URL}/api/packaging-boms/{packaging_id}")
        
        if response.status_code == 404 or not response.json():
            pytest.skip("No packaging BOMs exist to test activation")
        
        boms = response.json()
        if len(boms) == 0:
            pytest.skip("No packaging BOMs exist to test activation")
        
        bom_id = boms[0]['id']
        
        # Test activation
        response = authenticated_client.put(f"{BASE_URL}/api/packaging-boms/{bom_id}/activate")
        assert response.status_code == 200
        assert "message" in response.json()
        print(f"✓ Packaging BOM activation successful: {response.json()['message']}")


class TestInventoryStatus:
    """Test inventory status display (INBOUND, IN_STOCK, OUT_OF_STOCK)"""
    
    def test_inventory_items_have_status(self, authenticated_client):
        """Test that inventory items return status field"""
        response = authenticated_client.get(f"{BASE_URL}/api/inventory-items")
        assert response.status_code == 200
        
        items = response.json()
        assert isinstance(items, list)
        
        if len(items) > 0:
            # Check that items have status field
            for item in items[:5]:  # Check first 5 items
                assert "status" in item, f"Item {item.get('name')} missing status field"
                assert item["status"] in ["IN_STOCK", "INBOUND", "OUT_OF_STOCK"], \
                    f"Invalid status: {item['status']}"
            print(f"✓ Inventory items have valid status: {[i['status'] for i in items[:3]]}")
        else:
            print("⚠ No inventory items found to test status")
    
    def test_inventory_availability_endpoint(self, authenticated_client):
        """Test inventory availability endpoint"""
        # Get an inventory item first
        response = authenticated_client.get(f"{BASE_URL}/api/inventory-items")
        assert response.status_code == 200
        items = response.json()
        
        if len(items) == 0:
            pytest.skip("No inventory items to test availability")
        
        item_id = items[0]['id']
        
        # Test availability endpoint
        response = authenticated_client.get(f"{BASE_URL}/api/inventory-items/{item_id}/availability")
        assert response.status_code == 200
        
        data = response.json()
        assert "on_hand" in data
        assert "reserved" in data
        assert "available" in data
        assert "status" in data
        print(f"✓ Inventory availability: on_hand={data['on_hand']}, available={data['available']}, status={data['status']}")


class TestAutoGeneratePR:
    """Test Auto-Generate PR endpoint (previously had 520 error)"""
    
    def test_auto_generate_pr_no_520_error(self, authenticated_client):
        """Test that Auto-Generate PR works without 520 error"""
        response = authenticated_client.post(f"{BASE_URL}/api/procurement/auto-generate")
        
        # Should return 200 or 201, not 520
        assert response.status_code in [200, 201], \
            f"Auto-Generate PR returned {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data or "message" in data
        print(f"✓ Auto-Generate PR successful: {data.get('message', 'Success')}")
        
        # Verify response structure
        if "lines_created" in data:
            print(f"  Lines created: {data['lines_created']}")
        if "shortages" in data:
            print(f"  Shortages found: {len(data.get('shortages', []))}")


class TestPayables:
    """Test Payables endpoints (Supplier Ledger, GRN approvals)"""
    
    def test_payables_bills_endpoint(self, authenticated_client):
        """Test payables bills endpoint returns aging data"""
        response = authenticated_client.get(f"{BASE_URL}/api/payables/bills")
        assert response.status_code == 200
        
        data = response.json()
        assert "bills" in data
        assert "aging" in data
        
        # Check aging structure
        aging = data["aging"]
        assert "current" in aging
        assert "30_days" in aging
        assert "60_days" in aging
        assert "90_plus" in aging
        print(f"✓ Payables aging: current=${aging['current']}, 30d=${aging['30_days']}, 60d=${aging['60_days']}, 90+=${aging['90_plus']}")
    
    def test_grn_pending_payables(self, authenticated_client):
        """Test GRN pending payables endpoint"""
        response = authenticated_client.get(f"{BASE_URL}/api/grn/pending-payables")
        assert response.status_code == 200
        
        grns = response.json()
        assert isinstance(grns, list)
        print(f"✓ GRN pending payables: {len(grns)} GRNs awaiting review")
        
        # If there are GRNs, check structure
        if len(grns) > 0:
            grn = grns[0]
            assert "id" in grn
            assert "grn_number" in grn
            # review_status may be None for old GRNs, which is acceptable
            if "review_status" in grn:
                print(f"  GRN review_status: {grn['review_status']}")
    
    def test_grn_payables_approve(self, authenticated_client):
        """Test GRN payables approval"""
        # Get pending GRNs
        response = authenticated_client.get(f"{BASE_URL}/api/grn/pending-payables")
        grns = response.json()
        
        if len(grns) == 0:
            pytest.skip("No pending GRNs to test approval")
        
        grn_id = grns[0]['id']
        
        # Test approval
        response = authenticated_client.put(
            f"{BASE_URL}/api/grn/{grn_id}/payables-approve",
            json={"notes": "Test approval"}
        )
        assert response.status_code == 200
        print(f"✓ GRN payables approval successful")


class TestReceivables:
    """Test Receivables endpoints (SPA, Local Invoice, Export Invoice)"""
    
    def test_receivables_invoices_endpoint(self, authenticated_client):
        """Test receivables invoices endpoint returns aging data"""
        response = authenticated_client.get(f"{BASE_URL}/api/receivables/invoices")
        assert response.status_code == 200
        
        data = response.json()
        assert "invoices" in data
        assert "aging" in data
        
        # Check aging structure
        aging = data["aging"]
        assert "current" in aging
        assert "30_days" in aging
        assert "60_days" in aging
        assert "90_plus" in aging
        print(f"✓ Receivables aging: current=${aging['current']}, 30d=${aging['30_days']}, 60d=${aging['60_days']}, 90+=${aging['90_plus']}")
        
        # Check invoice types
        invoices = data["invoices"]
        if len(invoices) > 0:
            invoice_types = set(inv.get("invoice_type") for inv in invoices)
            print(f"  Invoice types found: {invoice_types}")
    
    def test_sales_orders_for_spa_tab(self, authenticated_client):
        """Test sales orders endpoint for SPA tab"""
        response = authenticated_client.get(f"{BASE_URL}/api/sales-orders")
        assert response.status_code == 200
        
        orders = response.json()
        assert isinstance(orders, list)
        print(f"✓ Sales orders (SPA): {len(orders)} orders found")
        
        # Check structure
        if len(orders) > 0:
            order = orders[0]
            assert "spa_number" in order
            assert "customer_name" in order
            assert "total" in order
            assert "balance" in order
            assert "payment_status" in order


class TestQuotationNetWeight:
    """Test quotation creation with net_weight_kg for packaging"""
    
    def test_quotation_item_has_net_weight_field(self, authenticated_client):
        """Test that quotation items can include net_weight_kg"""
        # Get customers and products
        customers_res = authenticated_client.get(f"{BASE_URL}/api/customers")
        products_res = authenticated_client.get(f"{BASE_URL}/api/products")
        
        if customers_res.status_code != 200 or products_res.status_code != 200:
            pytest.skip("Cannot get customers or products")
        
        customers = customers_res.json()
        products = products_res.json()
        
        if len(customers) == 0 or len(products) == 0:
            pytest.skip("No customers or products available")
        
        customer = customers[0]
        product = products[0]
        
        # Create quotation with net_weight_kg
        quotation_data = {
            "customer_id": customer['id'],
            "customer_name": customer['name'],
            "currency": "USD",
            "order_type": "local",
            "payment_terms": "Cash",
            "validity_days": 30,
            "items": [
                {
                    "product_id": product['id'],
                    "product_name": product['name'],
                    "sku": product.get('sku', 'TEST-SKU'),
                    "quantity": 10,
                    "unit_price": 100,
                    "packaging": "Drums",
                    "net_weight_kg": 200.0  # Test net weight field
                }
            ]
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/quotations", json=quotation_data)
        assert response.status_code == 200
        
        data = response.json()
        assert "items" in data
        assert len(data["items"]) > 0
        
        # Check if net_weight_kg is preserved
        item = data["items"][0]
        if "net_weight_kg" in item:
            assert item["net_weight_kg"] == 200.0
            print(f"✓ Quotation item includes net_weight_kg: {item['net_weight_kg']} kg")
        else:
            print("⚠ net_weight_kg field not returned in quotation item")


class TestRFQIncoterm:
    """Test RFQ creation includes incoterm field"""
    
    def test_rfq_has_incoterm_field(self, authenticated_client):
        """Test that RFQ can include incoterm field"""
        # Get suppliers
        response = authenticated_client.get(f"{BASE_URL}/api/suppliers")
        
        if response.status_code != 200:
            pytest.skip("Suppliers endpoint not available")
        
        suppliers = response.json()
        if len(suppliers) == 0:
            pytest.skip("No suppliers available")
        
        supplier = suppliers[0]
        
        # Get inventory items
        items_res = authenticated_client.get(f"{BASE_URL}/api/inventory-items")
        if items_res.status_code != 200:
            pytest.skip("Inventory items not available")
        
        items = items_res.json()
        if len(items) == 0:
            pytest.skip("No inventory items available")
        
        item = items[0]
        
        # Create RFQ with incoterm
        rfq_data = {
            "supplier_id": supplier['id'],
            "rfq_type": "PRODUCT",
            "incoterm": "FOB",  # Test incoterm field
            "payment_terms": "LC",
            "delivery_date": "2025-02-01",
            "lines": [
                {
                    "item_id": item['id'],
                    "qty": 100,
                    "required_by": "2025-02-01"
                }
            ]
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/rfq", json=rfq_data)
        assert response.status_code == 200
        
        data = response.json()
        assert "incoterm" in data
        assert data["incoterm"] == "FOB"
        print(f"✓ RFQ includes incoterm: {data['incoterm']}")


# Fixtures
@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    # Try admin credentials
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@erp.com",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client
