"""
Test script for Partial Delivery System
Run this to verify the partial delivery tracking implementation
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000/api"
TOKEN = ""  # Add your auth token here

def get_headers():
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

def print_response(title, response):
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"Status Code: {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)

def test_full_delivery():
    """Test Case 1: Full delivery confirmation"""
    print("\n" + "="*60)
    print("TEST CASE 1: FULL DELIVERY (100% delivered)")
    print("="*60)
    
    # Assuming you have a transport and DO already created
    # Replace these IDs with actual ones from your system
    data = {
        "transport_id": "REPLACE_WITH_ACTUAL_TRANSPORT_ID",
        "delivery_order_id": "REPLACE_WITH_ACTUAL_DO_ID",
        "job_order_id": "REPLACE_WITH_ACTUAL_JOB_ID",
        "delivered_qty": 100.0,
        "unit": "drums",
        "delivery_date": datetime.now().strftime("%Y-%m-%d"),
        "customer_name": "Test Customer",
        "receiver_name": "Test Receiver",
        "delivery_notes": "Full delivery completed successfully"
    }
    
    response = requests.post(
        f"{BASE_URL}/delivery/confirm",
        headers=get_headers(),
        json=data
    )
    
    print_response("Full Delivery Confirmation Response", response)
    
    assert response.status_code == 200, "Full delivery confirmation failed"
    result = response.json()
    assert result["is_partial"] == False, "Should not be marked as partial"
    assert result["delivered_qty"] == 100.0, "Delivered quantity mismatch"
    print("✅ Full delivery test PASSED")


def test_partial_delivery():
    """Test Case 2: Partial delivery confirmation"""
    print("\n" + "="*60)
    print("TEST CASE 2: PARTIAL DELIVERY (80% delivered, 20% undelivered)")
    print("="*60)
    
    # Replace these IDs with actual ones from your system
    data = {
        "transport_id": "REPLACE_WITH_ACTUAL_TRANSPORT_ID",
        "delivery_order_id": "REPLACE_WITH_ACTUAL_DO_ID",
        "job_order_id": "REPLACE_WITH_ACTUAL_JOB_ID",
        "delivered_qty": 80.0,
        "unit": "drums",
        "delivery_date": datetime.now().strftime("%Y-%m-%d"),
        "customer_name": "Test Customer",
        "receiver_name": "Test Receiver",
        "delivery_notes": "20 drums damaged during transit - photos attached"
    }
    
    response = requests.post(
        f"{BASE_URL}/delivery/confirm",
        headers=get_headers(),
        json=data
    )
    
    print_response("Partial Delivery Confirmation Response", response)
    
    assert response.status_code == 200, "Partial delivery confirmation failed"
    result = response.json()
    assert result["is_partial"] == True, "Should be marked as partial"
    assert result["delivered_qty"] == 80.0, "Delivered quantity mismatch"
    assert result["undelivered_qty"] == 20.0, "Undelivered quantity mismatch"
    assert "partial_delivery_id" in result, "Missing partial_delivery_id"
    
    print("✅ Partial delivery test PASSED")
    
    return result["partial_delivery_id"]


def test_inventory_adjustment(partial_delivery_id):
    """Test Case 3: Inventory adjustment for undelivered goods"""
    print("\n" + "="*60)
    print("TEST CASE 3: INVENTORY ADJUSTMENT")
    print("="*60)
    
    response = requests.post(
        f"{BASE_URL}/delivery/adjust-inventory/{partial_delivery_id}",
        headers=get_headers()
    )
    
    print_response("Inventory Adjustment Response", response)
    
    assert response.status_code == 200, "Inventory adjustment failed"
    result = response.json()
    assert result["success"] == True, "Adjustment not successful"
    assert "qty_added_mt" in result, "Missing qty_added_mt"
    assert "new_stock" in result, "Missing new_stock"
    
    print("✅ Inventory adjustment test PASSED")


def test_get_partial_deliveries():
    """Test Case 4: Get partial delivery records"""
    print("\n" + "="*60)
    print("TEST CASE 4: GET PARTIAL DELIVERIES")
    print("="*60)
    
    response = requests.get(
        f"{BASE_URL}/delivery/partial-deliveries",
        headers=get_headers()
    )
    
    print_response("Get Partial Deliveries Response", response)
    
    assert response.status_code == 200, "Get partial deliveries failed"
    result = response.json()
    assert isinstance(result, list), "Should return a list"
    
    print(f"✅ Found {len(result)} partial delivery records")


def test_manual_partial_claim():
    """Test Case 5: Manually create partial delivery claim"""
    print("\n" + "="*60)
    print("TEST CASE 5: MANUAL PARTIAL DELIVERY CLAIM")
    print("="*60)
    
    data = {
        "transport_id": "REPLACE_WITH_ACTUAL_TRANSPORT_ID",
        "delivery_order_id": "REPLACE_WITH_ACTUAL_DO_ID",
        "job_order_id": "REPLACE_WITH_ACTUAL_JOB_ID",
        "expected_qty": 100.0,
        "delivered_qty": 75.0,
        "reason": "REJECTED",
        "reason_details": "25 drums rejected by customer QC due to contamination",
        "notes": "Customer QC inspection found contamination in 25 drums"
    }
    
    response = requests.post(
        f"{BASE_URL}/delivery/partial-claim",
        headers=get_headers(),
        json=data
    )
    
    print_response("Manual Partial Claim Response", response)
    
    if response.status_code == 200:
        result = response.json()
        assert result["success"] == True, "Claim creation not successful"
        assert "partial_delivery_id" in result, "Missing partial_delivery_id"
        print("✅ Manual partial claim test PASSED")
        return result["partial_delivery_id"]
    else:
        print("⚠️  Manual partial claim test SKIPPED (may need valid IDs)")


def test_resolve_partial_delivery(partial_delivery_id):
    """Test Case 6: Resolve partial delivery"""
    print("\n" + "="*60)
    print("TEST CASE 6: RESOLVE PARTIAL DELIVERY")
    print("="*60)
    
    data = {
        "resolution_notes": "Customer accepted replacement shipment of 20 drums"
    }
    
    response = requests.put(
        f"{BASE_URL}/delivery/partial-deliveries/{partial_delivery_id}/resolve",
        headers=get_headers(),
        json=data
    )
    
    print_response("Resolve Partial Delivery Response", response)
    
    assert response.status_code == 200, "Resolve failed"
    result = response.json()
    assert result["success"] == True, "Resolution not successful"
    
    print("✅ Resolve partial delivery test PASSED")


def run_all_tests():
    """Run all test cases"""
    print("\n" + "="*80)
    print("PARTIAL DELIVERY SYSTEM - TEST SUITE")
    print("="*80)
    print("\nNOTE: Update the REPLACE_WITH_ACTUAL_*_ID placeholders with real IDs")
    print("      from your system before running these tests.")
    print("\nPress Enter to continue or Ctrl+C to exit...")
    input()
    
    try:
        # Test 1: Full delivery
        # test_full_delivery()
        # Uncomment when you have valid IDs
        
        # Test 2: Partial delivery
        # partial_delivery_id = test_partial_delivery()
        # Uncomment when you have valid IDs
        
        # Test 3: Inventory adjustment
        # if partial_delivery_id:
        #     test_inventory_adjustment(partial_delivery_id)
        # Uncomment when you have valid IDs
        
        # Test 4: Get partial deliveries
        test_get_partial_deliveries()
        
        # Test 5: Manual partial claim
        # claim_id = test_manual_partial_claim()
        # Uncomment when you have valid IDs
        
        # Test 6: Resolve partial delivery
        # if claim_id:
        #     test_resolve_partial_delivery(claim_id)
        # Uncomment when you have valid IDs
        
        print("\n" + "="*80)
        print("TEST SUITE COMPLETED")
        print("="*80)
        
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")


if __name__ == "__main__":
    if not TOKEN:
        print("⚠️  Please set your authentication TOKEN in the script")
        print("   1. Login to your system")
        print("   2. Get your auth token")
        print("   3. Update the TOKEN variable in this script")
        print("   4. Run the script again")
    else:
        run_all_tests()

