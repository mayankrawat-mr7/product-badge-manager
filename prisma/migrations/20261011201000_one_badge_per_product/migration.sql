DROP INDEX "Badge_shop_productId_variantId_key";
CREATE UNIQUE INDEX "Badge_shop_productId_key" ON "Badge"("shop", "productId");
