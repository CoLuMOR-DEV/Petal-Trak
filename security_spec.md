# Security Specification for Petal-Trak

## 1. Data Invariants
- Only verified authenticated users can create customer orders for their own UID (`customerId == request.auth.uid`).
- Customers cannot elevate their own role to 'owner'. Only admins can manage roles and access the owner dashboard.
- Active orders contain customer snapshot, items list, and status transitions: pending -> in-progress -> completed -> delivered / cancelled.
- Temporary chat messages on an order can only be accessed by that order's customer and the owner.
- Catalog and studio content can be read publicly, but only edited by the owner.
- Inventory item stock and threshold adjustments are controlled by the owner and auto-deducted during checkout.

## 2. Access Control Principles
- Non-owners are strictly prevented from reading or writing `/admins/*`, full customer lists, reports, or unauthorized orders.
- Customer PII (`address`, `phone`, `email`) is protected and accessible only to the customer themselves and the store owner.
