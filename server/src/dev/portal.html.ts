export const PORTAL_HTML = /* html */ `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Finman — ingestion portal</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  body{margin:0;background:#0e0f13;color:#e7e7ea}
  header{padding:14px 20px;background:#15171d;border-bottom:1px solid #23262e;font-weight:600}
  .wrap{display:flex;gap:16px;padding:16px;flex-wrap:wrap}
  .col{flex:1;min-width:340px}
  .card{background:#15171d;border:1px solid #23262e;border-radius:10px;padding:16px;margin-bottom:16px}
  label{display:block;font-size:12px;color:#9aa0ab;margin:8px 0 4px}
  input,textarea{width:100%;background:#0e0f13;color:#e7e7ea;border:1px solid #2a2e38;border-radius:8px;padding:10px;font-size:14px}
  textarea{min-height:80px;resize:vertical}
  button{margin-top:12px;background:#7c5cff;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
  button.ghost{background:#23262e}
  .num{font-size:28px;font-weight:700}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1d2027}
  .log{font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .step{padding:3px 0;color:#cdd2db}
  .msg{border-left:3px solid #7c5cff;padding:8px 12px;margin:10px 0;background:#0e0f13;border-radius:0 8px 8px 0}
  .muted{color:#8b909b;font-size:12px}
  .pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:#23262e;margin-left:6px}
</style></head>
<body>
<header>Finman — ingestion portal <span class="muted">(dev/test · raw SMS is server-side here only)</span></header>
<div class="wrap">
  <div class="col">
    <div class="card">
      <label>Device key (must match the emulator)</label>
      <input id="deviceKey" value="finman-dev-shared"/>
      <label>Sender (DLT header, e.g. VM-HDFCBK)</label>
      <input id="sender" value="VM-HDFCBK"/>
      <label>SMS body — paste a transaction message</label>
      <textarea id="body">Rs.450.00 spent at Zomato via UPI from a/c **1234 on 02-06-26. Avl Bal Rs.12,000.00</textarea>
      <button onclick="ingest()">Ingest message</button>
    </div>
    <div class="card"><div class="muted">Ingestion log (latest first)</div><div id="logs"></div></div>
  </div>
  <div class="col">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>Dashboard</strong><button class="ghost" onclick="refresh()">Refresh</button>
      </div>
      <div class="muted" id="period"></div>
      <div class="row"><span>Income</span><span class="num" style="color:#5ee29a" id="income">₹0.00</span></div>
      <div class="row"><span>Expenses</span><span class="num" style="color:#ff6b6b" id="expenses">₹0.00</span></div>
      <div class="row"><span>Savings</span><span class="num" style="color:#6cc6ff" id="savings">₹0.00</span></div>
    </div>
    <div class="card"><strong>Spending by category</strong><div id="cats"></div></div>
    <div class="card"><strong>Account balances</strong>
      <div class="muted">latest SMS per account — a snapshot, not part of income − expenses</div>
      <div id="balances"></div></div>
  </div>
</div>
<script>
const $=id=>document.getElementById(id);
const dk=()=>$('deviceKey').value.trim();
async function ingest(){
  const payload={deviceKey:dk(),sender:$('sender').value.trim(),body:$('body').value.trim()};
  const r=await fetch('/v1/dev/ingest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json();
  const div=document.createElement('div');div.className='msg';
  div.innerHTML='<div>'+esc(payload.body)+' <span class="pill">'+(data.outcome||r.status)+'</span></div>'+
    '<div class="log">'+(data.log||[]).map(s=>'<div class="step">'+esc(s.step)+' → '+esc(s.detail)+'</div>').join('')+'</div>';
  $('logs').prepend(div);
  refresh();
}
async function refresh(){
  const r=await fetch('/v1/dev/dashboard?deviceKey='+encodeURIComponent(dk()));
  const d=await r.json();
  $('income').textContent='₹'+(d.income||'0.00');
  $('expenses').textContent='₹'+(d.expenses||'0.00');
  $('savings').textContent='₹'+(d.savings||'0.00');
  $('period').textContent=d.period?('Showing '+d.period.label):'';
  $('cats').innerHTML=(d.byCategory||[]).filter(c=>parseFloat(c.amount)>0)
    .map(c=>'<div class="row"><span>'+esc(c.label)+'</span><span>₹'+esc(c.amount)+'</span></div>').join('')||'<div class="muted">none yet</div>';
  $('balances').innerHTML=(d.balances||[])
    .map(b=>'<div class="row"><span>'+esc(b.label||b.lineId)+'</span><span>₹'+esc(b.balance)+'</span></div>').join('')||'<div class="muted">none yet</div>';
}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
refresh();
</script>
</body></html>`;
