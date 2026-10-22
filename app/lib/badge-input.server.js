// Keep user-entered badge text within the limits supported by the UI and database.
export const MAX_BADGE_LABEL_LENGTH = 80;
export const MAX_BADGE_NAME_LENGTH = 80;

// Shopify resource IDs are validated before they are used in Admin API requests.
const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;
const VARIANT_GID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;

export function parseBadgeInput(formData) {
  // Product and variant selections are submitted as JSON strings from the <select> controls.
  const product = parseObject(formData.get("product"));
  const variantValue = formData.get("variant");
  const variant = variantValue ? parseObject(variantValue) : null;
  const label = value(formData, "label");
  const name = value(formData, "name") || label;

  // Validate the product first so malformed or tampered form submissions are rejected.
  if (!product || !PRODUCT_GID.test(product.id || "")) {
    return { error: "Choose a valid product before saving." };
  }

  // An empty variant means the badge applies to every variant of the product.
  if (variantValue && (!variant || !VARIANT_GID.test(variant.id || ""))) {
    return { error: "Choose a valid variant or apply the badge to all variants." };
  }

  if (!label) {
    return { error: "Enter badge text before saving." };
  }

  // Check both visible text and the optional internal name in one pass.
  const tooLong = [
    [label, MAX_BADGE_LABEL_LENGTH, "Badge text"],
    [name, MAX_BADGE_NAME_LENGTH, "Internal name"],
  ].find(([text, max]) => text.length > max);
  if (tooLong) {
    const [, max, field] = tooLong;
    return { error: `${field} must be ${max} characters or fewer.` };
  }

  // Return only normalized values needed by the action; never persist raw form data.
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
  // Invalid JSON is treated as invalid input instead of allowing the request to throw.
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
  // Only accept six-digit hexadecimal colours so storefront CSS stays predictable.
  return /^#[0-9a-f]{6}$/i.test(value?.toString() || "")
    ? value.toString()
    : null;
}
