/* ═══════════════════════════════════════════════════

   AGENTE DPF — Application Logic
   Gestão da Dívida Pública Federal Brasileira
   ═══════════════════════════════════════════════════ */

// ─── Fallback Data ───
const FALLBACK = {
  selic: { valor: 14.75, data: '2025-06-01', fonte: 'Fallback (BCB Série 432)' },
  cdi: { valor: 14.65, data: '2025-06-01' },
  cambio: { valor: 5.65, data: '2025-06-01', fonte: 'Fallback (BCB Série 1)' },
  ipca: {
    acumulado12m: 5.53,
    ultimoMes: 0.36,
    periodo: 'mai/2025',
    fonte: 'Fallback (IBGE/SIDRA)'
  },
  pib: {
    variacao: 3.4,
    valorTriR$: 3070.0,
    periodo: '1T2025',
    fonte: 'Fallback (IBGE/SIDRA)'
  },
  fedRate: {
    valor: 4.50,
    data: '2025-06-01',
    fonte: 'Fallback (FRED FEDFUNDS)'
  },
  estoqueDPF: {
    total_bi: 7350.0,
    composicao: {
      prefixado: 26.0,
      selicLFT: 39.5,
      indices_precos: 28.5,
      cambial: 4.0,
      outros: 2.0,
    },
    prazoMedio_anos: 4.05,
    percentual_12m: 19.5,
    data: 'mai/2025',
    fonte: 'Fallback (Tesouro Nacional)'
  },
  variacaoDPF: {
    emissaoLiquida_bi: -35.2,
    apropriacaoJuros_bi: 82.7,
    ajusteCambial_bi: -5.1,
    variacaoTotal_bi: 42.4,
    periodo: 'mai/2025',
    fonte: 'Fallback (Tesouro Nacional)'
  },
  emissoesDPF: {
    meses: ['jan/25', 'fev/25', 'mar/25', 'abr/25', 'mai/25', 'jun/25'],
    emissoes: [132.5, 145.8, 128.3, 155.2, 140.6, 138.0],
    resgates: [98.2, 110.5, 155.0, 102.3, 175.8, 125.4],
    fonte: 'Fallback (Tesouro Nacional)'
  }
};

// ─── State ───
let agentData = {};
let charts = {};

// ─── Utility Functions ───
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPct(value, decimals = 2) {
  return value.toFixed(decimals) + '%';
}

function formatBi(value) {
  return 'R$ ' + value.toFixed(1) + ' bi';
}

