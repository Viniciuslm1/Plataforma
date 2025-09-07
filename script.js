// =================== Utilitários ===================
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format;
const pad = n => String(n).padStart(2, '0');
const now = () => Date.now();

// =================== Gerenciamento de Estado Global ===================
const state = {
  balance: 1000,
  currentSymbol: 'btcusdt',
  currentSource: 'binance',
  price: 30000,
  timeframeMin: 1,
  ticks: [],
  orders: [],
  todayLoss: 0,
  todayKey: new Date().toISOString().slice(0, 10),
  lastMartingaleLoss: false,
};

// =================== Gerenciador de UI e Eventos ===================
class UIManager {
  constructor() {
    this.els = {
      balance: document.getElementById('balance'),
      price: document.getElementById('price'),
      potential: document.getElementById('potential'),
      purchaseDeadline: document.getElementById('purchaseDeadline'),
      expiryClock: document.getElementById('expiryClock'),
      symbolBox: document.getElementById('symbolBox'),
      symbolSel: document.getElementById('symbol'),
      sourceSel: document.getElementById('source'),
      payoutSel: document.getElementById('payout'),
      stakeInput: document.getElementById('stake'),
      expirySel: document.getElementById('expiry'),
      ordersBody: document.getElementById('ordersBody'),
      soundChk: document.getElementById('sound'),
      mgChk: document.getElementById('martingale'),
      lossInput: document.getElementById('dailyLoss'),
    };
    this.bindEvents();
    this.updatePotential();
  }

  bindEvents() {
    this.els.symbolSel.onchange = this.handleSymbolChange.bind(this);
    this.els.sourceSel.onchange = this.handleSourceChange.bind(this);
    this.els.payoutSel.onchange = this.updatePotential.bind(this);
    this.els.stakeInput.oninput = this.updatePotential.bind(this);
    document.getElementById('btnCall').onclick = () => this.handlePlaceOrder('CALL');
    document.getElementById('btnPut').onclick = () => this.handlePlaceOrder('PUT');
    document.getElementById('btnDeposit').onclick = this.handleDeposit.bind(this);
    document.querySelectorAll('.quick-amt').forEach(el => el.onclick = () => this.handleQuickAmount(el.dataset.v));
    document.querySelectorAll('.quick-exp').forEach(el => el.onclick = () => this.handleQuickExpiry(el.dataset.v));
    document.querySelectorAll('.chip[data-tf]').forEach(ch => ch.onclick = () => this.handleTimeframeChange(ch));
    document.getElementById('search').oninput = e => this.renderAssetList(e.target.value);
    window.addEventListener('keydown', this.handleHotkeys.bind(this));
  }

  updateBalance() {
    this.els.balance.textContent = fmtBRL(state.balance).replace('R$ ', '');
  }

  updatePotential() {
    const stake = Number(this.els.stakeInput.value || 0);
    const payout = Number(this.els.payoutSel.value);
    this.els.potential.textContent = fmtBRL(stake * (1 + payout));
  }

