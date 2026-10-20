const { escapeHTML, formatMoney, todayString, addDays, daysBetween, formatDate, getJSON, sendJSON, accountBalance } = Ledger;

let items = [];
let accounts = [];
let transactions = [];
let filter = 'all';
let showHistory = false;
let editingId = null;

const TINTS = ['#E4ECE5', '#E3E9F2', '#F6EBDD', '#F4E4E0', '#EDE6F2'];

// Works out where an item stands today.
function describe(item) {
  const today = todayString();
  const price = Number(item.price);
  const readyOn = addDays(item.added_on, item.wait_days);
  const daysLeft = daysBetween(today, readyOn);
  const account = accounts.find(function(a) { return a.id === item.account_id; });
  const saved = account ? (accountBalance(account, transactions, today) ?? 0) : null;

  if (daysLeft > 0) {
    return {
      group: 'cooling',
      status: 'Cooling off',
      chip: 'bl-chip-soon',
      detail: `Ready in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} (${formatDate(readyOn, { month: 'short', day: 'numeric' })})`,
      pct: item.wait_days ? ((item.wait_days - daysLeft) / item.wait_days) * 100 : 100,
      bar: 'var(--accent)',
      account, saved
    };
  }
  if (account && saved < price) {
    return {
      group: 'saving',
      status: 'Saving up',
      chip: 'bl-chip-saving',
      detail: `${formatMoney(saved)} of ${formatMoney(price)} saved in ${escapeHTML(account.name)}`,
      pct: (saved / price) * 100,
      bar: '#4A6FA5',
      account, saved
    };
  }
  return {
    group: 'ready',
    status: 'Ready to buy',
    chip: 'bl-chip-paid',
    detail: item.wait_days ? `Waited ${daysBetween(item.added_on, today)} days` : 'No wait set',
    pct: 100,
    bar: 'var(--positive)',
    account, saved
  };
}

function renderStats(active) {
  const year = todayString().slice(0, 4);
  const onList = active.reduce(function(s, i) { return s + Number(i.price); }, 0);
  const ready = active.filter(function(i) { return describe(i).group === 'ready'; });
  const readyTotal = ready.reduce(function(s, i) { return s + Number(i.price); }, 0);

  // Each linked savings goal counted once, even if several items use it
  const goalIds = [...new Set(active.map(function(i) { return i.account_id; }).filter(Boolean))];
  const savedToward = goalIds.reduce(function(s, id) {
    const account = accounts.find(function(a) { return a.id === id; });
    return s + (account ? (accountBalance(account, transactions, todayString()) ?? 0) : 0);
  }, 0);

  const skipped = items.filter(function(i) { return i.status === 'skipped' && (i.closed_on ?? '').startsWith(year); });
  const skippedTotal = skipped.reduce(function(s, i) { return s + Number(i.price); }, 0);

  const tiles = [
    { label: 'On the list', value: formatMoney(onList), note: `${active.length} ${active.length === 1 ? 'item' : 'items'}` },
    { label: 'Ready to buy', value: formatMoney(readyTotal), note: `${ready.length} ${ready.length === 1 ? 'item has' : 'items have'} waited long enough`, cls: 'rp-good' },
    { label: 'Saved toward items', value: formatMoney(savedToward), note: `across ${goalIds.length} savings ${goalIds.length === 1 ? 'goal' : 'goals'}` },
    { label: 'Changed your mind', value: formatMoney(skippedTotal), note: `not spent on ${skipped.length} ${skipped.length === 1 ? 'item' : 'items'} this year`, cls: 'rp-good' }
  ];
  document.getElementById('wl-stats').innerHTML = tiles.map(function(t) {
    return `<div class="card"><p class="rp-stat-label">${t.label}</p><p class="rp-stat-value ${t.cls ?? ''}">${t.value}</p><p class="rp-stat-note text-soft">${t.note}</p></div>`;
  }).join('');
}

function renderFilters(active) {
  const count = function(group) {
    return active.filter(function(i) { return describe(i).group === group; }).length;
  };
  const chips = [
    ['all', `All ${active.length}`],
    ['ready', `Ready (${count('ready')})`],
    ['cooling', `Cooling off (${count('cooling')})`],
    ['saving', `Saving up (${count('saving')})`]
  ];
  document.getElementById('wl-filters').innerHTML = chips.map(function([id, label]) {
    return `<button type="button" class="bl-filter${filter === id ? ' is-active' : ''}" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`;
  }).join('');
}