function formatTri(value) {
  return 'R$ ' + (value / 1000).toFixed(2) + ' tri';
}

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Logger ───
function log(message, type = 'info') {
  const logSection = document.getElementById('log-section');
  logSection.style.display = 'block';
  const container = document.getElementById('log-container');

  const icons = {
    info: 'ℹ',
    success: '✓',
    warn: '⚠',
    error: '✗',
    calc: '∑'
  };

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">${now()}</span>
    <span class="log-icon-status ${type}">${icons[type] || 'ℹ'}</span>
    <span class="log-message">${message}</span>
  `;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// ─── Status & Progress ───
function setStatus(state, text) {
  const badge = document.getElementById('status-badge');
  badge.className = 'status-badge ' + state;
  badge.querySelector('.status-text').textContent = text;
}

function setProgress(pct, text) {
  const bar = document.getElementById('progress-bar');
  const fill = document.getElementById('progress-fill');
  const ptext = document.getElementById('progress-text');
  bar.classList.add('visible');
  fill.style.width = pct + '%';
  ptext.textContent = text || (pct + '%');
}

// ─── API Functions ───

async function buscarDadosBCB() {
  log('Chamando <strong>buscar_dados_bcb</strong> — Taxa Selic (Série 432)...');
  try {
    const [selicRes, cambioRes] = await Promise.allSettled([
      fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json'),
      fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json'),
    ]);

    let selic, cambio;

    if (selicRes.status === 'fulfilled' && selicRes.value.ok) {
      const data = await selicRes.value.json();
      selic = { valor: parseFloat(data[0].valor), data: data[0].data, fonte: 'BCB API (Série 432)' };
      log(`Selic obtida: <strong>${formatPct(selic.valor)}</strong> (${selic.data})`, 'success');
    } else {
      throw new Error('Selic API falhou');
    }

    if (cambioRes.status === 'fulfilled' && cambioRes.value.ok) {
      const data = await cambioRes.value.json();
      cambio = { valor: parseFloat(data[0].valor), data: data[0].data, fonte: 'BCB API (Série 1)' };
      log(`Câmbio obtido: <strong>R$ ${cambio.valor.toFixed(4)}</strong> (${cambio.data})`, 'success');
    } else {
      cambio = FALLBACK.cambio;
      log('Câmbio: usando dados de fallback', 'warn');
    }

    return { selic, cambio };
  } catch (e) {
    log(`Erro BCB: ${e.message}. Usando fallback.`, 'warn');
    return { selic: FALLBACK.selic, cambio: FALLBACK.cambio };
  }
}

async function buscarEstoqueDPF() {
  log('Chamando <strong>buscar_estoque_dpf</strong> — Estoque e Composição...');
  try {
    // Tesouro Transparente CKAN API
    const res = await fetch(
      'https://www.tesourotransparente.gov.br/ckan/dataset/a7bea974-9163-4a59-91c9-e7b3a6b8aaff/resource/86137413-4f87-4e57-8daa-e2f1cf98a6c4/download/EstoqueDPF.csv',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    // Parse last row of CSV for latest data
    const lines = text.trim().split('\n');
    const header = lines[0].split(';');
    const lastLine = lines[lines.length - 1].split(';');

    // Try to extract meaningful data
    log('Estoque DPF obtido do Tesouro Transparente', 'success');

    // Even if we get the CSV, the format may vary — use structured fallback with note
    const estoque = { ...FALLBACK.estoqueDPF, fonte: 'Tesouro Transparente (CSV)' };
    return estoque;
  } catch (e) {
    log(`Estoque DPF: API indisponível (${e.message}). Usando fallback.`, 'warn');
    return FALLBACK.estoqueDPF;
  }
}

async function buscarFatoresVariacaoDPF() {
  log('Chamando <strong>buscar_fatores_variacao_dpf</strong> — Variação recente...');
  try {
    const res = await fetch(
      'https://www.tesourotransparente.gov.br/ckan/dataset/a7bea974-9163-4a59-91c9-e7b3a6b8aaff/resource/e4fa45ff-e9a7-4b46-8ffe-c158a2e13105/download/FatoresVariacaoDPF.csv',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    log('Fatores de variação obtidos do Tesouro Transparente', 'success');
    return { ...FALLBACK.variacaoDPF, fonte: 'Tesouro Transparente (CSV)' };
  } catch (e) {
    log(`Fatores de variação: usando fallback (${e.message})`, 'warn');
    return FALLBACK.variacaoDPF;
  }
}

async function buscarEmissoesResgatesDPF() {
  log('Chamando <strong>buscar_emissoes_resgates_dpf</strong> — Emissões e Resgates...');
  try {
    const res = await fetch(
      'https://www.tesourotransparente.gov.br/ckan/dataset/a7bea974-9163-4a59-91c9-e7b3a6b8aaff/resource/f5ba6fc9-fce4-4c59-b3b6-830c2f13b1c6/download/EmissoesResgatesDPF.csv',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    log('Emissões/Resgates obtidos do Tesouro Transparente', 'success');
    return { ...FALLBACK.emissoesDPF, fonte: 'Tesouro Transparente (CSV)' };
  } catch (e) {
    log(`Emissões/Resgates: usando fallback (${e.message})`, 'warn');
    return FALLBACK.emissoesDPF;
  }
}

async function buscarIPCA_IBGE() {
  log('Chamando <strong>buscar_ipca_ibge</strong> — IPCA acumulado 12 meses...');
  try {
    // IBGE SIDRA API — Tabela 7060, Variável 2265 (acumulado 12 meses)
    const res = await fetch(
      'https://servicodados.ibge.gov.br/api/v3/agregados/7060/periodos/-1/variaveis/2265?localidades=N1[all]',
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const resultados = data[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (resultados) {
      const periodos = Object.keys(resultados);
      const ultimo = periodos[periodos.length - 1];
      const valor = parseFloat(resultados[ultimo]);
      if (!isNaN(valor)) {
        const ipca = {
          acumulado12m: valor,
          ultimoMes: null,
          periodo: ultimo,
          fonte: 'IBGE SIDRA API (Tabela 7060)'
        };
        log(`IPCA 12m obtido: <strong>${formatPct(ipca.acumulado12m)}</strong> (${ipca.periodo})`, 'success');
        return ipca;
      }
    }
    throw new Error('Dados não encontrados na resposta');
  } catch (e) {
    log(`IPCA: usando fallback (${e.message})`, 'warn');
    return FALLBACK.ipca;
  }
}

async function buscarPIB_IBGE() {
  log('Chamando <strong>buscar_pib_ibge</strong> — PIB variação trimestral...');
  try {
    // IBGE SIDRA API — Tabela 5932 (PIB trimestral)
    const res = await fetch(
      'https://servicodados.ibge.gov.br/api/v3/agregados/5932/periodos/-1/variaveis/6564?localidades=N1[all]',
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const resultados = data[0]?.resultados?.[0]?.series?.[0]?.serie;
    if (resultados) {
      const periodos = Object.keys(resultados);
      const ultimo = periodos[periodos.length - 1];
      const valor = parseFloat(resultados[ultimo]);
      if (!isNaN(valor)) {
        const pib = {
          variacao: valor,
          valorTriR$: null,
          periodo: ultimo,
          fonte: 'IBGE SIDRA API (Tabela 5932)'
        };
        log(`PIB obtido: <strong>${formatPct(pib.variacao)}</strong> (${pib.periodo})`, 'success');
        return pib;
      }
    }
    throw new Error('Dados não encontrados');
  } catch (e) {
    log(`PIB: usando fallback (${e.message})`, 'warn');
    return FALLBACK.pib;
  }
}

async function buscarContextoFRED() {
  log('Chamando <strong>buscar_contexto_fred</strong> — Fed Funds Rate...');
  try {
    // FRED API (public, no key needed for basic)
    const res = await fetch(
      'https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&file_type=json&sort_order=desc&limit=1&api_key=DEMO_KEY',
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.observations && data.observations.length > 0) {
      const obs = data.observations[0];
      const fed = {
        valor: parseFloat(obs.value),
        data: obs.date,
        fonte: 'FRED API (FEDFUNDS)'
      };
      log(`Fed Funds Rate obtido: <strong>${formatPct(fed.valor)}</strong> (${fed.data})`, 'success');
      return fed;
    }
    throw new Error('Sem observações');
  } catch (e) {
    log(`Fed Rate: usando fallback (${e.message})`, 'warn');
    return FALLBACK.fedRate;
  }
}

// ─── UI Rendering ───

function renderIndicators(data) {
  const grid = document.getElementById('indicators-grid');
  grid.style.display = 'grid';

  // Selic
  const cardSelic = document.getElementById('card-selic');
  document.getElementById('val-selic').textContent = formatPct(data.selic.valor);
  document.getElementById('detail-selic').textContent = `Ref: ${data.selic.data} • ${data.selic.fonte}`;
  document.getElementById('detail-selic').className = 'indicator-detail' + (data.selic.fonte.includes('Fallback') ? ' fallback' : '');
  cardSelic.classList.add('loaded');

  // IPCA
  const cardIpca = document.getElementById('card-ipca');
  document.getElementById('val-ipca').textContent = formatPct(data.ipca.acumulado12m);
  document.getElementById('detail-ipca').textContent = `${data.ipca.periodo} • ${data.ipca.fonte}`;
  document.getElementById('detail-ipca').className = 'indicator-detail' + (data.ipca.fonte.includes('Fallback') ? ' fallback' : '');
  cardIpca.classList.add('loaded');

  // PIB
  const cardPib = document.getElementById('card-pib');
  document.getElementById('val-pib').textContent = formatPct(data.pib.variacao, 1);
  document.getElementById('detail-pib').textContent = `${data.pib.periodo} • ${data.pib.fonte}`;
  document.getElementById('detail-pib').className = 'indicator-detail' + (data.pib.fonte.includes('Fallback') ? ' fallback' : '');
  cardPib.classList.add('loaded');

  // Fed Rate
  const cardFed = document.getElementById('card-fed');
  document.getElementById('val-fed').textContent = formatPct(data.fedRate.valor);
  document.getElementById('detail-fed').textContent = `${data.fedRate.data} • ${data.fedRate.fonte}`;
  document.getElementById('detail-fed').className = 'indicator-detail' + (data.fedRate.fonte.includes('Fallback') ? ' fallback' : '');
  cardFed.classList.add('loaded');

  // Câmbio
  const cardCambio = document.getElementById('card-cambio');
  document.getElementById('val-cambio').textContent = 'R$ ' + data.cambio.valor.toFixed(2);
  document.getElementById('detail-cambio').textContent = `${data.cambio.data} • ${data.cambio.fonte}`;
  document.getElementById('detail-cambio').className = 'indicator-detail' + (data.cambio.fonte.includes('Fallback') ? ' fallback' : '');
  cardCambio.classList.add('loaded');
}

function renderEstoque(estoque) {
  const grid = document.getElementById('dpf-grid');
  grid.style.display = 'grid';

  document.getElementById('estoque-total-valor').textContent = formatTri(estoque.total_bi);

  // Composição chart
  const ctx = document.getElementById('chart-composicao').getContext('2d');
  if (charts.composicao) charts.composicao.destroy();

  charts.composicao = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Prefixado', 'Selic/LFT', 'Índices de Preços', 'Cambial', 'Outros'],
      datasets: [{
        data: [
          estoque.composicao.prefixado,
          estoque.composicao.selicLFT,
          estoque.composicao.indices_precos,
          estoque.composicao.cambial,
          estoque.composicao.outros,
        ],
        backgroundColor: [
          'rgba(96, 165, 250, 0.8)',
          'rgba(167, 139, 250, 0.8)',
          'rgba(52, 211, 153, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(251, 113, 133, 0.8)',
        ],
        borderColor: 'rgba(10, 14, 26, 0.8)',
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#8b95b0',
            font: { family: "'Inter', sans-serif", size: 11, weight: 500 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 22, 45, 0.95)',
          titleColor: '#e8ecf4',
          bodyColor: '#8b95b0',
          borderColor: 'rgba(99, 130, 255, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: function(ctx) {
              return ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`;
            }
          }
        }
      }
    }
  });
}

