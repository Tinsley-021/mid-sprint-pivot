-- RetailSync Phase 1 initial schema
-- This file matches prisma/schema.prisma exactly. It was authored by hand because
-- `prisma migrate dev` could not download its schema-engine binary from
-- binaries.prisma.sh inside this sandbox's restricted network egress. On a machine
-- with normal internet access, running `npx prisma migrate dev` from a clean schema
-- would generate the equivalent of this file automatically going forward — this one
-- just needed to exist so we could prove it against real Postgres now. See README.

-- Enums
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'OWNER', 'ADMIN', 'BRANCH_MANAGER', 'INVENTORY_MANAGER', 'CASHIER', 'SUPPORT_AGENT', 'ACCOUNTANT');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "InventoryTransactionType" AS ENUM ('PURCHASE', 'SALE', 'RESERVATION', 'RESERVATION_RELEASE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'DAMAGE', 'LOSS');
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED');
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'ORDER_EXPIRED', 'INVENTORY_ANOMALY');
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- Organization
CREATE TABLE "Organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- User
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "branchIds" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("organizationId", "email")
);
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- Branch
CREATE TABLE "Branch" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "managerId" TEXT,
  "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
  "openingHours" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("organizationId", "code")
);
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");

-- Product
CREATE TABLE "Product" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "description" TEXT,
  "category" TEXT,
  "brand" TEXT,
  "costPrice" DECIMAL(14,2) NOT NULL,
  "sellingPrice" DECIMAL(14,2) NOT NULL,
  "reorderLevel" INTEGER NOT NULL DEFAULT 0,
  "reorderQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "images" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("organizationId", "sku")
);
CREATE INDEX "Product_organizationId_category_idx" ON "Product"("organizationId", "category");
CREATE INDEX "Product_organizationId_barcode_idx" ON "Product"("organizationId", "barcode");
CREATE INDEX "Product_organizationId_status_idx" ON "Product"("organizationId", "status");

-- Inventory
CREATE TABLE "Inventory" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id") ON DELETE CASCADE,
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "quantityReserved" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("productId", "branchId"),
  -- The database-enforced safety net described in inventory.service.ts: even a bug
  -- in application code cannot make stock negative or over-reserved.
  CONSTRAINT "Inventory_quantityOnHand_nonnegative" CHECK ("quantityOnHand" >= 0),
  CONSTRAINT "Inventory_quantityReserved_nonnegative" CHECK ("quantityReserved" >= 0),
  CONSTRAINT "Inventory_reserved_not_exceed_onhand" CHECK ("quantityReserved" <= "quantityOnHand")
);
CREATE INDEX "Inventory_organizationId_idx" ON "Inventory"("organizationId");
CREATE INDEX "Inventory_branchId_idx" ON "Inventory"("branchId");

-- InventoryTransaction
CREATE TABLE "InventoryTransaction" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "type" "InventoryTransactionType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "previousQuantity" INTEGER NOT NULL,
  "newQuantity" INTEGER NOT NULL,
  "previousReserved" INTEGER NOT NULL,
  "newReserved" INTEGER NOT NULL,
  "performedBy" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InventoryTransaction_org_product_branch_idx" ON "InventoryTransaction"("organizationId", "productId", "branchId");
CREATE INDEX "InventoryTransaction_reference_idx" ON "InventoryTransaction"("referenceType", "referenceId");
CREATE INDEX "InventoryTransaction_createdAt_idx" ON "InventoryTransaction"("createdAt");

-- Customer
CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");
CREATE INDEX "Customer_organizationId_email_idx" ON "Customer"("organizationId", "email");

-- Order
CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id"),
  "customerId" TEXT REFERENCES "Customer"("id"),
  "orderNumber" TEXT NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "reservationExpiresAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("organizationId", "orderNumber"),
  UNIQUE ("organizationId", "idempotencyKey")
);
CREATE INDEX "Order_organizationId_status_idx" ON "Order"("organizationId", "status");
CREATE INDEX "Order_organizationId_paymentStatus_idx" ON "Order"("organizationId", "paymentStatus");
CREATE INDEX "Order_reservationExpiresAt_idx" ON "Order"("reservationExpiresAt");

-- OrderItem
CREATE TABLE "OrderItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id"),
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- Payment
CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "orderId" TEXT NOT NULL REFERENCES "Order"("id"),
  "reference" TEXT NOT NULL UNIQUE,
  "provider" TEXT NOT NULL DEFAULT 'paystack',
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "authorizationUrl" TEXT,
  "processedEventIds" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Payment_organizationId_status_idx" ON "Payment"("organizationId", "status");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- Alert
CREATE TABLE "Alert" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "branchId" TEXT REFERENCES "Branch"("id"),
  "type" "AlertType" NOT NULL,
  "severity" "AlertSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT FALSE,
  "resolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Alert_organizationId_resolved_idx" ON "Alert"("organizationId", "resolved");
CREATE INDEX "Alert_organizationId_type_idx" ON "Alert"("organizationId", "type");

-- ApiKey
CREATE TABLE "ApiKey" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "hashedKey" TEXT NOT NULL UNIQUE,
  "keyPrefix" TEXT NOT NULL,
  "permissions" TEXT[] NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- AuditLog
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "metadata" JSONB,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_organizationId_entity_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- Transfer
CREATE TABLE "Transfer" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "fromBranchId" TEXT NOT NULL,
  "toBranchId" TEXT NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
  "createdBy" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "Transfer_organizationId_status_idx" ON "Transfer"("organizationId", "status");

-- TransferItem
CREATE TABLE "TransferItem" (
  "id" TEXT PRIMARY KEY,
  "transferId" TEXT NOT NULL REFERENCES "Transfer"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL
);
CREATE INDEX "TransferItem_transferId_idx" ON "TransferItem"("transferId");
