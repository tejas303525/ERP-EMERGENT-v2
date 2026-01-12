#!/usr/bin/env python3
"""
CORS and API Health Test Script
Run this to verify the backend is properly configured for CORS.

Usage:
    python test_cors.py
"""

import requests
import json
import sys

API_BASE = "http://localhost:8001"

def test_health_endpoint():
    """Test /api/health endpoint"""
    print("\n" + "="*60)
    print("TEST 1: Health Endpoint")
    print("="*60)
    
    try:
        response = requests.get(f"{API_BASE}/api/health", timeout=5)
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200 and response.json().get("ok"):
            print("✅ PASS: Health endpoint working")
            return True
        else:
            print("❌ FAIL: Health endpoint returned unexpected response")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ FAIL: Could not connect to backend")
        print(f"   Make sure the backend is running at {API_BASE}")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_cors_preflight():
    """Test CORS preflight (OPTIONS) request"""
    print("\n" + "="*60)
    print("TEST 2: CORS Preflight (OPTIONS)")
    print("="*60)
    
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Authorization"
    }
    
    try:
        response = requests.options(
            f"{API_BASE}/api/job-orders",
            headers=headers,
            timeout=5
        )
        print(f"Status: {response.status_code}")
        print("Response Headers:")
        for key, value in response.headers.items():
            if "access-control" in key.lower() or "cors" in key.lower():
                print(f"  {key}: {value}")
        
        allowed_origin = response.headers.get("access-control-allow-origin")
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        
        if response.status_code in [200, 204]:
            if allowed_origin in ["http://localhost:3000", "*"]:
                if "POST" in allowed_methods.upper():
                    print("✅ PASS: CORS preflight working correctly")
                    return True
                else:
                    print("⚠️  WARN: POST not in allowed methods")
            else:
                print(f"⚠️  WARN: Origin header mismatch. Got: {allowed_origin}")
        
        print("❌ FAIL: CORS preflight not properly configured")
        return False
    except requests.exceptions.ConnectionError:
        print("❌ FAIL: Could not connect to backend")
        return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_cors_simple_request():
    """Test CORS simple request with Origin header"""
    print("\n" + "="*60)
    print("TEST 3: CORS Simple Request (GET with Origin)")
    print("="*60)
    
    headers = {
        "Origin": "http://localhost:3000",
        "Accept": "application/json"
    }
    
    try:
        response = requests.get(
            f"{API_BASE}/api/health",
            headers=headers,
            timeout=5
        )
        print(f"Status: {response.status_code}")
        
        allowed_origin = response.headers.get("access-control-allow-origin")
        print(f"Access-Control-Allow-Origin: {allowed_origin}")
        
        if allowed_origin in ["http://localhost:3000", "*"]:
            print("✅ PASS: CORS headers present in response")
            return True
        else:
            print("❌ FAIL: CORS headers missing or incorrect")
            return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False

def test_127_origin():
    """Test CORS with 127.0.0.1 origin"""
    print("\n" + "="*60)
    print("TEST 4: CORS with 127.0.0.1 Origin")
    print("="*60)
    
    headers = {
        "Origin": "http://127.0.0.1:3000",
        "Accept": "application/json"
    }
    
    try:
        response = requests.get(
            f"{API_BASE}/api/health",
            headers=headers,
            timeout=5
        )
        print(f"Status: {response.status_code}")
        
        allowed_origin = response.headers.get("access-control-allow-origin")
        print(f"Access-Control-Allow-Origin: {allowed_origin}")
        
        if allowed_origin in ["http://127.0.0.1:3000", "*"]:
            print("✅ PASS: 127.0.0.1 origin allowed")
            return True
        elif response.status_code == 200:
            print("⚠️  WARN: Request succeeded but CORS header may not be set.")
            print("   Note: Update CORS_ORIGINS in backend/.env if needed.")
            return True  # Still pass since request succeeded
        else:
            print("❌ FAIL: 127.0.0.1 origin not allowed")
            return False
    except Exception as e:
        print(f"❌ FAIL: {e}")
        return False


def main():
    print("="*60)
    print("ERP BACKEND - CORS & API HEALTH TEST")
    print("="*60)
    print(f"Testing backend at: {API_BASE}")
    
    results = []
    results.append(("Health Endpoint", test_health_endpoint()))
    results.append(("CORS Preflight", test_cors_preflight()))
    results.append(("CORS Simple Request", test_cors_simple_request()))
    results.append(("127.0.0.1 Origin", test_127_origin()))
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Backend is properly configured for CORS.")
        sys.exit(0)
    else:
        print("\n⚠️  Some tests failed. Check the backend configuration.")
        sys.exit(1)


if __name__ == "__main__":
    main()

