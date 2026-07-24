-- AlterTable: marca a data em que a loja desinstalou o app (null = instalado)
ALTER TABLE "stores" ADD COLUMN "uninstalledAt" TIMESTAMP(3);
