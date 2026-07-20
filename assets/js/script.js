function formatarDataBR(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatarHoraBR(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

// Roteamento de número por dia (America/Sao_Paulo)
function getDiaSaoPaulo() {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short'
  }).format(new Date());
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
}

const NUMERO_SEG_SEX = '5511937143006';
const NUMERO_SAB_DOM = '5511937143006';

function getNumeroDestino() {
  const d = getDiaSaoPaulo();
  return (d === 0 || d === 6) ? NUMERO_SAB_DOM : NUMERO_SEG_SEX;
}

// Carimbo fixo de data do pedido
function carimbarDataDoPedido(force = false) {
  if (!window.pedidoTimestamp || force) {
    window.pedidoTimestamp = new Date();

    const hidden = document.getElementById("timestampPedido");
    if (hidden) hidden.value = window.pedidoTimestamp.toISOString();

    const alvo = document.getElementById("dataPedido");
    if (alvo) {
      alvo.textContent = `Data do pedido: ${formatarDataBR(window.pedidoTimestamp)} às ${formatarHoraBR(window.pedidoTimestamp)}`;
    }

    const spanResumo = document.getElementById("resumoData");
    if (spanResumo) {
      spanResumo.textContent = `${formatarDataBR(window.pedidoTimestamp)} às ${formatarHoraBR(window.pedidoTimestamp)}`;
    }
  }
  return window.pedidoTimestamp;
}

// Leitura de itens por seção
  
function lerItensDaSecao(categoriaH2) {
  const itens = [];
  let el = categoriaH2.nextElementSibling;

  while (el && el.tagName !== "H2") {
    if (el.classList && el.classList.contains("item")) {
      const input = el.querySelector("input[type='number']");
      const quantidade = parseInt(input?.value || "0", 10);

      if (quantidade > 0) {
        const labelEl = el.querySelector("label");
        let label = (labelEl?.childNodes[0]?.textContent || labelEl?.textContent || "").trim();
        label = label.replace(/ℹ️/g, "").trim();

        itens.push({ label, quantidade });
      }
    }
    el = el.nextElementSibling;
  }

  return itens;
}

// Resumo do pedido 
function revisarPedido() {
  const nome = document.getElementById("nome").value.trim();
  const loja = document.getElementById("loja").value.trim();

  if (!nome) return alert("Por favor, preencha seu nome.");
  if (!loja) return alert("Por favor, selecione a loja.");

  carimbarDataDoPedido();

  const formulario = document.getElementById("formulario");
  const categorias = formulario.querySelectorAll("h2");
  const listaResumo = document.getElementById("listaResumo");
  listaResumo.innerHTML = "";

  let temPedido = false;

  categorias.forEach((categoria) => {
    const itensCategoria = lerItensDaSecao(categoria);
    if (itensCategoria.length > 0) {
      temPedido = true;

      const liCategoria = document.createElement("li");
      liCategoria.style.marginTop = "1em";
      liCategoria.style.fontWeight = "bold";
      liCategoria.textContent = categoria.innerText;

      const ulItens = document.createElement("ul");

      itensCategoria.forEach(({ label, quantidade }) => {
        const liItem = document.createElement("li");
        liItem.textContent = `${label}: ${quantidade}`;
        ulItens.appendChild(liItem);
      });

      liCategoria.appendChild(ulItens);
      listaResumo.appendChild(liCategoria);
    }
  });

  if (!temPedido) return alert("Por favor, insira a quantidade de pelo menos um item.");

  document.getElementById("resumoNome").textContent = nome;
  document.getElementById("resumoLoja").textContent = loja;

  formulario.classList.add("hidden");
  document.getElementById("resumo").classList.remove("hidden");
  window.scrollTo(0, 0);
}

function editarPedido() {
  document.getElementById("formulario").classList.remove("hidden");
  document.getElementById("resumo").classList.add("hidden");
}

// Enviar para o WhatsApp 
function enviarWhatsApp() {
  const nome = document.getElementById("nome").value.trim();
  const loja = document.getElementById("loja").value.trim();
  const categorias = document.querySelectorAll("#formulario h2");

  const dt = carimbarDataDoPedido();
  const dataFmt = formatarDataBR(dt);
  const horaFmt = formatarHoraBR(dt);

  let texto = `*Sistema de Pedidos de Insumos*\n`;
  texto += `*Data:* ${dataFmt}\n`;
  texto += `*Hora:* ${horaFmt}\n`;
  texto += `*Nome:* ${nome}\n`;
  texto += `*Loja:* ${loja}\n`;

  let temPedido = false;

  categorias.forEach((categoria) => {
    const itensCategoria = lerItensDaSecao(categoria);
    if (itensCategoria.length > 0) {
      temPedido = true;
      texto += `\n*${categoria.innerText}*\n`;
      itensCategoria.forEach(({ label, quantidade }) => {
        texto += `- ${label}: ${quantidade}\n`;
      });
    }
  });

  if (!temPedido) return alert("Por favor, insira a quantidade de pelo menos um item.");

  const telefone = getNumeroDestino();
  const link = `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;
  window.open(link, "_blank");
}

// ─── Integração com Omie ──────────────────────────────────────────────────────

// URL da sua Vercel Function — troque pelo domínio gerado após o deploy
const OMIE_API_ENDPOINT = 'https://sistema-de-pedidos-de-insumos.vercel.app/api/pedido';

function coletarTodosItens() {
  const itens = [];
  document.querySelectorAll("#formulario h2").forEach((categoria) => {
    lerItensDaSecao(categoria).forEach((item) => itens.push(item));
  });
  return itens;
}

async function enviarParaOmie() {
  const nome = document.getElementById("nome").value.trim();
  const loja = document.getElementById("loja").value.trim();
  const itens = coletarTodosItens();

  if (!nome || !loja || itens.length === 0) return;

  const btn = document.getElementById("btnOmie");
  const status = document.getElementById("omieStatus");

  btn.disabled = true;
  btn.textContent = "Enviando...";
  status.textContent = "";
  status.className = "omie-status";

  try {
    const resp = await fetch(OMIE_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, loja, itens }),
    });

    const data = await resp.json();

    if (!resp.ok || data.erro) {
      throw new Error(data.erro || "Erro desconhecido");
    }

    status.textContent = `✅ Pedido Nº ${data.numero_pedido} criado no Omie!`;
    status.className = "omie-status omie-sucesso";

    if (data.itensSemCodigo && data.itensSemCodigo.length > 0) {
      status.textContent += `\n⚠️ Itens sem código Omie (ignorados): ${data.itensSemCodigo.join(", ")}`;
    }

  } catch (err) {
    status.textContent = `❌ Erro ao enviar para Omie: ${err.message}`;
    status.className = "omie-status omie-erro";
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar para Omie";
  }
}

document.addEventListener('DOMContentLoaded', () => {
   carimbarDataDoPedido();
});