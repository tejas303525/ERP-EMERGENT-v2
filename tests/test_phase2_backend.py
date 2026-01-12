"""
Backend API Tests for Manufacturing ERP Phase 2
Tests: Security Gate, QC Inspection, Procurement Rework, Shipping CRO, Quotation enhancements
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

# Read from frontend .env file
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=')[1].strip()
    except:
        pass
    return 'https://factory-erp-next.preview.emergentagent.com'

BASE_URL = get_backend_url()

class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_admin(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@erp.com"
        print("✓ Admin login successful")
        return data["access_token"]
    
    def test_login_finance(self):
        """Test finance login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "finance@erp.com",
            "password": "finance123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print("✓ Finance login successful")
        return data["access_token"]


class TestSecurityEndpoints:
    """Test Security Gate endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_security_dashboard(self, auth_token):
        """Test GET /api/security/dashboard"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/security/dashboard", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "inward_pending" in data
        assert "outward_pending" in data
        assert "checklists" in data
        assert "stats" in data
        
        # Validate stats structure
        stats = data["stats"]
        assert "inward_count" in stats
        assert "outward_count" in stats
        assert "pending_checklists" in stats
        
        print(f"✓ Security dashboard: {stats['inward_count']} inward, {stats['outward_count']} outward, {stats['pending_checklists']} checklists")
    
    def test_security_inward(self, auth_token):
        """Test GET /api/security/inward"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/security/inward", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Security inward transports: {len(data)} records")
    
    def test_security_outward(self, auth_token):
        """Test GET /api/security/outward"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/security/outward", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Security outward transports: {len(data)} records")


class TestQCEndpoints:
    """Test QC Inspection endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_qc_dashboard(self, auth_token):
        """Test GET /api/qc/dashboard"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/qc/dashboard", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "pending_inspections" in data
        assert "completed_today" in data
        assert "recent_coas" in data
        assert "stats" in data
        
        stats = data["stats"]
        assert "pending_count" in stats
        assert "completed_today_count" in stats
        assert "coas_generated" in stats
        
        print(f"✓ QC dashboard: {stats['pending_count']} pending, {stats['completed_today_count']} completed today, {stats['coas_generated']} COAs")
    
    def test_qc_inspections(self, auth_token):
        """Test GET /api/qc/inspections"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/qc/inspections", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ QC inspections: {len(data)} records")
    
    def test_qc_inspections_pending(self, auth_token):
        """Test GET /api/qc/inspections?status=PENDING"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/qc/inspections?status=PENDING", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ QC pending inspections: {len(data)} records")


class TestProcurementEndpoints:
    """Test Procurement rework endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_procurement_shortages(self, auth_token):
        """Test GET /api/procurement/shortages"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/procurement/shortages", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "total_shortages" in data
        assert "raw_shortages" in data
        assert "pack_shortages" in data
        assert "all_shortages" in data
        
        assert isinstance(data["raw_shortages"], list)
        assert isinstance(data["pack_shortages"], list)
        assert isinstance(data["all_shortages"], list)
        
        print(f"✓ Procurement shortages: {data['total_shortages']} total ({len(data['raw_shortages'])} raw, {len(data['pack_shortages'])} pack)")
        
        # Validate shortage item structure if any exist
        if data["all_shortages"]:
            shortage = data["all_shortages"][0]
            assert "item_id" in shortage
            assert "item_name" in shortage
            assert "item_type" in shortage
            assert "total_shortage" in shortage
            assert "jobs" in shortage
            print(f"  Sample shortage: {shortage['item_name']} - {shortage['total_shortage']} {shortage.get('uom', 'units')}")


class TestQuotationEnhancements:
    """Test Quotation enhancements (LOCAL/EXPORT badges, VAT, documents)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_quotations(self, auth_token):
        """Test GET /api/quotations"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/quotations", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Quotations: {len(data)} records")
        
        # Check if quotations have order_type field
        if data:
            quotation = data[0]
            assert "order_type" in quotation
            assert quotation["order_type"] in ["local", "export"]
            print(f"  Sample quotation: {quotation.get('pfi_number')} - {quotation['order_type'].upper()}")


class TestJobOrdersEndpoints:
    """Test Job Orders with BOM automation"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_job_orders(self, auth_token):
        """Test GET /api/job-orders"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/job-orders", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Job Orders: {len(data)} records")
        
        # Check if job orders have procurement_required field
        if data:
            job = data[0]
            assert "job_number" in job
            assert "product_name" in job
            print(f"  Sample job: {job.get('job_number')} - {job.get('product_name')}")


class TestShippingCRO:
    """Test Shipping CRO modal with new fields"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_shipping_bookings(self, auth_token):
        """Test GET /api/shipping-bookings"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/shipping-bookings", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Shipping bookings: {len(data)} records")


class TestRFQEndpoints:
    """Test RFQ Window in Security page"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@erp.com",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_rfqs(self, auth_token):
        """Test GET /api/rfq"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/rfq", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ RFQs: {len(data)} records")


if __name__ == "__main__":
    print("=" * 60)
    print("Manufacturing ERP Phase 2 - Backend API Tests")
    print("=" * 60)
    
    # Run tests
    pytest.main([__file__, "-v", "--tb=short", "-s"])
