ALTER TABLE "Badge" ADD COLUMN "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Badge" ADD COLUMN "productTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Badge" ADD COLUMN "variantId" TEXT;
ALTER TABLE "Badge" ADD COLUMN "variantLegacyId" TEXT;
ALTER TABLE "Badge" ADD COLUMN "variantTitle" TEXT;

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AuditLog_shop_createdAt_idx" ON "AuditLog"("shop", "createdAt");
CREATE UNIQUE INDEX "Badge_shop_productId_variantId_key" ON "Badge"("shop", "productId", "variantId");
