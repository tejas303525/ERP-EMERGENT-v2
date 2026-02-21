// MongoDB Shell Script to Clean Up Packaging Collection
// Run this in MongoDB shell or MongoDB Compass

print("=" + "=".repeat(60));
print("PACKAGING COLLECTION CLEANUP");
print("=" + "=".repeat(60));
print("");

// Step 1: Check what we have
print("Step 1: Checking current packaging collection...");
var packagingCount = db.packaging.count();
print("  Found " + packagingCount + " items in packaging collection");

if (packagingCount === 0) {
  print("  ✓ Collection is already empty!");
  quit();
}

// Show sample items
print("\n  Sample items to be deleted:");
db.packaging.find({}, {name: 1, sku: 1, _id: 0}).limit(5).forEach(function(item) {
  var sku = item.sku || "NO SKU";
  var name = item.name || "NO NAME";
  print("    - " + name + " (SKU: " + sku + ")");
});

// Step 2: Get IDs for cleanup
print("\nStep 2: Getting packaging IDs for cleanup...");
var packagingIds = [];
db.packaging.find({}, {id: 1, _id: 0}).forEach(function(item) {
  if (item.id) {
    packagingIds.push(item.id);
  }
});
print("  Found " + packagingIds.length + " packaging IDs");

// Step 3: Check for orphaned balances
print("\nStep 3: Checking for orphaned inventory balances...");
var orphanedBalances = 0;
packagingIds.forEach(function(pkgId) {
  var balance = db.inventory_balances.findOne({item_id: pkgId});
  if (balance) {
    orphanedBalances++;
  }
});
print("  Found " + orphanedBalances + " balances referencing packaging items");

// Step 4: Confirm deletion
print("\n" + "=".repeat(60));
print("ABOUT TO DELETE:");
print("  - " + packagingCount + " items from packaging collection");
print("  - " + orphanedBalances + " orphaned balance records");
print("=".repeat(60));
print("\nExecuting deletion in 3 seconds... (Ctrl+C to cancel)");

// Small delay
sleep(3000);

// Step 5: Delete packaging items
print("\nStep 5: Deleting packaging collection...");
var deleteResult = db.packaging.deleteMany({});
print("  ✓ Deleted " + deleteResult.deletedCount + " items from packaging collection");

// Step 6: Clean up orphaned balances
print("\nStep 6: Cleaning up orphaned balances...");
var deletedBalances = 0;
packagingIds.forEach(function(pkgId) {
  var result = db.inventory_balances.deleteMany({item_id: pkgId});
  deletedBalances += result.deletedCount;
});
print("  ✓ Deleted " + deletedBalances + " orphaned balance records");

// Step 7: Verify cleanup
print("\nStep 7: Verifying cleanup...");
var remainingPackaging = db.packaging.count();
print("  Packaging collection: " + remainingPackaging + " items (should be 0)");

// Check inventory_items
var inventoryPackItems = db.inventory_items.count({item_type: "PACK", is_active: true});
print("  Inventory items (PACK): " + inventoryPackItems + " items");

print("\n" + "=".repeat(60));
print("✅ CLEANUP COMPLETED SUCCESSFULLY!");
print("=".repeat(60));
print("\nNext steps:");
print("1. Refresh your Stock Management page");
print("2. All packaging items should now have SKU codes");
print("3. Delete button will work for all items");
print("");