  renderOrders() {
    this.els.ordersBody.innerHTML = '';
    const openFirst = [...state.orders].sort((a, b) => a.status !== b.status ? (a.status === 'OPEN' ? -1 : 1) : b.entryTime - a.entryTime);
    openFirst.forEach((o, i) => {
      const tr = document.createElement('tr');
      const statusText = o.status === 'OPEN' ? '<span class="pill open">ABERTA</span>' : (o.type === 'CASHOUT' ? '<span class="pill">CASHOUT</span>' : (((o.side === 'CALL') ? (o.exitPrice > o.entryPrice) : (o.exitPrice < o.entryPrice)) ? '<span class="pill win">WIN</span>' : '<span class="pill loss">LOSS</span>'));
      const pnl = o.status === 'OPEN' ? 0 : (o.type === 'CASHOUT' ? o.cashoutValue : (((o.side === 'CALL') ? (o.exitPrice > o.entryPrice) : (o.exitPrice < o.entryPrice)) ? o.stake * o.payout : -o.stake));

      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${o.side}</td>
        <td>${new Date(o.entryTime).toLocaleTimeString()}</td>
        <td>${new Date(o.expiryTime).toLocaleTimeString()}</td>
        <td>${o.entryPrice.toFixed(5)}</td>
        <td>${(o.exitPrice ?? state.price).toFixed(5)}</td>
        <td>${statusText}</td>
        <td class="right ${pnl > 0 ? 'green' : (pnl < 0 ? 'red' : '')}">${pnl === 0 ? '—' : fmtBRL(pnl)}</td>
        <td>${o.status === 'OPEN' ? `<button class="btn" onclick="orderManager.cashout('${o.id}')">Cashout</button>` : ''}</td>
      `;
      this.els.ordersBody.appendChild(tr);
    });
  }

  renderAssetList(filter = '') {
    const assets = [
      { sym: 'BTCUSDT', tag: 'Cripto', payout: 80 },
      { sym: 'ETHUSDT', tag: 'Cripto', payout: 80 },
      { sym: 'ADAUSDT', tag: 'Cripto', payout: 75 },
      { sym: 'EURUSD', tag: 'Forex', payout: 70 },
      { sym: 'GBPUSD', tag: 'Forex', payout: 70 },
    ];
    document.getElementById('assetList').innerHTML = '';
    assets.filter(a => a.sym.toLowerCase().includes(filter.toLowerCase())).forEach(a => {
      const row = document.createElement('div');
      row.className = 'asset';
      row.onclick = () => {
        this.els.symbolSel.value = a.sym.toLowerCase();
        this.els.symbolSel.onchange();
      };
      row.innerHTML = `<div><div class="sym">${a.sym}</div><div class="muted" style="font-size:11px">${a.tag}</div></div><div class="payout">${a.payout}%</div>`;
      document.getElementById('assetList').appendChild(row);
    });
  }

  handleSymbolChange() {
    state.currentSymbol = this.els.symbolSel.value;
    this.els.symbolBox.textContent = state.currentSymbol.toUpperCase() + " (Binance)";
    tradingViewManager.renderChart(state.currentSymbol, state.timeframeMin);
    state.candles = []; // Limpa os dados do gráfico antigo
    state.ticks = [];
    if (state.currentSource === 'binance') {
      priceFeed.connectBinance();
    }
  }

  handleSourceChange() {
    state.currentSource = this.els.sourceSel.value;
    if (state.currentSource === 'binance') {
      priceFeed.connectBinance();
    } else {
      priceFeed.safeClose();
    }
  }

  handlePlaceOrder(side) {
    orderManager.place(side);
    this.updateBalance();
    this.renderOrders();
  }

  handleDeposit() {
    state.balance += 1000;
    this.updateBalance();
  }

  handleQuickAmount(val) {
    this.els.stakeInput.value = val;
    this.updatePotential();
  }

  handleQuickExpiry(val) {
    this.els.expirySel.value = val;
  }

  handleTimeframeChange(el) {
    document.querySelectorAll('.chip[data-tf]').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    state.timeframeMin = Number(el.dataset.tf);
    tradingViewManager.renderChart(state.currentSymbol, state.timeframeMin);
  }

  handleHotkeys(e) {
    if (e.key === 'ArrowUp') this.handlePlaceOrder('CALL');
    else if (e.key === 'ArrowDown') this.handlePlaceOrder('PUT');
    else if (e.key === '+') { this.els.stakeInput.value = Number(this.els.stakeInput.value || 0) + 1; this.updatePotential(); }
    else if (e.key === '-') { this.els.stakeInput.value = Math.max(1, Number(this.els.stakeInput.value || 0) - 1); this.updatePotential(); }
    else if (e.key === 'a' || e.key === 'A') { this.stepExpiry(-1); }
    else if (e.key === 'd' || e.key === 'D') { this.stepExpiry(1); }
  }

  stepExpiry(dir) {
    const opts = [30, 60, 120, 300];
    let i = opts.indexOf(Number(this.els.expirySel.value));
    i = Math.min(opts.length - 1, Math.max(0, i + dir));
    this.els.expirySel.value = opts[i];
  }
}

// =================== Gerenciador de Ordens e Lógica de Negociação ===================
class OrderManager {
  place(side) {
    const stake = Math.max(1, Number(uiManager.els.stakeInput.value || 0));
    const payout = Number(uiManager.els.payoutSel.value);
    const expSec = Number(uiManager.els.expirySel.value);

    if (uiManager.els.lossInput.value > 0 && state.todayLoss >= Number(uiManager.els.lossInput.value)) {
      alert('Limite diário de perda atingido.');
      return;
    }
    if (stake > state.balance) {
      alert('Saldo insuficiente.');
      return;
    }

    const t0 = now();
    const order = {
      id: crypto.randomUUID(),
      side,
      stake,
      payout,
      entryTime: t0,
      expiryTime: t0 + expSec * 1000,
      entryPrice: state.price,
      status: 'OPEN',
      exitPrice: null,
      type: 'NORMAL'
    };
    state.orders.push(order);
    state.balance -= stake;
    if (uiManager.els.soundChk.checked) {
      soundManager.beep(220, 0.07);
    }

    if (state.lastMartingaleLoss && uiManager.els.mgChk.checked) {
        uiManager.els.stakeInput.value = Math.ceil(stake * 2);
        uiManager.updatePotential();
    } else {
        uiManager.els.stakeInput.value = 20;
        uiManager.updatePotential();
    }
  }

  cashout(id) {
    const order = state.orders.find(x => x.id === id && x.status === 'OPEN');
    if (!order) return;
    const t = now();
    const remaining = Math.max(0, order.expiryTime - t);
    if (remaining < 5000) {
      alert('Cashout indisponível nos últimos 5s.');
      return;
    }

    const elapsed = (t - order.entryTime) / (order.expiryTime - order.entryTime);
    const itm = (order.side === 'CALL') ? (state.price > order.entryPrice) : (state.price < order.entryPrice);
    let factor = 0.3 + elapsed * 0.6 + (itm ? 0.15 : -0.1);
    factor = Math.max(0.05, Math.min(0.95, factor));
    const value = order.stake * (1 + order.payout) * factor;

    order.status = 'CLOSED';
    order.type = 'CASHOUT';
    order.exitPrice = state.price;
    order.cashoutValue = value;
    state.balance += value;
    if (uiManager.els.soundChk.checked) {
      soundManager.beep(600, 0.05);
    }
  }

  settleOrders() {
    const t = now();
    for (const o of state.orders) {
      if (o.status === 'OPEN' && t >= o.expiryTime) {
        o.status = 'CLOSED';
        o.exitPrice = state.price;
        const win = (o.side === 'CALL') ? state.price > o.entryPrice : state.price < o.entryPrice;
        state.lastMartingaleLoss = !win;
        if (win) {
          state.balance += o.stake * (1 + o.payout);
          if (uiManager.els.soundChk.checked) {
            soundManager.beep(880, 0.08);
          }
        } else {
          state.todayLoss += o.stake;
          if (uiManager.els.soundChk.checked) {
            soundManager.beep(120, 0.08);
          }
        }
      }
    }
  }
}

// =================== Gerenciador de Dados (Preço) ===================
class PriceFeed {
  constructor() {
    this.ws = null;
    this.lastT = now();
  }

  safeClose() {
    if (this.ws && this.ws.readyState <= 1) {
      try {
        this.ws.close();
      } catch (_) {}
    }
    this.ws = null;
  }

  connectBinance() {
    this.safeClose();
    const url = `wss://stream.binance.com:9443/ws/${state.currentSymbol}@trade`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      const pp = parseFloat(m.p);
      if (isFinite(pp)) {
        this.onTick(pp);
      }
    };
    this.ws.onerror = () => {
      state.currentSource = 'sim';
      uiManager.els.sourceSel.value = 'sim';
    };
  }

  onTick(p) {
    state.price = p;
    uiManager.els.price.textContent = p.toFixed(5);
    state.ticks.push({ t: now(), p });
    orderManager.settleOrders();
    uiManager.renderOrders();
    uiManager.updateBalance();
    storageManager.save();
  }

  tickSim() {
    const t = now();
    const dt = Math.max(100, t - this.lastT);
    this.lastT = t;
    const drift = 0.02,
      vol = 2.2,
      noise = (Math.random() - 0.5) * vol,
      meanRev = (30050 - state.price) * 0.0005;
    state.price = Math.max(10, state.price * (1 + (drift * 1e-4) + noise * 1e-4) + meanRev);
    this.onTick(state.price);
  }
}

// =================== Gerenciador de Gráfico (TradingView) ===================
class TradingViewManager {
  constructor() {
    this.widget = null;
  }

