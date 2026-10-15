import { useEffect } from "react";
import {
  Form,
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useRouteError,
} from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { parseBadgeInput } from "../lib/badge-input.server";

/* GraphQL query used to load products and variants. */
const PRODUCTS_QUERY = `#graphql
  query ProductBadgeProducts {
    products(first: 25, sortKey: TITLE) {
      nodes {
        id
        title
        variants(first: 50) {
          nodes {
            id
            title
            legacyResourceId
          }
        }
      }
    }
  }
`;
const BADGE_METAFIELD = { namespace: "$app", key: "badge_config" };

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const [badges, auditLogs, response] = await Promise.all([
    prisma.badge.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    admin.graphql(PRODUCTS_QUERY),
  ]);

  const payload = await response.json();

  return {
    badges,
    auditLogs,
    products: payload.data?.products?.nodes ?? [],
    productError: payload.errors?.[0]?.message ?? null,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  try {
    if (intent === "save") {
      const { input, error: inputError } = parseBadgeInput(formData);
      if (inputError) return { error: inputError };

      const target = await resolveBadgeTarget(admin, input);
      if (target.error) return target;

      const values = {
        shop: session.shop,
        productId: target.product.id,
        productTitle: target.product.title,
        variantId: target.variant?.id ?? null,
        variantLegacyId: target.variant?.legacyResourceId?.toString() ?? null,
        variantTitle: target.variant?.title ?? null,
        ...input,
        enabled: true,
      };

      const existing = await prisma.badge.findFirst({
        where: {
          shop: session.shop,
          productId: target.product.id,
        },
      });

      const badge = existing
        ? await prisma.badge.update({
            where: { id: existing.id },
            data: values,
          })
        : await prisma.badge.create({
            data: values,
          });

      const error = await syncMetafield(admin, badge);

      if (error) {
        return { error };
      }

      await audit(
        session.shop,
        existing ? "badge.updated" : "badge.created",
        {
          badgeId: badge.id,
          target: badge.productTitle,
        },
      );
    } else if (intent === "toggle") {
      const badge = await findBadge(
        session.shop,
        formData.get("id"),
      );

      if (!badge) {
        return { error: "Badge not found." };
      }

      const updated = await prisma.badge.update({
        where: { id: badge.id },
        data: { enabled: !badge.enabled },
      });

      const error = await syncMetafield(admin, updated);

      if (error) {
        return { error };
      }

      await audit(
        session.shop,
        updated.enabled ? "badge.activated" : "badge.paused",
        { badgeId: badge.id },
      );
    } else if (intent === "delete") {
      const badge = await findBadge(
        session.shop,
        formData.get("id"),
      );

      if (!badge) {
        return { error: "Badge not found." };
      }

      const error = await clearMetafield(
        admin,
        badge.productId,
      );

      if (error) {
        return { error };
      }

      await prisma.badge.delete({
        where: { id: badge.id },
      });

      await audit(
        session.shop,
        "badge.deleted",
        {
          badgeId: badge.id,
          target: badge.productTitle,
        },
      );
    } else {
      return { error: "Unknown badge action." };
    }

    return { success: intent === "save" };
  } catch (error) {
    console.error("Badge action failed:", error);

    return {
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while updating the badge.",
    };
  }
};

