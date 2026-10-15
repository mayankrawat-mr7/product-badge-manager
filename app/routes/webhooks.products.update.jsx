import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  await db.auditLog.create({ data: { shop, event: "webhook.product_updated", details: JSON.stringify({ topic, productId: payload.id, title: payload.title }) } });
  return new Response();
};
