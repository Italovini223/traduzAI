-- AlterTable: idioma da FAQ (pt | es). Registros existentes assumem 'pt'.
ALTER TABLE "admin_faqs" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'pt';
