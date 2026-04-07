exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const response = await fetch('https://api.infinitepay.io/invoices/public/checkout/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: event.body
  });

  const data = await response.text();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: data
  };
};