/*
  Warnings:

  - You are about to drop the column `paymentMethodId` on the `Revenue` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "RevenuePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revenueId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    CONSTRAINT "RevenuePayment_revenueId_fkey" FOREIGN KEY ("revenueId") REFERENCES "Revenue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RevenuePayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Data migration: a revenue row's single payment method becomes a payment of its full amount.
INSERT INTO "RevenuePayment" ("id", "revenueId", "paymentMethodId", "amountMinor")
SELECT 'rp_' || "id", "id", "paymentMethodId", "amountMinor" FROM "Revenue" WHERE "paymentMethodId" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Revenue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "source" TEXT,
    "receivedByStakeholderId" TEXT,
    "notes" TEXT,
    "recurringRuleId" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Revenue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_receivedByStakeholderId_fkey" FOREIGN KEY ("receivedByStakeholderId") REFERENCES "Stakeholder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Revenue" ("amountMinor", "categoryId", "createdAt", "customFields", "date", "description", "id", "importBatchId", "notes", "receivedByStakeholderId", "recurringRuleId", "source", "updatedAt") SELECT "amountMinor", "categoryId", "createdAt", "customFields", "date", "description", "id", "importBatchId", "notes", "receivedByStakeholderId", "recurringRuleId", "source", "updatedAt" FROM "Revenue";
DROP TABLE "Revenue";
ALTER TABLE "new_Revenue" RENAME TO "Revenue";
CREATE INDEX "Revenue_date_idx" ON "Revenue"("date");
CREATE INDEX "Revenue_categoryId_idx" ON "Revenue"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RevenuePayment_paymentMethodId_idx" ON "RevenuePayment"("paymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenuePayment_revenueId_paymentMethodId_key" ON "RevenuePayment"("revenueId", "paymentMethodId");
