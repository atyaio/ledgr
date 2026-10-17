-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "merchantId" TEXT,
    "merchantName" TEXT,
    "currency" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "lastItemsSyncAt" DATETIME,
    "lastShiftPullAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PosCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PosItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "sku" TEXT,
    "priceMinor" INTEGER,
    "costMinor" INTEGER,
    "variantCount" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PosItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PosCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT,
    "openedAt" DATETIME NOT NULL,
    "closedAt" DATETIME NOT NULL,
    "raw" TEXT NOT NULL,
    "receipts" INTEGER NOT NULL DEFAULT 0,
    "revenueId" TEXT,
    "pulledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PosShift_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PosSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "itemId" TEXT,
    "externalItemId" TEXT,
    "itemName" TEXT NOT NULL,
    "variantName" TEXT,
    "sku" TEXT,
    "categoryName" TEXT,
    "quantity" REAL NOT NULL,
    "grossMinor" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "costMinor" INTEGER NOT NULL,
    CONSTRAINT "PosSale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PosSale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PosItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_provider_key" ON "Integration"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "PosCategory_provider_externalId_key" ON "PosCategory"("provider", "externalId");

-- CreateIndex
CREATE INDEX "PosItem_categoryId_idx" ON "PosItem"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PosItem_provider_externalId_key" ON "PosItem"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_revenueId_key" ON "PosShift"("revenueId");

-- CreateIndex
CREATE UNIQUE INDEX "PosShift_provider_externalId_key" ON "PosShift"("provider", "externalId");

-- CreateIndex
CREATE INDEX "PosSale_shiftId_idx" ON "PosSale"("shiftId");

-- CreateIndex
CREATE INDEX "PosSale_itemId_idx" ON "PosSale"("itemId");

