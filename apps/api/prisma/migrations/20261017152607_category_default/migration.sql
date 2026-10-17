-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5B8DEF',
    "monthlyBudgetMinor" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Category" ("archived", "color", "createdAt", "id", "kind", "monthlyBudgetMinor", "name", "sortOrder", "updatedAt") SELECT "archived", "color", "createdAt", "id", "kind", "monthlyBudgetMinor", "name", "sortOrder", "updatedAt" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_kind_name_key" ON "Category"("kind", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
