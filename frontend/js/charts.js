/* FINOVA — pembungkus Lightweight Charts. */
(function () {
  'use strict';

  const BASE_OPTS = {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#A6ADB4',
      fontSize: 11,
      fontFamily: "'Inter', system-ui, sans-serif",
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.045)' },
      horzLines: { color: 'rgba(255,255,255,0.045)' },
    },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
    timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: false },
    crosshair: {
      vertLine: { color: 'rgba(125,211,232,0.4)', labelBackgroundColor: '#23272B' },
      horzLine: { color: 'rgba(125,211,232,0.4)', labelBackgroundColor: '#23272B' },
    },
  };

  function toTime(iso) {
    // ISO -> detik UNIX (UTC) sesuai API lightweight-charts v4
    return Math.floor(new Date(iso).getTime() / 1000);
  }

  function createChart(container, extra = {}) {
    if (!window.LightweightCharts || !container || typeof ResizeObserver === 'undefined') return null;
    let chart = null;
    try {
      chart = LightweightCharts.createChart(container, {
      ...BASE_OPTS,
      width: container.clientWidth,
      height: container.clientHeight || 300,
        ...extra,
      });
    } catch (_) {
      return null; // tanpa canvas/ WebGL di lingkungan uji — panggilan menangani null
    }
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 300 });
    });
    ro.observe(container);
    return chart;
  }

  function addCandles(chart, candles) {
    const series = chart.addCandlestickSeries({
      upColor: '#4ADE80', downColor: '#F87171',
      borderUpColor: '#4ADE80', borderDownColor: '#F87171',
      wickUpColor: '#4ADE80', wickDownColor: '#F87171',
    });
    series.setData(candles.map((c) => ({
      time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    chart.timeScale().fitContent();
    return series;
  }

  function addLine(chart, candles, color = '#7DD3E8') {
    const series = chart.addAreaSeries({
      lineColor: color, lineWidth: 2,
      topColor: 'rgba(125,211,232,0.22)',
      bottomColor: 'rgba(125,211,232,0.0)',
      priceLineVisible: false,
    });
    series.setData(candles.map((c) => ({ time: toTime(c.time), value: c.close })));
    chart.timeScale().fitContent();
    return series;
  }

  /** Grafik batang arus kas sederhana berbasis canvas (tanpa dependency). */
  function cashflowBars(canvas, rows) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth * DPR, H = canvas.clientHeight * DPR;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    if (!rows || !rows.length) return;
    const max = Math.max(...rows.map((r) => Math.max(r.income, r.expense)), 1);
    const pad = 30 * DPR;
    const groupW = (W - pad * 2) / rows.length;
    rows.forEach((r, i) => {
      const x0 = pad + i * groupW + groupW * 0.18;
      const bw = groupW * 0.26;
      const hIn = (r.income / max) * (H - pad * 2);
      const hEx = (r.expense / max) * (H - pad * 2);
      ctx.fillStyle = '#7DD3E8';
      ctx.fillRect(x0, H - pad - hIn, bw, hIn);
      ctx.fillStyle = '#5c646c';
      ctx.fillRect(x0 + bw + 4 * DPR, H - pad - hEx, bw, hEx);
      ctx.fillStyle = '#A6ADB4';
      ctx.font = `${10 * DPR}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(r.month.slice(2), x0 + bw, H - pad + 14 * DPR);
    });
  }

  /** Donat distribusi pengeluaran. */
  function donut(canvas, items, colors) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth * DPR, H = canvas.clientHeight * DPR;
    canvas.width = W; canvas.height = H;
    const total = items.reduce((s, i) => s + i.total, 0);
    if (!total) return;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8 * DPR, r = R * 0.62;
    let a = -Math.PI / 2;
    const palette = colors || ['#7DD3E8', '#C9CED4', '#8f979f', '#5c646c', '#4ADE80', '#FBBF24', '#F87171', '#a78bfa'];
    items.forEach((it, idx) => {
      const sweep = (it.total / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a, a + sweep);
      ctx.arc(cx, cy, r, a + sweep, a, true);
      ctx.closePath();
      ctx.fillStyle = palette[idx % palette.length];
      ctx.fill();
      a += sweep;
    });
  }

  window.charts = { createChart, addCandles, addLine, cashflowBars, donut };
})();
