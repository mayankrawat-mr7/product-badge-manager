import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  // authenticate.webhook verifies Shopify's HMAC and extracts the shop and payload.
  const { payload, shop, topic } = await authenticate.webhook(request);
  // Keep a lightweight record so product changes are visible in the app activity feed.
  await db.auditLog.create({ data: { shop, event: "webhook.product_updated", details: JSON.stringify({ topic, productId: payload.id, title: payload.title }) } });
  return new Response();
};