  renderChart(symbol, timeframe) {
    const defaultTimeframe = {
      '1': '1', '5': '5', '15': '15'
    }[timeframe] || '1';
    
    if (this.widget) {
      this.widget.remove();
    }
    
    this.widget = new TradingView.widget({
      "container_id": "tradingview-chart-container",
      "symbol": `BINANCE:${symbol.toUpperCase()}`,
      "interval": defaultTimeframe,
      "theme": "dark",
      "style": "1",
      "locale": "br",
      "toolbar_bg": "#111827",
      "enable_publishing": false,
      "allow_symbol_change": false,
      "save_image": false,
      "hide_side_toolbar": true,
      "hide_top_toolbar": false,
      "withdateranges": true,
      "drawings_access": {
        "type": "black",
        "tools": [
          { "name": "Trend Line" }
        ]
      }
    });
  }
}

// =================== Gerenciador de Persistência (LocalStorage) ===================
class StorageManager {
  save() {
    localStorage.setItem('bo_balance', String(state.balance));
    localStorage.setItem('bo_orders', JSON.stringify(state.orders));
    localStorage.setItem('bo_today', JSON.stringify({ key: state.todayKey, loss: state.todayLoss }));
  }

  load() {
    const b = localStorage.getItem('bo_balance');
    if (b) state.balance = parseFloat(b);
    const o = localStorage.getItem('bo_orders');
    if (o) state.orders = JSON.parse(o);
    const td = localStorage.getItem('bo_today');
    if (td) {
      try {
        const x = JSON.parse(td);
        if (x.key === state.todayKey) state.todayLoss = x.loss;
      } catch {}
    }
    uiManager.updateBalance();
    uiManager.renderOrders();
  }
}

// =================== Gerenciador de Som ===================
class SoundManager {
  constructor() {
    this.ac = new(window.AudioContext || window.webkitAudioContext)();
  }

