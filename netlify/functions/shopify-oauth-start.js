// netlify/functions/shopify-oauth-start.js
exports.handler = async () => {
  const CLIENT_ID = '4a40ce8787485a646fab2874817526a6';
  const SHOP = 'vitaflow-7352.myshopify.com';
  const REDIRECT_URI = 'https://vitaflow-proxy.netlify.app/.netlify/functions/shopify-oauth-callback';
  const SCOPES = 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,read_price_rules,write_price_rules';

  const authUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&grant_options[]=value`;

  return {
    statusCode: 302,
    headers: { Location: authUrl },
    body: '',
  };
};
