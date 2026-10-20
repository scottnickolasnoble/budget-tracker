const { escapeHTML, getJSON, sendJSON, todayString, formatDate, detectSubscriptions, buildInsights } = Ledger;

let insights = [];
let dismissed = [];
let filter = 'all';

const KINDS = {
  headsup: { label: 'Heads up', tone: 'rp-tone-bad', dot: 'var(--negative)' },
  tip:     { label: 'Tips',     tone: 'rp-tone-warn', dot: 'var(--accent)' },
  win:     { label: 'Wins',     tone: 'rp-tone-good', dot: 'var(--positive)' }
};

function whenText(date) {
  const today = todayString();
  if (date === today) return 'Today';
  return formatDate(date, { month: 'short', day: 'numeric' });
}

function card(i) {
  let extra = '';
  if (i.bar) {
    extra = `
      <div class="in-bar">
        <div class="rp-bar"><div style="width:${Math.min(100, i.bar.now)}%; background:var(--accent);"></div></div>
        <span class="in-bar-pace" style="left:${Math.min(100, i.bar.pace)}%;"></span>
      </div>
    `;
  } else if (i.spark) {
    const max = Math.max(...i.spark, 1);
    extra = `<div class="in-spark" aria-hidden="true">${i.spark.map(function(v, idx) {
      return `<span style="height:${Math.max(4, (v / max) * 100)}%; background:${idx >= i.spark.length - 3 ? 'var(--negative)' : 'var(--line)'};"></span>`;
    }).join('')}</div>`;
  }

  return `
    <article class="card in-card">
      <span class="rp-highlight-icon ${KINDS[i.kind].tone}"><i class="ti ${i.icon}" aria-hidden="true"></i></span>
      <div class="in-body">
        <div class="in-head">
          <h2>${escapeHTML(i.title)}</h2>
          <span class="text-soft rp-small">${whenText(i.date)}</span>
        </div>
        <p>${escapeHTML(i.detail)}</p>
        ${extra}
        <div class="in-actions">
          <a class="btn btn-secondary" href="${i.action.href}">${escapeHTML(i.action.label)}</a>
          <button type="button" class="in-dismiss" data-dismiss="${escapeHTML(i.key)}">Dismiss</button>
        </div>
      </div>
    </article>
  `;
}

function render() {
  const visible = insights.filter(function(i) { return !dismissed.includes(i.key); });
  const shown = visible.filter(function(i) { return filter === 'all' || i.kind === filter; });

  const badge = document.getElementById('in-badge');
  badge.hidden = visible.length === 0;
  badge.textContent = visible.length;

  const count = function(kind) {
    return visible.filter(function(i) { return kind === 'all' || i.kind === kind; }).length;
  };
  document.getElementById('in-filters').innerHTML = [['all', 'All'], ['headsup', 'Heads up'], ['win', 'Wins'], ['tip', 'Tips']]
    .map(function([id, label]) {
      return `<button type="button" class="bl-filter${filter === id ? ' is-active' : ''}" data-filter="${id}" aria-pressed="${filter === id}">${label} (${count(id)})</button>`;
    }).join('');

  document.getElementById('in-feed').innerHTML = shown.length
    ? shown.map(card).join('')
    : `<div class="card bl-empty"><p class="text-soft">${visible.length ? 'Nothing in this group.' : "You're all caught up."}</p></div>`;

  document.getElementById('in-preview').innerHTML = visible.length
    ? visible.slice(0, 3).map(function(i) {
        return `<div class="in-preview-row"><span class="sl-dot" style="background:${KINDS[i.kind].dot};"></span><span>${escapeHTML(i.title)}</span></div>`;
      }).join('')
    : '<p class="text-soft rp-small" style="margin:0;">Nothing new.</p>';

  // Dismissed ones that would still show, so you can bring them back
  const hidden = insights.filter(function(i) { return dismissed.includes(i.key); });
  document.getElementById('in-dismissed-card').hidden = hidden.length === 0;
  document.getElementById('in-dismissed').innerHTML = hidden.map(function(i) {
    return `
      <div class="rp-list-row">
        <span class="rp-small">${escapeHTML(i.title)}</span>
        <button type="button" class="btn btn-secondary bl-row-btn" data-restore="${escapeHTML(i.key)}">Bring back</button>
      </div>
    `;
  }).join('');
}

document.querySelector('.main-content').addEventListener('click', async function(event) {
  const chip = event.target.closest('[data-filter]');
  if (chip) {
    filter = chip.dataset.filter;
    render();
    return;
  }
  const dismiss = event.target.closest('[data-dismiss]');
  const restore = event.target.closest('[data-restore]');
  try {
    if (dismiss) {
      const key = dismiss.dataset.dismiss;
      dismissed.push(key); // update the page right away, save in the background
      render();
      await sendJSON('/api/insight-dismissals', 'POST', { key });
    } else if (restore) {
      const key = restore.dataset.restore;
      dismissed = dismissed.filter(function(k) { return k !== key; });
      render();
      await sendJSON(`/api/insight-dismissals/${encodeURIComponent(key)}`, 'DELETE');
    }
  } catch (error) {
    alert(error.message);
  }
});

async function init() {
  const [transactions, categories, bills, payments, accounts, paySettings, ignoredSubs, dismissedKeys] = await Promise.all([
    getJSON('/api/transactions'),
    getJSON('/api/categories'),
    getJSON('/api/bills'),
    getJSON('/api/bills/payments'),
    getJSON('/api/accounts'),
    getJSON('/api/paycheque'),
    getJSON('/api/subscription-ignores'),
    getJSON('/api/insight-dismissals')
  ]);
  dismissed = dismissedKeys;
  const subscriptions = detectSubscriptions(transactions, bills, accounts, todayString());
  insights = buildInsights({ transactions, categories, bills, payments, accounts, paySettings, subscriptions, ignoredSubs });
  render();
}

init();
