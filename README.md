# Manufacturing ERP System

A full-stack ERP application for manufacturing operations with React frontend and FastAPI backend.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB running locally or connection string

### Backend Setup

```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from .env.example)
# Required: MONGO_URL, DB_NAME

# Start the server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install
# or: yarn install

# Start the dev server
npm start
# or: yarn start
```

### Expected URLs
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Health Check**: http://localhost:8001/api/health

---

## Local Development Configuration

### Environment Variables

**Backend** (`backend/.env`):
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=erp_manufacturing
JWT_SECRET=your-secret-key
# CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000  (optional - has defaults)
```

**Frontend** (`frontend/.env.local`):
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

> **Note**: The frontend has a fallback to `http://localhost:8001` if `REACT_APP_BACKEND_URL` is not set.

---

## Troubleshooting

### CORS Issues

If you see errors like:
- "Blocked by CORS policy: No 'Access-Control-Allow-Origin' header"
- `ERR_NETWORK`
- `net::ERR_FAILED`

**Step 1: Verify Backend is Running**
```bash
curl -i http://localhost:8001/api/health
```
Expected response:
```json
{"ok": true, "time": "...", "service": "Manufacturing ERP API", "version": "1.0.0"}
```

**Step 2: Test CORS Preflight**
```bash
curl -i -X OPTIONS http://localhost:8001/api/job-orders \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization"
```
Expected headers in response:
```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, ...
```

**Step 3: Run CORS Test Script**
```bash
cd backend
python test_cors.py
```

### Backend Not Starting

1. Check MongoDB connection:
```bash
mongosh --eval "db.adminCommand('ping')"
```

2. Verify environment variables are set

3. Check for port conflicts:
```bash
# Windows
netstat -an | findstr 8001

# Linux/Mac
lsof -i :8001
```

### Frontend API Errors

1. Open browser DevTools (F12) → Network tab
2. Look for failed requests in red
3. Check the Console for `[API Error]` logs
4. Verify `REACT_APP_BACKEND_URL` is correct

### Common Fixes

| Issue | Solution |
|-------|----------|
| Backend not reachable | Ensure uvicorn is running on port 8001 |
| 127.0.0.1 vs localhost | Both should work - check CORS_ORIGINS env |
| Preflight failing | Ensure OPTIONS routes are handled |
| Credentials error | `allow_credentials=True` requires explicit origins (not `*`) |

---

## API Endpoints

### Health Check
- `GET /api/health` - Returns API status and timestamp

### Job Orders
- `GET /api/job-orders` - List all job orders
- `GET /api/job-orders/{id}` - Get job order by ID
- `POST /api/job-orders` - Create new job order
- `PUT /api/job-orders/{id}/status` - Update job order status

### See `backend/server.py` for full API documentation.

---

## Project Structure

```
ERPemergent/
├── backend/
│   ├── server.py          # FastAPI application
│   ├── requirements.txt   # Python dependencies
│   ├── test_cors.py       # CORS verification script
│   └── tests/             # Backend tests
├── frontend/
│   ├── src/
│   │   ├── lib/api.js     # Centralized API client
│   │   ├── pages/         # React page components
│   │   └── components/    # Reusable UI components
│   └── package.json
└── README.md
```

---

## Job Order Flow (A-Z)

### Creation Flow
1. **Frontend**: User navigates to Job Orders page
2. **Frontend**: Loads sales orders (`GET /api/sales-orders`)
3. **Frontend**: User selects SPA and products
4. **Frontend**: System checks BOM availability (`GET /api/product-boms/{id}`)
5. **Frontend**: User confirms and submits (`POST /api/job-orders`)
6. **Backend**: Validates payload (sales order exists, quantities > 0)
7. **Backend**: Generates job number, checks material availability
8. **Backend**: Saves to `job_orders` collection
9. **Backend**: Returns 201 with job order details
10. **Frontend**: Shows success toast, refreshes list

### Status Transitions
```
pending → approved → in_production → ready_for_dispatch → dispatched
                  ↘ procurement (if materials needed)
```

### BOM Integration
- Job orders link to product BOMs for material requirements
- Material shortages trigger procurement workflow
- Shortages are stored in `material_shortages` field

---

## License

MIT
