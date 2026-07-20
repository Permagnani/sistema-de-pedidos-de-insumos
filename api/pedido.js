// Vercel Serverless Function — POST /api/pedido
// Cria um Pedido de Venda + Orçamento no Omie

const OMIE_PEDIDO_URL  = 'https://app.omie.com.br/api/v1/produtos/pedido/';
const OMIE_CLIENTE_URL = 'https://app.omie.com.br/api/v1/geral/clientes/';

// ─── Mapeamento: loja selecionada no form → CNPJ do cliente no Omie ──────────
const CNPJ_POR_LOJA = {
  'Liberdade': '18399996000115', // CANA MANIA MATRIZ
  'Pinheiros': '18399996000204', // CANA MANIA PINHEIROS
};

// ─── Mapeamento: nome do produto (label do HTML) → codigo_produto no Omie ────
const PRODUTOS = require('../omie-config.json');

// ─── Busca o codigo_cliente na Omie pelo CNPJ ─────────────────────────────────
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

  return data.clientes_cadastro[0].codigo_cliente;
}

// ─── Handler principal ────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS — permite chamadas do GitHub Pages
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { nome, loja, itens } = req.body;

  // Validações básicas
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

    // 2. Monta os itens do pedido
    const det = [];
    const itensSemCodigo = [];

    itens.forEach((item, index) => {
      const codigoProduto = PRODUTOS[item.label];
      if (!codigoProduto) {
        itensSemCodigo.push(item.label);
        return;
      }
      det.push({
        ide: { codigo_item_integracao: String(index + 1) },
        produto: {
          codigo_produto_integracao: codigoProduto,
          quantidade:     item.quantidade,
          valor_unitario: 0, // preço vem do cadastro do produto no Omie
        },
        
      });
    });

    if (det.length === 0) {
      return res.status(400).json({
        erro: 'Nenhum produto mapeado no Omie foi encontrado no pedido.',
        itensSemCodigo,
      });
    }

    // 3. Data de previsão = hoje
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // 4. Cria o pedido no Omie
    const omieRes = await fetch(OMIE_PEDIDO_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call:       'IncluirPedido',
        app_key:    process.env.OMIE_APP_KEY,
        app_secret: process.env.OMIE_APP_SECRET,
        param: [{
          cabecalho: {
            codigo_cliente: codigoCliente,
            data_previsao:  hoje,
            etapa:          '10', // Pedido de Venda + Orçamento
          },
          det,
          informacoes_adicionais: {
            consumidor_final: 'S',
            enviar_email:     'N',
            
          },
        }],
      }),
    });

    const data = await omieRes.json();

    if (data.faultstring) {
      console.error('Erro Omie (pedido):', data);
      return res.status(422).json({ erro: data.faultstring });
    }

    return res.status(200).json({
      sucesso:        true,
      numero_pedido:  data.numero_pedido,
      codigo_pedido:  data.codigo_pedido,
      itensSemCodigo: itensSemCodigo.length > 0 ? itensSemCodigo : undefined,
    });

  } catch (err) {
    console.error('Erro:', err.message);
    return res.status(500).json({ erro: err.message });
  }
}

