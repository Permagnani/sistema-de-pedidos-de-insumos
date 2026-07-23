module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let todos = [];
  let pagina = 1;
  let totalPaginas = 1;

  do {
    const resp = await fetch('https://app.omie.com.br/api/v1/geral/produtos/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'ListarProdutos',
        app_key: process.env.OMIE_APP_KEY,
        app_secret: process.env.OMIE_APP_SECRET,
        param: [{ pagina, registros_por_pagina: 50, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N' }],
      }),
    });
    const data = await resp.json();
    if (data.faultstring) return res.status(400).json({ erro: data.faultstring });
    totalPaginas = data.total_de_paginas;
    todos = todos.concat(data.produto_servico_cadastro || []);
    pagina++;
  } while (pagina <= totalPaginas);

  const mapa = {};
  todos.forEach(p => { mapa[p.codigo] = { id: p.codigo_produto, nome: p.descricao, inativo: p.inativo }; });

  return res.status(200).json({ total: todos.length, mapa });
};
