import test from "node:test";
import assert from "node:assert/strict";
import { MAX_BADGE_LABEL_LENGTH, parseBadgeInput } from "../app/lib/badge-input.server.js";

const product = { id: "gid://shopify/Product/123" };
const variant = { id: "gid://shopify/ProductVariant/456" };

function form(values = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    product: JSON.stringify(product),
    label: "New",
    ...values,
  })) {
    data.set(key, value);
  }
  return data;
}

test("accepts valid, trimmed input and safe colours", () => {
  const result = parseBadgeInput(form({
    label: "  New arrival  ",
    name: "  Homepage badge  ",
    variant: JSON.stringify(variant),
    background: "#abcdef",
  }));

  assert.deepEqual(result.input, {
    productId: product.id,
    variantId: variant.id,
    label: "New arrival",
    name: "Homepage badge",
    background: "#abcdef",
    color: "#FFFFFF",
  });
});

test("rejects malformed identifiers and unbounded labels", () => {
  assert.match(
    parseBadgeInput(form({ product: JSON.stringify({ id: "not-a-product" }) })).error,
    /valid product/,
  );
  assert.match(
    parseBadgeInput(form({ variant: "not-json" })).error,
    /valid variant/,
  );
  assert.match(
    parseBadgeInput(form({ label: "x".repeat(MAX_BADGE_LABEL_LENGTH + 1) })).error,
    /80 characters/,
  );
});

test("uses safe fallback colours for malformed colour input", () => {
  const result = parseBadgeInput(form({ background: "red; color: black" }));
  assert.equal(result.input.background, "#1F6B43");
});
