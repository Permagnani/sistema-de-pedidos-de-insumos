function formatarDataHoraBR(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date).replace(",", "");
}

const norm = s => (s || "").normalize("NFKC").trim();
const cleanCat = s => norm(s).replace(/\*/g, "");

let H2_DO_INDEX = [];

async function carregarH2DoIndex() {
  try {
    const res = await fetch("../index.html", { cache: "no-store" });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const h2s = [...doc.querySelectorAll("h2")].map(h => cleanCat(h.textContent));

    const seen = new Set();
    H2_DO_INDEX = h2s.filter(t => {
      const k = t.toLowerCase();
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    document.getElementById("infoCategorias").textContent = "";
  } catch (e) {
    document.getElementById("infoCategorias").textContent = "";
    H2_DO_INDEX = [];
  }
}

carregarH2DoIndex();

function parseTextoPedido(txt) {
  const linhas = txt.replace(/\r\n?/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  const meta = { data: "", nome: "", loja: "" };
  const itens = [];

  const BULLET = "[\\-–—•]";
  const COLON = "[:：]";
  const reItem = new RegExp(`^${BULLET}\\s*(.+?)\\s*${COLON}\\s*([0-9]+)(?:\\D.*)?$`);
  const reMeta = /^(?:.+?)?\s*(data|nome|loja|itens?)\s*[:：]\s*(.*)$/i;
  const reCatAsterisk = /^\*(.+?)\*$/;
  const rePedidoHeader = /^pedido\b/i;

  let categoriaAtual = "";

  for (const raw of linhas) {
    const l = raw;
    const s = norm(l).replace(/^[^\p{L}\p{N}]+/u, "");

    if (rePedidoHeader.test(s)) continue;

    const mm = s.match(reMeta);
    if (mm) {
      const key = mm[1].toLowerCase();
      const val = mm[2].trim();
      if (key.startsWith("data")) meta.data = val || meta.data;
      if (key.startsWith("nome")) meta.nome = val || meta.nome;
      if (key.startsWith("loja")) meta.loja = val || meta.loja;
      continue;
    }

    const mAst = l.match(reCatAsterisk);
    if (mAst) {
      categoriaAtual = cleanCat(mAst[1]);
      continue;
    }

    const mItem = l.match(reItem) || s.match(reItem);
    if (mItem) {
      const nome = mItem[1].replace(/ℹ️/g, "").trim();
      const qtd = parseInt(mItem[2], 10);

      if (!isNaN(qtd) && qtd > 0) {
        itens.push({
          categoria: categoriaAtual || "Outros",
          nome,
          qtdPedida: qtd,
          qtdSeparada: "",
          lote: ""
        });
      }
      continue;
    }

    const sClean = cleanCat(s);
    if (sClean && !reItem.test(s) && !reMeta.test(s)) {
      const hit = H2_DO_INDEX.find(h => h.toLowerCase() === sClean.toLowerCase());
      if (hit) {
        categoriaAtual = hit;
        continue;
      }

      if (H2_DO_INDEX.length === 0 && !/^itens?$/i.test(sClean)) {
        categoriaAtual = sClean;
      }
    }
  }

  if (!meta.data) meta.data = formatarDataHoraBR(new Date());
  return { meta, itens };
}

function renderPorCategoria({ meta, itens }) {
  const cont = document.getElementById("tabelasContainer");
  cont.innerHTML = "";

  const btnPrint = document.getElementById("btnPrint");
  const btnJsPdf = document.getElementById("btnJsPdf");

  if (!itens.length) {
    btnPrint.style.display = "none";
    btnJsPdf.style.display = "none";
    alert("Nenhum item encontrado. Confira o formato do texto.");
    return;
  }

  btnPrint.style.display = "";
  btnJsPdf.style.display = "";

  document.getElementById("meta").textContent =
    `Data: ${meta.data || "—"}  |  Nome: ${meta.nome || "—"}  |  Loja: ${meta.loja || "—"}`;

  const map = itens.reduce((acc, it) => {
    const k = cleanCat(it.categoria || "Outros");
    (acc[k] ||= []).push(it);
    return acc;
  }, {});

  const demais = Object.keys(map).filter(k =>
    !H2_DO_INDEX.some(h => h.toLowerCase() === k.toLowerCase())
  ).sort();

  const ordem = [...H2_DO_INDEX, ...demais];

  for (const cat of ordem) {
    const lista = map[cat];
    if (!lista || !lista.length) continue;

    const block = document.createElement("div");
    block.className = "cat-block";

    const h = document.createElement("div");
    h.className = "cat-title";
    h.textContent = cat;
    block.appendChild(h);

    const tbl = document.createElement("table");
    tbl.className = "tbl";
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Nome do item</th>
          <th>Qtd. Pedida</th>
          <th>Qtd. Separada</th>
          <th>Lote</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = tbl.querySelector("tbody");

    for (const it of lista) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-categoria", cat);
      tr.innerHTML = `
        <td>${it.nome}</td>
        <td class="cell-center">${it.qtdPedida}</td>
        <td contenteditable="true" class="cell-right"></td>
        <td contenteditable="true" class="cell-center"></td>
      `;
      tbody.appendChild(tr);
    }

    block.appendChild(tbl);
    cont.appendChild(block);
  }
}

document.getElementById("btnPrint").addEventListener("click", () => {
  window.print();
});

document.getElementById("btnJsPdf").addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const metaTxt = document.getElementById("meta").textContent || "Resumo do Pedido";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Resumo do Pedido", 40, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(metaTxt, 40, 60);

  let y = 90;

  const blocos = document.querySelectorAll(".cat-block");
  blocos.forEach(block => {
    const cat = block.querySelector(".cat-title")?.textContent?.trim() || "Categoria";
    const rows = [];

    block.querySelectorAll("tbody tr").forEach(tr => {
      const tds = tr.querySelectorAll("td");
      rows.push([
        tds[0].textContent.trim(),
        tds[1].textContent.trim(),
        tds[2].textContent.trim(),
        tds[3].textContent.trim()
      ]);
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(cat, 40, y);
    y += 10;

    doc.autoTable({
      head: [["Nome do item", "Qtd. Pedida", "Qtd. Separada", "Lote"]],
      body: rows,
      startY: y,
      styles: { fontSize: 10, cellPadding: 6, valign: "middle" },
      headStyles: { fillColor: [230, 230, 230] },
      columnStyles: {
        0: { cellWidth: 180 },
        1: { halign: "right", cellWidth: 90 },
        2: { halign: "right", cellWidth: 120 },
        3: { halign: "center", cellWidth: 120 }
      },
      didDrawPage: () => {
        const page = doc.getCurrentPageInfo().pageNumber;
        doc.setFontSize(9);
        doc.text(`Página ${page}`, 40, doc.internal.pageSize.getHeight() - 20);
      }
    });

    y = doc.lastAutoTable.finalY + 16;
    if (y > (doc.internal.pageSize.getHeight() - 120)) y = 90;
  });

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pedido-${Date.now()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btnParse").addEventListener("click", async () => {
  const txt = document.getElementById("texto").value.trim();
  if (!txt) {
    alert("Cole o texto do pedido.");
    return;
  }

  if (!H2_DO_INDEX.length) {
    try { await carregarH2DoIndex(); } catch {}
  }

  const res = parseTextoPedido(txt);
  renderPorCategoria(res);
});

document.getElementById("btnClipboard").addEventListener("click", async () => {
  try {
    const txt = await navigator.clipboard.readText();
    document.getElementById("texto").value = txt;

    if (!H2_DO_INDEX.length) {
      try { await carregarH2DoIndex(); } catch {}
    }

    const res = parseTextoPedido(txt);
    renderPorCategoria(res);
  } catch {
    alert("Não foi possível ler da área de transferência. Cole manualmente.");
  }
});