function itemCard(item, index) {
  const d = describe(item);
  const meta = [item.priority === 'need' ? 'Need' : 'Want', `added ${formatDate(item.added_on, { month: 'short', day: 'numeric' })}`];
  let primary;
  if (d.group === 'ready') {
    primary = `<button type="button" class="btn btn-primary" data-action="bought" data-id="${item.id}">I bought it</button>`;
  } else if (d.group === 'saving') {
    primary = `<a class="btn btn-secondary" href="savings.html">Add money</a>`;
  } else {
    primary = `<button type="button" class="btn btn-secondary" data-action="edit" data-id="${item.id}">Edit</button>`;
  }

  return `
    <article class="card mp-card">
      <div class="mp-card-top">
        <div class="mp-card-title">
          <span class="mp-initial" style="background:${TINTS[index % TINTS.length]};">${escapeHTML(item.name.charAt(0).toUpperCase())}</span>
          <div>
            <h2>${escapeHTML(item.name)}</h2>
            <p class="text-soft">${meta.join(' · ')}</p>
          </div>
        </div>
        <span class="mp-price">${formatMoney(Number(item.price))}</span>
      </div>
      ${item.note ? `<p class="mp-note">${escapeHTML(item.note)}</p>` : ''}
      <div class="mp-status">
        <span class="bl-chip ${d.chip}">${d.status}</span>
        <span class="text-soft">${d.detail}</span>
      </div>
      <div class="rp-bar mp-bar"><div style="width:${Math.min(100, d.pct)}%; background:${d.bar};"></div></div>
      <div class="mp-actions">
        ${primary}
        <button type="button" class="btn btn-secondary" data-action="skip" data-id="${item.id}">Changed my mind</button>
      </div>
    </article>
  `;
}

function renderHistory() {
  const closed = items.filter(function(i) { return i.status !== 'active'; })
    .sort(function(a, b) { return (b.closed_on ?? '') < (a.closed_on ?? '') ? -1 : 1; });
  document.getElementById('wl-history-section').hidden = closed.length === 0;
  if (closed.length === 0) {
    return;
  }
  const toggle = document.getElementById('wl-history-toggle');
  toggle.setAttribute('aria-expanded', String(showHistory));
  toggle.innerHTML = `<span>Bought and skipped <span class="text-soft">· ${closed.length}</span></span><i class="ti ${showHistory ? 'ti-chevron-up' : 'ti-chevron-down'}" aria-hidden="true"></i>`;

  const list = document.getElementById('wl-history');
  list.hidden = !showHistory;
  list.innerHTML = closed.map(function(i) {
    const bought = i.status === 'bought';
    return `
      <div class="bl-row">
        <div class="bl-row-main">
          <p class="bl-row-name">${escapeHTML(i.name)}</p>
          <p class="bl-row-meta">${bought ? 'Bought' : 'Changed my mind'}${i.closed_on ? ' · ' + formatDate(i.closed_on, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</p>
        </div>
        <div class="bl-row-end">
          <span class="bl-row-amount">${formatMoney(Number(i.price))}</span>
          <span class="bl-chip ${bought ? 'bl-chip-later' : 'bl-chip-paid'}">${bought ? 'Bought' : 'Not spent'}</span>
        </div>
        <button type="button" class="btn btn-secondary bl-row-btn" data-action="restore" data-id="${i.id}">Put back</button>
      </div>
    `;
  }).join('');
}

function render() {
  const active = items.filter(function(i) { return i.status === 'active'; });
  renderStats(active);
  renderFilters(active);

  const shown = active
    .filter(function(i) { return filter === 'all' || describe(i).group === filter; })
    .sort(function(a, b) {
      const order = { ready: 0, saving: 1, cooling: 2 };
      return order[describe(a).group] - order[describe(b).group];
    });

  document.getElementById('wl-items').innerHTML = active.length === 0
    ? '<div class="card bl-empty"><p class="text-soft">Nothing on your wishlist yet. Add the next thing you\'re tempted to buy, and let it wait a bit.</p></div>'
    : shown.length === 0
      ? '<div class="card bl-empty"><p class="text-soft">Nothing here right now.</p></div>'
      : shown.map(itemCard).join('');

  renderHistory();
}

// ---------- saving changes ----------

function bodyFor(item, changes) {
  return Object.assign({
    name: item.name,
    price: item.price,
    priority: item.priority,
    waitDays: item.wait_days,
    accountId: item.account_id,
    note: item.note,
    status: item.status
  }, changes);
}

