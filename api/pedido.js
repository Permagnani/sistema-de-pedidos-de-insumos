// Vercel Serverless Function — POST /api/pedido
// Cria dois Pedidos de Venda no Omie: um para alimentos, outro para não-alimentos

const OMIE_PEDIDO_URL  = 'https://app.omie.com.br/api/v1/produtos/pedido/';
const OMIE_CLIENTE_URL = 'https://app.omie.com.br/api/v1/geral/clientes/';
const OMIE_PRODUTO_URL = 'https://app.omie.com.br/api/v1/geral/produtos/';

// ─── Mapeamento: loja selecionada no form → CNPJ do cliente no Omie ──────────
const CNPJ_POR_LOJA = {
  'Liberdade': '18399996000115',
  'Evento':    '18399996000115',
  'Pinheiros': '18399996000204',
};

// ─── Mapeamento: nome do produto → { id, tipo } ───────────────────────────────
const PRODUTOS = require('../omie-config.json');

// ─── Busca o codigo_cliente na Omie pelo CNPJ ────────────────────────────────
async function buscarCodigoCliente(cnpj) {
  const resp = await fetch(OMIE_CLIENTE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call:       'ListarClientes',
      app_key:    process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET,
      param: [{
        pagina:               1,
        registros_por_pagina: 5,
        apenas_importado_api: 'N',
        clientesFiltro: { cnpj_cpf: cnpj },
      }],
    }),
  });

  const data = await resp.json();
  if (data.faultstring) throw new Error(`Omie (busca cliente): ${data.faultstring}`);
  if (!data.clientes_cadastro || data.clientes_cadastro.length === 0) {
    throw new Error(`Cliente com CNPJ ${cnpj} não encontrado no Omie.`);
  }

  return data.clientes_cadastro[0].codigo_cliente_omie;
}

// ─── Busca o valor unitário do produto no cadastro Omie ──────────────────────
async function buscarValorUnitario(codigoProduto) {
  const resp = await fetch(OMIE_PRODUTO_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call:       'ConsultarProduto',
      app_key:    process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET,
      param: [{ codigo_produto: codigoProduto }],
    }),
  });

  const data = await resp.json();
  if (data.faultstring) throw new Error(`Omie (consulta produto): ${data.faultstring}`);
  return data.valor_unitario ?? 0;
}

// ─── Cria um pedido no Omie ───────────────────────────────────────────────────
async function criarPedido(codigoCliente, det, hoje, nome) {
  const resp = await fetch(OMIE_PEDIDO_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call:       'IncluirPedido',
      app_key:    process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET,
      param: [{
        cabecalho: {
          codigo_pedido_integracao: `PED-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          codigo_cliente:           codigoCliente,
          data_previsao:            hoje,
          etapa:                    '10',
        },
        det,
        informacoes_adicionais: {
          consumidor_final:      'S',
          enviar_email:          'N',
          codigo_categoria:      '1.01.03',
          codigo_conta_corrente: 9669403635,
          obs_venda:           nome,
        },
      }],
    }),
  });

  const data = await resp.json();
  if (data.faultstring) throw new Error(`Omie (criar pedido): ${data.faultstring}`);
  return data;
}

// ─── Handler principal ────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { nome, loja, itens } = req.body;

  if (!nome || !loja || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ erro: 'Dados do pedido incompletos.' });
  }

  const cnpj = CNPJ_POR_LOJA[loja];
  if (!cnpj) {
    return res.status(400).json({ erro: `Loja "${loja}" não integrada com o Omie ainda.` });
  }

  try {
    // 1. Busca o codigo_cliente pelo CNPJ
    const codigoCliente = await buscarCodigoCliente(cnpj);

    // 2. Separa os itens em alimentos e não-alimentos
    const detAlimentos    = [];
    const detNaoAlimentos = [];
    const itensSemCodigo  = [];

    for (const [index, item] of itens.entries()) {
      const produto = PRODUTOS[item.label];
      if (!produto) {
        itensSemCodigo.push(item.label);
        continue;
      }

      const valorUnitario = await buscarValorUnitario(produto.id);

      const itemDet = {
        ide: { codigo_item_integracao: String(index + 1) },
        produto: {
          codigo_produto: produto.id,
          quantidade:     item.quantidade,
          valor_unitario: valorUnitario,
        },
      };

      if (produto.tipo === 'alimento') {
        detAlimentos.push(itemDet);
      } else {
        detNaoAlimentos.push(itemDet);
      }
    }

    if (detAlimentos.length === 0 && detNaoAlimentos.length === 0) {
      return res.status(400).json({
        erro: 'Nenhum produto mapeado no Omie foi encontrado no pedido.',
        itensSemCodigo,
      });
    }

    // 3. Data de previsão = hoje
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // 4. Cria os pedidos (apenas os grupos que têm itens)
    const resultado = { sucesso: true, itensSemCodigo: itensSemCodigo.length > 0 ? itensSemCodigo : undefined };

    if (detAlimentos.length > 0) {
      const pedidoAlimentos = await criarPedido(codigoCliente, detAlimentos, hoje, nome);
      resultado.pedido_alimentos = {
        numero_pedido: pedidoAlimentos.numero_pedido,
        codigo_pedido: pedidoAlimentos.codigo_pedido,
      };
    }

    if (detNaoAlimentos.length > 0) {
      const pedidoNaoAlimentos = await criarPedido(codigoCliente, detNaoAlimentos, hoje, nome);
      resultado.pedido_nao_alimentos = {
        numero_pedido: pedidoNaoAlimentos.numero_pedido,
        codigo_pedido: pedidoNaoAlimentos.codigo_pedido,
      };
    }

    return res.status(200).json(resultado);

  } catch (err) {
    console.error('Erro:', err.message);
    return res.status(500).json({ erro: err.message });
  }
};