  beep(freq = 440, dur = 0.05) {
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.frequency.value = freq;
    o.type = 'square';
    o.connect(g);
    g.connect(this.ac.destination);
    g.gain.setValueAtTime(0.08, this.ac.currentTime);
    o.start();
    o.stop(this.ac.currentTime + dur);
    setTimeout(() => { o.disconnect(); g.disconnect(); }, dur * 1000 + 20);
  }
}

// =================== Ciclo de Vida da Aplicação ===================
const uiManager = new UIManager();
const orderManager = new OrderManager();
const priceFeed = new PriceFeed();
const tradingViewManager = new TradingViewManager();
const storageManager = new StorageManager();
const soundManager = new SoundManager();

function mainLoop() {
  if (state.currentSource === 'sim') {
    priceFeed.tickSim();
  }
  updateClocks();
  requestAnimationFrame(mainLoop);
}

function updateClocks() {
  const expSec = Number(uiManager.els.expirySel.value);
  const t = new Date();
  const ms = t.getSeconds() * 1000 + t.getMilliseconds();
  const slot = expSec * 1000;
  const untilClose = slot - (ms % slot);
  const expTime = new Date(t.getTime() + untilClose);
  uiManager.els.purchaseDeadline.textContent = `${pad(expTime.getMinutes())}:${pad(expTime.getSeconds())}`;
  uiManager.els.expiryClock.textContent = `${pad(expTime.getMinutes())}:${pad(expTime.getSeconds())}`;
}

// =================== Inicialização ===================
function init() {
  uiManager.renderAssetList();
  storageManager.load();
  tradingViewManager.renderChart(state.currentSymbol, state.timeframeMin);
  priceFeed.connectBinance();
  mainLoop();
}

init();