async function updateItem(id, changes) {
  const item = items.find(function(i) { return i.id === id; });
  try {
    await sendJSON(`/api/wishlist/${id}`, 'PATCH', bodyFor(item, changes));
    await loadItems();
    render();
  } catch (error) {
    alert(error.message);
  }
}

function openForm(item) {
  editingId = item ? item.id : null;
  document.getElementById('wl-modal-title').textContent = item ? 'Edit item' : 'Add to wishlist';
  document.getElementById('wl-name').value = item ? item.name : '';
  document.getElementById('wl-price').value = item ? Number(item.price) : '';
  document.getElementById('wl-priority').value = item ? item.priority : 'want';
  document.getElementById('wl-wait').value = String(item ? item.wait_days : 30);
  document.getElementById('wl-note').value = item?.note ?? '';
  // If an item has an unusual wait (e.g. 45 days), add it as an option
  const wait = document.getElementById('wl-wait');
  if (item && ![...wait.options].some(function(o) { return o.value === String(item.wait_days); })) {
    wait.insertAdjacentHTML('beforeend', `<option value="${item.wait_days}">${item.wait_days} days</option>`);
    wait.value = String(item.wait_days);
  }

  const goals = accounts.filter(function(a) { return a.kind === 'savings'; });
  document.getElementById('wl-account').innerHTML = '<option value="">Not saving up for it</option>'
    + goals.map(function(a) {
        return `<option value="${a.id}"${item && item.account_id === a.id ? ' selected' : ''}>${escapeHTML(a.name)}</option>`;
      }).join('');

  document.getElementById('wl-delete-btn').hidden = !item;
  document.getElementById('wl-form-error').textContent = '';
  document.getElementById('wl-modal').hidden = false;
  document.getElementById('wl-name').focus();
}

function closeForm() {
  document.getElementById('wl-modal').hidden = true;
  editingId = null;
}

document.getElementById('wl-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const existing = items.find(function(i) { return i.id === editingId; });
  const body = {
    name: document.getElementById('wl-name').value,
    price: document.getElementById('wl-price').value,
    priority: document.getElementById('wl-priority').value,
    waitDays: Number(document.getElementById('wl-wait').value),
    accountId: document.getElementById('wl-account').value || null,
    note: document.getElementById('wl-note').value,
    status: existing ? existing.status : 'active'
  };
  try {
    await sendJSON(editingId === null ? '/api/wishlist' : `/api/wishlist/${editingId}`, editingId === null ? 'POST' : 'PATCH', body);
    closeForm();
    await loadItems();
    render();
  } catch (error) {
    document.getElementById('wl-form-error').textContent = error.message;
  }
});

document.getElementById('wl-delete-btn').addEventListener('click', async function() {
  const item = items.find(function(i) { return i.id === editingId; });
  if (!item || !confirm(`Delete "${item.name}" from your wishlist?`)) {
    return;
  }
  try {
    await sendJSON(`/api/wishlist/${editingId}`, 'DELETE');
    closeForm();
    await loadItems();
    render();
  } catch (error) {
    document.getElementById('wl-form-error').textContent = error.message;
  }
});

// ---------- events ----------

document.getElementById('wl-add-btn').addEventListener('click', function() { openForm(null); });
document.getElementById('wl-cancel-btn').addEventListener('click', closeForm);
document.getElementById('wl-modal').addEventListener('click', function(event) {
  if (event.target === this) closeForm();
});
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !document.getElementById('wl-modal').hidden) closeForm();
});

document.getElementById('wl-history-toggle').addEventListener('click', function() {
  showHistory = !showHistory;
  renderHistory();
});

document.querySelector('.main-content').addEventListener('click', function(event) {
  const chip = event.target.closest('[data-filter]');
  if (chip) {
    filter = chip.dataset.filter;
    render();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) {
    return;
  }
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  if (action === 'edit') {
    openForm(items.find(function(i) { return i.id === id; }));
  } else if (action === 'bought') {
    updateItem(id, { status: 'bought' });
  } else if (action === 'skip') {
    updateItem(id, { status: 'skipped' });
  } else if (action === 'restore') {
    updateItem(id, { status: 'active' });
  }
});

// ---------- loading ----------

async function loadItems() {
  items = await getJSON('/api/wishlist');
}

async function init() {
  [items, accounts, transactions] = await Promise.all([
    getJSON('/api/wishlist'),
    getJSON('/api/accounts'),
    getJSON('/api/transactions')
  ]);
  render();
}

init();