export default function BadgeManagerHome() {
  const { badges, auditLogs, products, productError } = useLoaderData();

  const actionData = useActionData();
  const shopify = useAppBridge();
  const active = badges.filter(({ enabled }) => enabled).length;

  useEffect(() => {
    if (actionData?.success) {
      shopify.modal.hide("new-badge");
    }
  }, [actionData, shopify]);

  const variants = products.flatMap(({ id: productId, title: productTitle, variants }) =>
    variants.nodes.map((variant) => ({ ...variant, productId, productTitle })),
  );

  return (
    <s-page heading="Product Badge Manager">
      <s-button
        slot="primary-action"
        commandFor="new-badge"
        variant="primary"
        disabled={!products.length}
      >
        Create badge
      </s-button>

      {actionData?.error ? (
        <s-banner tone="critical" heading="Badge action failed">
          <s-paragraph>{actionData.error}</s-paragraph>
        </s-banner>
      ) : null}

      {productError ? (
        <s-banner
          tone="critical"
          heading="Products could not be loaded"
        >
          <s-paragraph>{productError}</s-paragraph>
        </s-banner>
      ) : null}

      <s-section heading="Overview">
        <s-grid
          gridTemplateColumns="repeat(3, 1fr)"
          gap="base"
        >
          <Metric
            label="Configured badges"
            value={badges.length}
          />
          <Metric
            label="Active on storefront"
            value={active}
          />
          <Metric
            label="Products available"
            value={products.length}
          />
        </s-grid>
      </s-section>

      <s-section heading="Badge configurations">
        {!badges.length ? (
          <s-stack direction="block" gap="base">
            <s-heading>No badges yet</s-heading>
            <s-paragraph>
              Target a product or variant, then add the Product
              badge app block to the product template in your theme
              editor.
            </s-paragraph>

            {products.length ? (
              <s-button
                commandFor="new-badge"
                variant="primary"
              >
                Create your first badge
              </s-button>
            ) : null}
          </s-stack>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">
                Target
              </s-table-header>
              <s-table-header listSlot="labeled">
                Preview
              </s-table-header>
              <s-table-header listSlot="labeled">
                Status
              </s-table-header>
              <s-table-header listSlot="labeled">
                Actions
              </s-table-header>
            </s-table-header-row>

            <s-table-body>
              {badges.map((badge) => (
                <BadgeRow key={badge.id} badge={badge} />
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Recent activity">
        {!auditLogs.length ? (
          <s-paragraph>
            No configuration or webhook events recorded yet.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="small">
            {auditLogs.map((entry) => (
              <s-text key={entry.id}>
                {eventText(entry.event)} ·{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </s-text>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Storefront setup">
        <s-paragraph>
          Open Online Store → Themes → Customize, add the{" "}
          <strong>Product badge</strong> app block to your product
          template, then save.
        </s-paragraph>
      </s-section>

      <s-modal id="new-badge" heading="Create product badge">
        <Form method="post">
          <input type="hidden" name="intent" value="save" />

          <s-stack direction="block" gap="base">
            <label>
              Product
              <select
                name="product"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select a product
                </option>

                {products.map((product) => (
                  <option
                    key={product.id}
                    value={JSON.stringify({
                      id: product.id,
                      title: product.title,
                    })}
                  >
                    {product.title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Variant (optional)
              <select name="variant" defaultValue="">
                <option value="">All variants</option>

                {variants.map((variant) => (
                  <option
                    key={variant.id}
                    value={JSON.stringify(variant)}
                  >
                    {variant.productTitle} — {variant.title}
                  </option>
                ))}
              </select>
            </label>

            <s-text-field
              label="Badge text"
              name="label"
              placeholder="New"
              required
            />

            <s-text-field
              label="Internal name"
              name="name"
              placeholder="New arrival"
            />

            <s-grid
              gridTemplateColumns="1fr 1fr"
              gap="base"
            >
              <s-color-field
                label="Background"
                name="background"
                value="#1F6B43"
              />
              <s-color-field
                label="Text colour"
                name="color"
                value="#FFFFFF"
              />
            </s-grid>

            <s-button variant="primary" type="submit">
              Save and publish badge
            </s-button>
          </s-stack>
        </Form>
      </s-modal>
    </s-page>
  );
}

function BadgeRow({ badge }) {
  return (
    <s-table-row>
      <s-table-cell>
        <s-stack direction="block" gap="small">
          <s-text type="strong">
            {badge.productTitle}
          </s-text>
          <s-text color="subdued">
            {badge.variantTitle || "All variants"}
          </s-text>
        </s-stack>
      </s-table-cell>

      <s-table-cell>
        <span
          style={{
            background: badge.background,
            borderRadius: "999px",
            color: badge.color,
            display: "inline-block",
            fontSize: "12px",
            fontWeight: 600,
            padding: "4px 10px",
          }}
        >
          {badge.label}
        </span>
      </s-table-cell>

      <s-table-cell>
        <s-badge tone={badge.enabled ? "success" : "warning"}>
          {badge.enabled ? "Active" : "Paused"}
        </s-badge>
      </s-table-cell>

      <s-table-cell>
        <s-stack direction="inline" gap="small">
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="toggle"
            />
            <input
              type="hidden"
              name="id"
              value={badge.id}
            />
            <s-button variant="tertiary" type="submit">
              {badge.enabled ? "Pause" : "Activate"}
            </s-button>
          </Form>

          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="delete"
            />
            <input
              type="hidden"
              name="id"
              value={badge.id}
            />
            <s-button
              variant="tertiary"
              tone="critical"
              type="submit"
            >
              Delete
            </s-button>
          </Form>
        </s-stack>
      </s-table-cell>
    </s-table-row>
  );
}

function Metric({ label, value }) {
  return (
    <s-box
      padding="base"
      background="subdued"
      border="base"
      borderRadius="base"
    >
      <s-text type="strong">{value}</s-text>
      <s-paragraph>{label}</s-paragraph>
    </s-box>
  );
}

function eventText(event) {
  return event
    .replace("badge.", "Badge ")
    .replace("webhook.", "Webhook ");
}

function audit(shop, event, details) {
  return prisma.auditLog.create({
    data: {
      shop,
      event,
      details: JSON.stringify(details),
    },
  });
}

const findBadge = (shop, id) =>
  prisma.badge.findFirst({ where: { id: id?.toString(), shop } });

async function resolveBadgeTarget(admin, input) {
  if (!input.variantId) {
    const response = await admin.graphql(
      `#graphql
        query BadgeProductTarget($productId: ID!) {
          product: node(id: $productId) {
            ... on Product {
              id
              title
            }
          }
        }
      `,
      { variables: { productId: input.productId } },
    );
    const payload = await response.json();
    const product = payload.data?.product;

    return product?.id
      ? { product, variant: null }
      : { error: "The selected product is no longer available." };
  }

  const response = await admin.graphql(
    `#graphql
      query BadgeTarget($productId: ID!, $variantId: ID!) {
        product: node(id: $productId) {
          ... on Product {
            id
            title
          }
        }
        variant: node(id: $variantId) {
          ... on ProductVariant {
            id
            title
            legacyResourceId
            product {
              id
            }
          }
        }
      }
    `,
    { variables: input },
  );
  const { data: { product, variant } = {} } = await response.json();

  if (!product?.id) {
    return { error: "The selected product is no longer available." };
  }
  if (!variant?.id || variant.product?.id !== product.id) {
    return { error: "The selected variant does not belong to the selected product." };
  }

  return { product, variant };
}

async function syncMetafield(admin, badge) {
  const response = await admin.graphql(
    `#graphql
      mutation SetBadge($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: badge.productId,
            ...BADGE_METAFIELD,
            type: "json",
            value: JSON.stringify({
              label: badge.label,
              background: badge.background,
              color: badge.color,
              enabled: badge.enabled,
              variantLegacyId: badge.variantLegacyId,
            }),
          },
        ],
      },
    },
  );

  const payload = await response.json();

  if (payload.errors?.length) {
    console.error("Set badge GraphQL errors:", payload.errors);
  }

  const userError =
    payload.data?.metafieldsSet?.userErrors?.[0];

  return (
    userError?.message ||
    payload.errors?.[0]?.message ||
    null
  );
}

async function clearMetafield(admin, ownerId) {
  const response = await admin.graphql(
    `#graphql
      mutation ClearBadge(
        $metafields: [MetafieldIdentifierInput!]!
      ) {
        metafieldsDelete(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId,
            ...BADGE_METAFIELD,
          },
        ],
      },
    },
  );

  const payload = await response.json();

  if (payload.errors?.length) {
    console.error("Delete badge GraphQL errors:", payload.errors);
  }

  const userError =
    payload.data?.metafieldsDelete?.userErrors?.[0];

  return (
    userError?.message ||
    payload.errors?.[0]?.message ||
    null
  );
}

export const headers = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred while loading badges.";

  return (
    <s-page heading="Couldn't load product badges">
      <s-banner tone="critical" heading="Badge manager error">
        <s-paragraph>{message}</s-paragraph>
      </s-banner>
    </s-page>
  );
}
