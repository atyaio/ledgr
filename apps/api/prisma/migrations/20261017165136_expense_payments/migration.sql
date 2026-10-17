-- CreateTable
CREATE TABLE "ExpensePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    CONSTRAINT "ExpensePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpensePayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExpensePayment_paymentMethodId_idx" ON "ExpensePayment"("paymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePayment_expenseId_paymentMethodId_key" ON "ExpensePayment"("expenseId", "paymentMethodId");
