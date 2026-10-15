import { authenticate } from "../shopify.server";
import db from "../db.server";
import process from "node:process";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  // Shopify CLI sends a simulated APP_UNINSTALLED webhook during local startup.
  // Do not let that test request erase the active development session.
  if (session && process.env.NODE_ENV === "production") {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
