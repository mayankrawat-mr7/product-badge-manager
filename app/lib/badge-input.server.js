export const MAX_BADGE_LABEL_LENGTH = 80;
export const MAX_BADGE_NAME_LENGTH = 80;

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;
const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;

export function parseBadgeInput(formData) {
  const product = parseObject(formData.get("product"));
  const variantValue = formData.get("variant");
  const variant = variantValue ? parseObject(variantValue) : null;
  const label = value(formData, "label");
  const name = value(formData, "name") || label;

  if (!product || !PRODUCT_GID.test(product.id || "")) {
    return { error: "Choose a valid product before saving." };
  }

  if (variantValue && (!variant || !VARIANT_GID.test(variant.id || ""))) {
    return { error: "Choose a valid variant or apply the badge to all variants." };
  }

  if (!label) {
    return { error: "Enter badge text before saving." };
  }

  const tooLong = [
    [label, MAX_BADGE_LABEL_LENGTH, "Badge text"],
    [name, MAX_BADGE_NAME_LENGTH, "Internal name"],
  ].find(([text, max]) => text.length > max);
  if (tooLong) {
    const [, max, field] = tooLong;
    return { error: `${field} must be ${max} characters or fewer.` };
  }

  return {
    input: {
      productId: product.id,
      variantId: variant?.id || null,
      label,
      name,
      background: colour(formData.get("background")) || "#1F6B43",
      color: colour(formData.get("color")) || "#FFFFFF",
    },
  };
}

const value = (formData, name) => formData.get(name)?.toString().trim() || "";

function parseObject(value) {
  try {
    const parsed = value ? JSON.parse(value.toString()) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function colour(value) {
  return /^#[0-9a-f]{6}$/i.test(value?.toString() || "")
    ? value.toString()
    : null;
}
