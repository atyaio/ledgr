-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5B8DEF',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
    "paymentMethodId" TEXT,
    "receivedByStakeholderId" TEXT,
    "notes" TEXT,
    "recurringRuleId" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Revenue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_receivedByStakeholderId_fkey" FOREIGN KEY ("receivedByStakeholderId") REFERENCES "Stakeholder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Revenue" ("amountMinor", "categoryId", "createdAt", "customFields", "date", "description", "id", "importBatchId", "notes", "receivedByStakeholderId", "recurringRuleId", "source", "updatedAt") SELECT "amountMinor", "categoryId", "createdAt", "customFields", "date", "description", "id", "importBatchId", "notes", "receivedByStakeholderId", "recurringRuleId", "source", "updatedAt" FROM "Revenue";
DROP TABLE "Revenue";
ALTER TABLE "new_Revenue" RENAME TO "Revenue";
CREATE INDEX "Revenue_date_idx" ON "Revenue"("date");
CREATE INDEX "Revenue_categoryId_idx" ON "Revenue"("categoryId");
CREATE INDEX "Revenue_paymentMethodId_idx" ON "Revenue"("paymentMethodId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");
