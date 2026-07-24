-- CreateIndex: 1 comissão por fatura (backstop contra reentrega concorrente do webhook)
-- Atenção: se houver invoiceId duplicado pré-existente, remova os duplicados antes.
CREATE UNIQUE INDEX "admin_commissions_invoiceId_key" ON "admin_commissions"("invoiceId");
