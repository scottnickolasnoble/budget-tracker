const { escapeHTML, formatMoney, todayString, daysBetween, formatDate, getJSON, sendJSON, findCategory, detectSubscriptions } = Ledger;

let transactions = [];
let categories = [];
let bills = [];
let accounts = [];
let ignored = [];
let showIgnored = false;

function render() {
  const today = todayString();
  const all = detectSubscriptions(transactions, bills, accounts, today);
  const active = all.filter(function(s) { return !ignored.includes(s.key); });
  const untracked = active.filter(function(s) { return !s.tracked; });
  const recentChanges = active.filter(function(s) {
    return s.priceChange && daysBetween(s.priceChange.on, today) <= 90;
  });

  const yearly = active.reduce(function(sum, s) { return sum + s.yearly; }, 0);
  const untrackedYearly = untracked.reduce(function(sum, s) { return sum + s.yearly; }, 0);

  const change = recentChanges[0];
  const tiles = [
    { label: 'Subscriptions found', value: formatMoney(yearly / 12) + '<span class="mp-unit"> /mo</span>', note: `${active.length} found · ${formatMoney(yearly)} a year` },
    { label: 'Not tracked as bills', value: String(untracked.length), note: `${formatMoney(untrackedYearly)} a year you might not be watching`, cls: untracked.length ? 'rp-bad' : '' },
    {
      label: 'Price changes',
      value: String(recentChanges.length),
      note: change
        ? `${escapeHTML(change.name)} went ${change.amount > change.priceChange.from ? 'up' : 'down'} ${formatMoney(change.amount - change.priceChange.from)} on ${formatDate(change.priceChange.on, { month: 'short', day: 'numeric' })}`
        : 'None in the last 90 days',
      cls: recentChanges.length ? 'rp-warn' : ''
    }
  ];
  document.getElementById('sb-stats').innerHTML = tiles.map(function(t) {
    return `<div class="card"><p class="rp-stat-label">${t.label}</p><p class="rp-stat-value ${t.cls ?? ''}">${t.value}</p><p class="rp-stat-note text-soft">${t.note}</p></div>`;
  }).join('');

  // Cards for the ones that aren't bills yet
  document.getElementById('sb-new-section').hidden = untracked.length === 0;
  document.getElementById('sb-new').innerHTML = untracked.map(function(s) {
    const category = findCategory(categories, s.categoryId);
    return `
      <article class="card mp-card">
        <div class="mp-card-top">
          <h2 class="mp-small-title">${escapeHTML(s.name)}</h2>
          <span class="mp-price">${formatMoney(s.amount)}</span>
        </div>
        <p class="text-soft rp-small" style="margin:0;">${s.frequency.label} · seen ${s.count} times · last ${formatDate(s.lastDate, { month: 'short', day: 'numeric' })}${category ? ' · ' + escapeHTML(category.name) : ''}</p>
        <p class="rp-small" style="margin:0;"><strong>${formatMoney(s.yearly)} a year</strong></p>
        <div class="mp-actions">
          <button type="button" class="btn btn-primary" data-action="make-bill" data-key="${escapeHTML(s.key)}">Make it a bill</button>
          <button type="button" class="btn btn-secondary" data-action="ignore" data-key="${escapeHTML(s.key)}">Not a subscription</button>
        </div>
      </article>
    `;
  }).join('');

  // Table of everything
  document.getElementById('sb-table').innerHTML = active.length
    ? active.map(function(s) {
        const category = findCategory(categories, s.categoryId);
        const note = s.priceChange
          ? `<span class="rp-table-note rp-warn">${s.amount > s.priceChange.from ? 'Up' : 'Down'} from ${formatMoney(s.priceChange.from)} on ${formatDate(s.priceChange.on, { month: 'short', day: 'numeric' })}</span>`
          : `<span class="rp-table-note">${escapeHTML(category?.name ?? 'Uncategorized')}</span>`;
        return `
          <tr>
            <td data-label="Name"><strong>${escapeHTML(s.name)}</strong>${note}</td>
            <td data-label="How often" class="text-soft">${s.frequency.label}</td>
            <td data-label="Amount" class="rp-num rp-mono">${formatMoney(s.amount)}</td>
            <td data-label="Per year" class="rp-num rp-mono"><strong>${formatMoney(s.yearly)}</strong></td>
            <td data-label="Last charged" class="text-soft">${formatDate(s.lastDate, { month: 'short', day: 'numeric' })}</td>
            <td data-label="Status"><span class="bl-chip ${s.tracked ? 'bl-chip-paid' : 'bl-chip-late'}">${s.tracked ? 'Tracked as a bill' : 'Not a bill'}</span></td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="6" class="text-soft">No repeating charges found yet. Ledger needs to see a charge at least 3 times (twice for yearly ones).</td></tr>';

  document.getElementById('sb-table-foot').innerHTML = active.length
    ? `<tr><td colspan="3"><strong>Total</strong></td><td class="rp-num rp-mono"><strong>${formatMoney(yearly)}</strong></td><td colspan="2"></td></tr>`
    : '';

  renderIgnored(all);
}

function renderIgnored(all) {
  const hidden = all.filter(function(s) { return ignored.includes(s.key); });
  document.getElementById('sb-ignored-section').hidden = hidden.length === 0;
  if (hidden.length === 0) {
    return;
  }
  const toggle = document.getElementById('sb-ignored-toggle');
  toggle.setAttribute('aria-expanded', String(showIgnored));
  toggle.innerHTML = `<span>Marked as not a subscription <span class="text-soft">· ${hidden.length}</span></span><i class="ti ${showIgnored ? 'ti-chevron-up' : 'ti-chevron-down'}" aria-hidden="true"></i>`;
  const list = document.getElementById('sb-ignored');
  list.hidden = !showIgnored;
  list.innerHTML = hidden.map(function(s) {
    return `
      <div class="bl-row">
        <div class="bl-row-main">
          <p class="bl-row-name">${escapeHTML(s.name)}</p>
          <p class="bl-row-meta">${formatMoney(s.amount)} · ${s.frequency.label.toLowerCase()}</p>
        </div>
        <button type="button" class="btn btn-secondary bl-row-btn" data-action="unignore" data-key="${escapeHTML(s.key)}">Show again</button>
      </div>
    `;
  }).join('');
}

// Creates a bill from a detected subscription, due on its next expected date.
async function makeBill(key) {
  const s = detectSubscriptions(transactions, bills, accounts, todayString()).find(function(x) { return x.key === key; });
  if (!s) return;
  await sendJSON('/api/bills', 'POST', {
    name: s.name.slice(0, 60),
    categoryId: s.categoryId,
    amount: s.amount,
    frequency: s.frequency.id,
    anchorDate: s.nextDate,
    autopay: true,
    amountVaries: false
  });
  bills = await getJSON('/api/bills');
}

document.querySelector('.main-content').addEventListener('click', async function(event) {
  if (event.target.closest('#sb-ignored-toggle')) {
    showIgnored = !showIgnored;
    render();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const key = button.dataset.key;
  button.disabled = true;
  try {
    if (button.dataset.action === 'make-bill') {
      await makeBill(key);
    } else if (button.dataset.action === 'ignore') {
      await sendJSON('/api/subscription-ignores', 'POST', { key });
      ignored.push(key);
    } else if (button.dataset.action === 'unignore') {
      await sendJSON(`/api/subscription-ignores/${encodeURIComponent(key)}`, 'DELETE');
      ignored = ignored.filter(function(k) { return k !== key; });
    }
    render();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
});

async function init() {
  [transactions, categories, bills, accounts, ignored] = await Promise.all([
    getJSON('/api/transactions'),
    getJSON('/api/categories'),
    getJSON('/api/bills'),
    getJSON('/api/accounts'),
    getJSON('/api/subscription-ignores')
  ]);
  render();
}

init();
