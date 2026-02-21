// MongoDB script to find sales_order_id for a job and trigger invoice generation
// Usage: 
// 1. Connect to MongoDB: mongosh your_database_name
// 2. Run this script or copy the queries

// Find sales_order_id for JOB-000246
db.job_orders.findOne(
  { job_number: "JOB-000246" },
  { sales_order_id: 1, job_number: 1, status: 1, _id: 0 }
);

// Alternative: Find all closed jobs without invoices
db.job_orders.aggregate([
  {
    $match: {
      status: { $in: ["closed", "dispatched"] }
    }
  },
  {
    $lookup: {
      from: "receivable_invoices",
      localField: "sales_order_id",
      foreignField: "sales_order_id",
      as: "invoices"
    }
  },
  {
    $match: {
      sales_order_id: { $exists: true, $ne: null },
      invoices: { $size: 0 }
    }
  },
  {
    $group: {
      _id: "$sales_order_id",
      jobs: { $push: { job_number: "$job_number", status: "$status" } },
      job_count: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "sales_orders",
      localField: "_id",
      foreignField: "id",
      as: "sales_order"
    }
  },
  {
    $project: {
      sales_order_id: "$_id",
      spa_number: { $arrayElemAt: ["$sales_order.spa_number", 0] },
      jobs: 1,
      job_count: 1
    }
  }
]);

// To trigger invoice generation via API:
// POST http://localhost:8000/api/receivables/generate-invoice-for-sales-order/{sales_order_id}
// Headers: Authorization: Bearer {token}
// 
// Or use curl:
// curl -X POST "http://localhost:8000/api/receivables/generate-invoice-for-sales-order/{sales_order_id}" \
//   -H "Authorization: Bearer YOUR_TOKEN" \
//   -H "Content-Type: application/json"