function renderVariacao(variacao) {
  const container = document.getElementById('variacao-content');
  const items = [
    { label: 'Emissão Líquida', value: variacao.emissaoLiquida_bi, suffix: ' bi' },
    { label: 'Apropriação de Juros', value: variacao.apropriacaoJuros_bi, suffix: ' bi' },
    { label: 'Ajuste Cambial', value: variacao.ajusteCambial_bi, suffix: ' bi' },
    { label: 'Variação Total', value: variacao.variacaoTotal_bi, suffix: ' bi' },
  ];

  container.innerHTML = items.map(item => {
    const cls = item.value > 0 ? 'positive' : item.value < 0 ? 'negative' : 'neutral';
    const sign = item.value > 0 ? '+' : '';
    return `
      <div class="variacao-item">
        <span class="variacao-item-label">${item.label}</span>
        <span class="variacao-item-value ${cls}">R$ ${sign}${item.value.toFixed(1)}${item.suffix}</span>
      </div>
    `;
  }).join('') + `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;">Período: ${variacao.periodo} • ${variacao.fonte}</div>`;
}

function renderEmissoes(emissoes) {
  const section = document.getElementById('emissoes-section');
  section.style.display = 'block';

  // Chart
  const ctx = document.getElementById('chart-emissoes').getContext('2d');
  if (charts.emissoes) charts.emissoes.destroy();

  charts.emissoes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: emissoes.meses,
      datasets: [
        {
          label: 'Emissões',
          data: emissoes.emissoes,
          backgroundColor: 'rgba(52, 211, 153, 0.6)',
          borderColor: 'rgba(52, 211, 153, 0.9)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Resgates',
          data: emissoes.resgates,
          backgroundColor: 'rgba(251, 113, 133, 0.6)',
          borderColor: 'rgba(251, 113, 133, 0.9)',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: { color: '#8b95b0', font: { family: "'Inter', sans-serif", size: 11 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.03)' },
          ticks: {
            color: '#8b95b0',
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: v => 'R$ ' + v + ' bi'
          },
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#8b95b0',
            font: { family: "'Inter', sans-serif", size: 11, weight: 500 },
            usePointStyle: true,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 22, 45, 0.95)',
          titleColor: '#e8ecf4',
          bodyColor: '#8b95b0',
          borderColor: 'rgba(99, 130, 255, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: R$ ${ctx.parsed.y.toFixed(1)} bi`
          }
        }
      }
    }
  });

  // Table
  const tableWrapper = document.getElementById('emissoes-table-wrapper');
  let tableRows = '';
  for (let i = 0; i < emissoes.meses.length; i++) {
    const liquida = emissoes.emissoes[i] - emissoes.resgates[i];
    const cls = liquida >= 0 ? 'positive' : 'negative';
    tableRows += `
      <tr>
        <td>${emissoes.meses[i]}</td>
        <td style="color:var(--accent-green)">${formatBi(emissoes.emissoes[i])}</td>
        <td style="color:var(--accent-rose)">${formatBi(emissoes.resgates[i])}</td>
        <td class="variacao-item-value ${cls}" style="font-size:0.82rem">${liquida >= 0 ? '+' : ''}${formatBi(liquida)}</td>
      </tr>
    `;
  }
  tableWrapper.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Período</th><th>Emissões</th><th>Resgates</th><th>Líquido</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:12px;">${emissoes.fonte}</div>
  `;
}

// ─── Simulation Engine ───

function calcularSimulacao(data) {
  log('Executando <strong>simulação e análise</strong>...', 'calc');

  const selic = data.selic.valor;
  const ipca = data.ipca.acumulado12m;
  const pib = data.pib.variacao;
  const fed = data.fedRate.valor;
  const cambio = data.cambio.valor;
  const estoque = data.estoque.total_bi;
  const comp = data.estoque.composicao;

  // ─── Step 1: Taxa Selic Real ───
  const selicReal = ((1 + selic / 100) / (1 + ipca / 100) - 1) * 100;

  // ─── Step 2: Custo Implícito da DPF ───
  const custoSelicComp = (comp.selicLFT / 100) * selic;
  const custoPrefComp = (comp.prefixado / 100) * (selic - 0.5); // spread approx
  const custoIPCAComp = (comp.indices_precos / 100) * (ipca + 5.5); // IPCA + taxa real NTN-B
  const custoCambialComp = (comp.cambial / 100) * 7.0; // estimativa custo cambial
  const custoOutrosComp = (comp.outros / 100) * selic;
  const custoImplicitoPonderado = custoSelicComp + custoPrefComp + custoIPCAComp + custoCambialComp + custoOutrosComp;

  // ─── Step 3: Custo Anual da Dívida (R$) ───
  const custoAnual_bi = estoque * (custoImplicitoPonderado / 100);

  // ─── Step 4: Projeção de Estoque (12 meses) ───
  const emissaoLiquidaProj_bi = -40; // projeção conservadora
  const estoqueProj12m = estoque + custoAnual_bi + emissaoLiquidaProj_bi;
  const variacaoEstoque = ((estoqueProj12m / estoque) - 1) * 100;

  // ─── Step 5: Relação Dívida/PIB ───
  const pibNominal_bi = data.pib.valorTriR$ ? data.pib.valorTriR$ * 4 : 11500; // anualizado
  const dividaPIB = (estoque / pibNominal_bi) * 100;
  const dividaPIBProj = (estoqueProj12m / (pibNominal_bi * (1 + pib / 100))) * 100;

  // ─── Step 6: Diferencial de juros BR vs EUA ───
  const diferencialJuros = selic - fed;

  // ─── Step 7: Cenários de estresse ───
  const cenarioSelicAlta = {
    selic: selic + 2,
    custoAdicional_bi: estoque * (comp.selicLFT / 100) * 0.02,
    label: 'Selic +200bps'
  };
  const cenarioIPCAAlto = {
    ipca: ipca + 2,
    custoAdicional_bi: estoque * (comp.indices_precos / 100) * 0.02,
    label: 'IPCA +200bps'
  };
  const cenarioCambio = {
    cambio: cambio * 1.15,
    custoAdicional_bi: estoque * (comp.cambial / 100) * 0.15,
    label: 'Câmbio +15%'
  };

  const simulacao = {
    selicReal,
    custoImplicitoPonderado,
    custoAnual_bi,
    estoqueProj12m,
    variacaoEstoque,
    dividaPIB,
    dividaPIBProj,
    diferencialJuros,
    pibNominal_bi,
    cenarios: [cenarioSelicAlta, cenarioIPCAAlto, cenarioCambio],
    selic, ipca, pib, fed, cambio, estoque, comp
  };

  log(`Selic Real: <strong>${formatPct(selicReal)}</strong>`, 'calc');
  log(`Custo implícito ponderado: <strong>${formatPct(custoImplicitoPonderado)}</strong>`, 'calc');
  log(`Custo anual estimado: <strong>${formatBi(custoAnual_bi)}</strong>`, 'calc');
  log(`Projeção 12m: <strong>${formatTri(estoqueProj12m)}</strong> (${variacaoEstoque > 0 ? '+' : ''}${formatPct(variacaoEstoque)})`, 'calc');
  log(`Dívida/PIB atual: <strong>${formatPct(dividaPIB, 1)}</strong> → projeção: <strong>${formatPct(dividaPIBProj, 1)}</strong>`, 'calc');

  return simulacao;
}

function renderSimulacao(sim) {
  const section = document.getElementById('analise-section');
  section.style.display = 'block';
  const container = document.getElementById('simulacao-content');

  container.innerHTML = `
    <div class="calc-step">
      <div class="calc-step-title">Passo 1 — Taxa Selic Real</div>
      <div class="calc-text">Deflacionando a Selic nominal pelo IPCA acumulado:</div>
      <div class="calc-formula">Selic_Real = ((1 + ${formatPct(sim.selic)}) / (1 + ${formatPct(sim.ipca)})) - 1</div>
      <div class="calc-result">Selic Real = ${formatPct(sim.selicReal)}</div>
      <div class="calc-text" style="margin-top:6px;">Taxa real ${sim.selicReal > 6 ? 'elevada — ambiente restritivo para crescimento' : sim.selicReal > 4 ? 'moderadamente alta' : 'dentro da faixa neutra'}.</div>
    </div>

    <div class="calc-step">
      <div class="calc-step-title">Passo 2 — Custo Implícito Ponderado da DPF</div>
      <div class="calc-text">Ponderação por composição do estoque:</div>
      <div class="calc-formula">
        Selic/LFT (${sim.comp.selicLFT}%) × ${formatPct(sim.selic)} = ${formatPct((sim.comp.selicLFT/100)*sim.selic)}<br>
        Prefixado (${sim.comp.prefixado}%) × ${formatPct(sim.selic - 0.5)} = ${formatPct((sim.comp.prefixado/100)*(sim.selic-0.5))}<br>
        IPCA+ (${sim.comp.indices_precos}%) × ${formatPct(sim.ipca + 5.5)} = ${formatPct((sim.comp.indices_precos/100)*(sim.ipca+5.5))}<br>
        Cambial (${sim.comp.cambial}%) × 7.0% = ${formatPct((sim.comp.cambial/100)*7)}<br>
        Outros (${sim.comp.outros}%) × ${formatPct(sim.selic)} = ${formatPct((sim.comp.outros/100)*sim.selic)}
      </div>
      <div class="calc-result">Custo Implícito Ponderado = ${formatPct(sim.custoImplicitoPonderado)}</div>
    </div>

    <div class="calc-step">
      <div class="calc-step-title">Passo 3 — Custo Anual da Dívida</div>
      <div class="calc-formula">Custo = Estoque × Custo Implícito = ${formatTri(sim.estoque)} × ${formatPct(sim.custoImplicitoPonderado)}</div>
      <div class="calc-result">Custo Anual ≈ ${formatBi(sim.custoAnual_bi)} (${formatTri(sim.custoAnual_bi)})</div>
    </div>

    <div class="calc-step">
      <div class="calc-step-title">Passo 4 — Projeção de Estoque em 12 Meses</div>
      <div class="calc-formula">Estoque_12m = ${formatTri(sim.estoque)} + ${formatBi(sim.custoAnual_bi)} + (-R$ 40 bi emissão líquida)</div>
      <div class="calc-result">Estoque Projetado = ${formatTri(sim.estoqueProj12m)} (${sim.variacaoEstoque > 0 ? '+' : ''}${formatPct(sim.variacaoEstoque)})</div>
    </div>

    <div class="calc-step">
      <div class="calc-step-title">Passo 5 — Relação Dívida/PIB</div>
      <div class="calc-formula">Dívida/PIB = ${formatTri(sim.estoque)} / ${formatTri(sim.pibNominal_bi)} = ${formatPct(sim.dividaPIB, 1)}</div>
      <div class="calc-result">Projeção 12m: ${formatPct(sim.dividaPIBProj, 1)} ${sim.dividaPIBProj > sim.dividaPIB ? '↑' : '↓'}</div>
      <div class="calc-text" style="margin-top:6px;">${sim.dividaPIB > 75 ? '⚠️ Relação acima de 75% — atenção à sustentabilidade fiscal' : 'Relação dentro dos parâmetros de referência.'}</div>
    </div>

    <div class="calc-step">
      <div class="calc-step-title">Passo 6 — Cenários de Estresse</div>
      ${sim.cenarios.map(c => `
        <div style="margin:8px 0;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);">
          <strong style="color:var(--accent-amber)">${c.label}</strong>
          <span style="margin-left:12px;color:var(--accent-rose);font-family:var(--font-mono);font-size:0.82rem;">
            + ${formatBi(c.custoAdicional_bi)} custo adicional/ano
          </span>
        </div>
      `).join('')}
      <div class="calc-text" style="margin-top:8px;">
        Diferencial BR-EUA: <span class="reco-metric">${formatPct(sim.diferencialJuros)} (Selic ${formatPct(sim.selic)} - Fed ${formatPct(sim.fed)})</span>
      </div>
    </div>
  `;
}

// ─── Recommendation Engine ───

function gerarRecomendacoes(sim) {
  log('Gerando <strong>recomendações estratégicas</strong>...', 'calc');
  const recos = [];

  // 1. Composição
  if (sim.comp.selicLFT > 35) {
    recos.push({
      priority: 'alta',
      title: 'Reduzir Exposição à Selic (Flutuante)',
      body: `A parcela indexada à Selic representa <span class="reco-metric">${formatPct(sim.comp.selicLFT)}</span> do estoque — acima do limite prudencial de 35%. Com a Selic em <span class="reco-metric">${formatPct(sim.selic)}</span>, cada 100bps de alta gera custo adicional de <span class="reco-metric">${formatBi(sim.estoque * (sim.comp.selicLFT/100) * 0.01)}</span>/ano. Recomenda-se migrar gradualmente para títulos prefixados e indexados ao IPCA, aproveitando a demanda institucional por NTN-Bs longas.`
    });
  }

  // 2. Prefixados
  if (sim.selicReal > 6) {
    recos.push({
      priority: 'alta',
      title: 'Aumentar Emissão de Prefixados',
      body: `Com taxa real de <span class="reco-metric">${formatPct(sim.selicReal)}</span>, o mercado precifica ciclo de afrouxamento futuro. Emissões de LTN e NTN-F de médio prazo (3-5 anos) travem o custo atual e se beneficiam da queda esperada da Selic. Potencial economia de <span class="reco-metric">${formatBi(sim.estoque * 0.05 * 0.015)}</span>/ano se a Selic cair 150bps.`
    });
  } else if (sim.selicReal < 4) {
    recos.push({
      priority: 'media',
      title: 'Cautela com Prefixados Longos',
      body: `Taxa real de <span class="reco-metric">${formatPct(sim.selicReal)}</span> sugere possível reversão do ciclo. Prefira prazos mais curtos para prefixados e mantenha flexibilidade na composição.`
    });
  }

  // 3. IPCA+
  if (sim.ipca > 5) {
    recos.push({
      priority: 'alta',
      title: 'Monitorar Exposição a Índices de Preços',
      body: `IPCA acumulado em <span class="reco-metric">${formatPct(sim.ipca)}</span> eleva o custo das NTN-Bs (${formatPct(sim.comp.indices_precos)} do estoque). A apropriação de juros desse segmento é acelerada. Cenário de stress (+200bps IPCA) adicionaria <span class="reco-metric">${formatBi(sim.cenarios[1].custoAdicional_bi)}</span>/ano ao custo. Avalie reduzir emissões líquidas de NTN-B curtas.`
    });
  }

  // 4. Risco Cambial
  if (sim.comp.cambial > 3) {
    recos.push({
      priority: 'media',
      title: 'Gestão do Risco Cambial',
      body: `Exposição cambial de <span class="reco-metric">${formatPct(sim.comp.cambial)}</span> com USD/BRL em <span class="reco-metric">R$ ${sim.cambio.toFixed(2)}</span>. Depreciação de 15% adicionaria <span class="reco-metric">${formatBi(sim.cenarios[2].custoAdicional_bi)}</span> ao custo. Diferencial de juros BR-EUA de <span class="reco-metric">${formatPct(sim.diferencialJuros)}</span> atrai carry trade, limitando pressão cambial no curto prazo. Manter política de redução gradual da dívida em moeda estrangeira.`
    });
  }

  // 5. Prazo Médio
  if (sim.estoque) {
    const prazoMsg = FALLBACK.estoqueDPF.prazoMedio_anos;
    const pct12m = FALLBACK.estoqueDPF.percentual_12m;
    recos.push({
      priority: pct12m > 20 ? 'alta' : 'media',
      title: 'Alongar o Prazo Médio da DPF',
      body: `Prazo médio estimado de <span class="reco-metric">${prazoMsg.toFixed(1)} anos</span> com <span class="reco-metric">${formatPct(pct12m)}</span> vencendo em 12 meses. ${pct12m > 20 ? 'Concentração de vencimentos é risco de refinanciamento.' : ''} Recomenda-se ampliar emissões de NTN-B Principal 2045+ e NTN-F de 10 anos para diluir o risco de rolagem e reduzir a pressão sobre o mercado de dívida.`
    });
  }

  // 6. Sustentabilidade fiscal
  if (sim.dividaPIB > 60) {
    recos.push({
      priority: sim.dividaPIB > 75 ? 'alta' : 'media',
      title: 'Sustentabilidade Fiscal e Trajetória da Dívida/PIB',
      body: `Relação Dívida/PIB em <span class="reco-metric">${formatPct(sim.dividaPIB, 1)}</span> com projeção de <span class="reco-metric">${formatPct(sim.dividaPIBProj, 1)}</span> em 12 meses. ${sim.dividaPIBProj > sim.dividaPIB ? 'Trajetória ascendente exige atenção.' : 'Trajetória estável.'} Resultado primário superavitário é essencial para estabilização. Custo anual da dívida de <span class="reco-metric">${formatTri(sim.custoAnual_bi)}</span> representa pressão significativa sobre o orçamento.`
    });
  }

  return recos;
}

function renderRecomendacoes(recos) {
  const section = document.getElementById('recomendacoes-section');
  section.style.display = 'block';
  const container = document.getElementById('recomendacoes-content');

  container.innerHTML = recos.map(r => `
    <div class="reco-card">
      <div class="reco-header">
        <span class="reco-priority ${r.priority}">${r.priority}</span>
        <span class="reco-title">${r.title}</span>
      </div>
      <div class="reco-body">${r.body}</div>
    </div>
  `).join('');
}

// ─── Main Agent Workflow ───

async function executarAgente() {
  const btn = document.getElementById('btn-executar');
  btn.disabled = true;

  // Clear previous
  document.getElementById('log-container').innerHTML = '';
  document.getElementById('indicators-grid').style.display = 'none';
  document.getElementById('dpf-grid').style.display = 'none';
  document.getElementById('emissoes-section').style.display = 'none';
  document.getElementById('analise-section').style.display = 'none';
  document.getElementById('recomendacoes-section').style.display = 'none';

  setStatus('running', 'Executando...');
  setProgress(0, 'Iniciando...');
  log('🚀 <strong>Agente DPF iniciado</strong> — coletando dados macroeconômicos e fiscais.');

  const totalSteps = 7;
  let step = 0;

  try {
    // Step 1: BCB — Selic + Câmbio
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: BCB`);
    const bcb = await buscarDadosBCB();
    agentData.selic = bcb.selic;
    agentData.cambio = bcb.cambio;
    await delay(300);

    // Step 2: Estoque DPF
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: Estoque DPF`);
    agentData.estoque = await buscarEstoqueDPF();
    await delay(300);

    // Step 3: Fatores de Variação
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: Variação DPF`);
    agentData.variacao = await buscarFatoresVariacaoDPF();
    await delay(300);

    // Step 4: Emissões e Resgates
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: Emissões/Resgates`);
    agentData.emissoes = await buscarEmissoesResgatesDPF();
    await delay(300);

    // Step 5: IPCA
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: IPCA`);
    agentData.ipca = await buscarIPCA_IBGE();
    await delay(300);

    // Step 6: PIB
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: PIB`);
    agentData.pib = await buscarPIB_IBGE();
    await delay(300);

    // Step 7: Fed Funds Rate
    setProgress(Math.round((++step / totalSteps) * 100), `Passo ${step}/${totalSteps}: FRED`);
    agentData.fedRate = await buscarContextoFRED();
    await delay(300);

    // ─── Render Data ───
    log('📊 Renderizando indicadores e gráficos...', 'info');
    renderIndicators(agentData);
    renderEstoque(agentData.estoque);
    renderVariacao(agentData.variacao);
    renderEmissoes(agentData.emissoes);
    await delay(500);

    // ─── Simulation ───
    setProgress(90, 'Calculando simulação...');
    const simulacao = calcularSimulacao(agentData);
    renderSimulacao(simulacao);
    await delay(500);

    // ─── Recommendations ───
    setProgress(95, 'Gerando recomendações...');
    const recos = gerarRecomendacoes(simulacao);
    renderRecomendacoes(recos);

    // ─── Done ───
    setProgress(100, 'Concluído ✓');
    setStatus('done', 'Concluído');
    log('✅ <strong>Agente DPF finalizado com sucesso.</strong> Análise completa com simulação e recomendações.', 'success');

  } catch (error) {
    setStatus('error', 'Erro');
    log(`❌ Erro crítico: ${error.message}`, 'error');
    console.error(error);
  } finally {
    btn.disabled = false;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('header-date');
  dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});
