module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const resp = await fetch('https://app.omie.com.br/api/v1/geral/produtos/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call: 'ListarProdutos',
      app_key: process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET,
      param: [{ pagina: 1, registros_por_pagina: 100 }],
    }),
  });
  const data = await resp.json();
  return res.status(200).json(data);
};