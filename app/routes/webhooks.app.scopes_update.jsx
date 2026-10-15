import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  if (session && payload.current) {
    await db.session.update({ where: { id: session.id }, data: { scope: payload.current.toString() } });
  }
  await db.auditLog.create({ data: { shop, event: "webhook.scopes_update", details: JSON.stringify({ topic }) } });
  return new Response();
};
