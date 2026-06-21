// netlify/functions/shopify-token-start.js
// Inicia o fluxo OAuth para gerar novo token Admin Shopify

exports.handler = async () => {
  const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || 'cf3ac11bf9d1b25cd4e89f4fa534a9c7';
  const SHOP = 'nv18ua-1w.myshopify.com';
  const REDIRECT_URI = 'https://vitaflow-proxy.netlify.app/.netlify/functions/shopify-token-callback';
  const SCOPES = 'read_price_rules,write_price_rules,read_discounts,write_discounts,read_discounts_allocator_functions,write_discounts_allocator_functions,write_inventory,read_inventory,write_inventory_shipments,read_inventory_shipments,write_inventory_shipments_received_items,read_inventory_shipments_received_items,write_inventory_transfers,read_inventory_transfers,write_locations,read_locations,write_order_edits,read_order_edits,read_orders,write_orders,read_product_feeds,write_product_feeds,read_product_listings,write_product_listings,read_products,write_products';

  const authUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
    body: '',
  };
};
