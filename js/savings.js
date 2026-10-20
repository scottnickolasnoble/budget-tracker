let accounts = [];
let categories = [];
let editingId = null; // null = adding a new one

// ---------- small helpers ----------

function escapeHTML(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(amount) {
  return '$' + Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// How many months since a 'YYYY-MM-DD' date. Never less than 1, so a goal
// you started last week doesn't divide by zero.
function monthsSince(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const now = new Date();
  const months = (now.getFullYear() - year) * 12 + (now.getMonth() - (month - 1)) + (now.getDate() - day) / 30;
  return Math.max(1, months);
}

// 7.2 -> "May 2027" (the month that's 8 months from now)
function monthFromNow(monthsAhead) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + Math.ceil(monthsAhead));
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Standard loan payoff formula. With interest, each month's payment first
// covers that month's interest, so it takes longer than balance / payment.
function loanPayoff(balance, ratePercent, payment) {
  if (balance <= 0) {
    return 'Paid off';
  }
  if (!payment || payment <= 0) {
    return '—';
  }
  const monthlyRate = (ratePercent ?? 0) / 100 / 12;
  if (monthlyRate === 0) {
    return monthFromNow(balance / payment);
  }
  if (payment <= balance * monthlyRate) {
    return 'Payment too low';
  }
  const months = -Math.log(1 - (monthlyRate * balance) / payment) / Math.log(1 + monthlyRate);
  return monthFromNow(months);
}

// Turns one row from the API into everything a card needs.
// pg sends NUMERIC columns as strings, hence all the Number().
function describe(account) {
  const target = Number(account.target_amount);
  const starting = Number(account.starting_balance);
  const contributed = Number(account.contributed);
  const thisMonth = Number(account.contributed_this_month);
  const monthlyAvg = contributed / monthsSince(account.start_date);
  const rate = account.interest_rate === null ? null : Number(account.interest_rate);
  const payment = account.monthly_payment === null ? null : Number(account.monthly_payment);

  if (account.kind === 'savings') {
    const current = Math.max(0, starting + contributed);
    const remaining = target - current;
    let eta;
    if (remaining <= 0) {
      eta = 'Goal reached';
    } else if (monthlyAvg <= 0) {
      eta = 'Add money to see an estimate';
    } else {
      eta = 'Done by ' + monthFromNow(remaining / monthlyAvg);
    }
    return { current, target, thisMonth, monthlyAvg, eta, pct: Math.min(100, (current / target) * 100) };
  }

  const current = Math.max(0, starting - contributed);
  return {
    current,
    target,
    thisMonth,
    rate,
    payment,
    payoff: loanPayoff(current, rate, payment ?? monthlyAvg),
    pct: Math.min(100, Math.max(0, ((target - current) / target) * 100))
  };
}

// ---------- rendering ----------

function categoryPill(account) {
  return `<span class="sl-pill"><span class="sl-dot" style="background:${escapeHTML(account.category_color)};"></span>${escapeHTML(account.category_name)}</span>`;
}

function cardTop(account) {
  return `
    <div class="sl-card-top">
      <h3 class="sl-card-name">${escapeHTML(account.name)}</h3>
      <button type="button" class="sl-edit-btn" data-id="${account.id}" aria-label="Edit ${escapeHTML(account.name)}">
        <i class="ti ti-pencil" aria-hidden="true"></i>
      </button>
    </div>
    ${categoryPill(account)}
  `;
}

function savingsCard(account) {
  const d = describe(account);
  return `
    <article class="card sl-card">
      ${cardTop(account)}
      <p class="sl-amount">${formatMoney(d.current)} <span class="sl-of">of ${formatMoney(d.target)}</span></p>
      <div class="sl-bar"><div class="sl-bar-fill" style="width:${d.pct}%; background:${escapeHTML(account.category_color)};"></div></div>
      <div class="sl-card-foot">
        <span><strong>${Math.floor(d.pct)}%</strong> · ${formatMoney(Math.max(0, d.monthlyAvg))}/mo avg</span>
        <span>${d.eta}</span>
      </div>
    </article>
  `;
}

function loanCard(account) {
  const d = describe(account);
  return `
    <article class="card sl-card">
      ${cardTop(account)}
      <p class="sl-amount sl-negative">${formatMoney(d.current)} <span class="sl-of">left of ${formatMoney(d.target)}</span></p>
      <div class="sl-bar"><div class="sl-bar-fill" style="width:${d.pct}%; background:${escapeHTML(account.category_color)};"></div></div>
      <div class="sl-loan-stats">
        <div><p>Paid off</p><p>${Math.floor(d.pct)}%</p></div>
        <div><p>Rate</p><p>${d.rate === null ? '—' : d.rate.toFixed(2) + '%'}</p></div>
        <div><p>Payoff est.</p><p>${d.payoff}</p></div>
      </div>
    </article>
  `;
}

function emptyCard(text, buttonId, buttonText) {
  return `
    <div class="card sl-empty">
      <p class="text-soft">${text}</p>
      <button type="button" class="btn btn-secondary" data-opens="${buttonId}">${buttonText}</button>
    </div>
  `;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function render() {
  const savings = accounts.filter(function(a) { return a.kind === 'savings'; });
  const loans = accounts.filter(function(a) { return a.kind === 'loan'; });

  let totalSaved = 0;
  let addedThisMonth = 0;
  savings.forEach(function(a) {
    const d = describe(a);
    totalSaved += d.current;
    addedThisMonth += d.thisMonth;
  });

  let totalOwed = 0;
  let paidThisMonth = 0;
  loans.forEach(function(a) {
    const d = describe(a);
    totalOwed += d.current;
    paidThisMonth += d.thisMonth;
  });

  const net = totalSaved - totalOwed;
  document.getElementById('sl-total-saved').textContent = formatMoney(totalSaved);
  document.getElementById('sl-total-owed').textContent = formatMoney(totalOwed);
  document.getElementById('sl-net').textContent = (net < 0 ? '−' : '') + formatMoney(net);
  document.getElementById('sl-saved-note').textContent = `${addedThisMonth < 0 ? '−' : '+'}${formatMoney(addedThisMonth)} this month`;
  document.getElementById('sl-owed-note').textContent = `${formatMoney(Math.max(0, paidThisMonth))} paid down this month`;

  document.getElementById('sl-savings-count').textContent = savings.length ? plural(savings.length, 'goal') : '';
  document.getElementById('sl-loans-count').textContent = loans.length ? plural(loans.length, 'loan') : '';

  document.getElementById('sl-savings-grid').innerHTML = savings.length
    ? savings.map(savingsCard).join('')
    : emptyCard('No savings goals yet.', 'add-savings-btn', '+ Add savings goal');

  document.getElementById('sl-loans-grid').innerHTML = loans.length
    ? loans.map(loanCard).join('')
    : emptyCard('No loans yet.', 'add-loan-btn', '+ Add loan');
}

// ---------- the add / edit form ----------

function selectedKind() {
  return document.querySelector('input[name="sl-kind"]:checked').value;
}

// Swaps labels and shows/hides loan-only fields for the chosen type.
function updateFormForKind() {
  const isLoan = selectedKind() === 'loan';
  document.getElementById('sl-target-label').textContent = isLoan ? 'Original loan amount' : 'Goal amount';
  document.getElementById('sl-starting-label').textContent = isLoan ? 'Balance owed' : 'Already saved';
  document.getElementById('sl-loan-fields').hidden = !isLoan;
  document.getElementById('sl-category-hint').textContent = isLoan
    ? 'Every expense in this category counts as a payment and lowers the balance.'
    : 'Every expense in this category counts as money put into this goal.';

  const editing = editingId !== null;
  document.getElementById('sl-modal-title').textContent =
    (editing ? 'Edit ' : 'Add ') + (isLoan ? 'loan' : 'savings goal');
}

function fillCategoryOptions(selectedId) {
  const select = document.getElementById('sl-category');
  select.innerHTML = '<option value="">Choose a category</option>' + categories.map(function(category) {
    const selected = category.id === selectedId ? ' selected' : '';
    return `<option value="${category.id}"${selected}>${escapeHTML(category.name)}</option>`;
  }).join('');
}

function openForm(account, kind) {
  editingId = account ? account.id : null;
  const chosenKind = account ? account.kind : kind;
  document.querySelector(`input[name="sl-kind"][value="${chosenKind}"]`).checked = true;

  fillCategoryOptions(account ? account.category_id : null);
  document.getElementById('sl-name').value = account ? account.name : '';
  document.getElementById('sl-target').value = account ? Number(account.target_amount) : '';
  document.getElementById('sl-starting').value = account ? Number(account.starting_balance) : '';
  document.getElementById('sl-start-date').value = account ? account.start_date : todayString();
  document.getElementById('sl-rate').value = account?.interest_rate ?? '';
  document.getElementById('sl-payment').value = account?.monthly_payment ?? '';
  document.getElementById('sl-form-error').textContent = categories.length === 0
    ? 'Create a category first on the Categories page.'
    : '';
  document.getElementById('sl-delete-btn').hidden = !account;

  updateFormForKind();
  document.getElementById('sl-modal').hidden = false;
  document.getElementById('sl-name').focus();
}

function closeForm() {
  document.getElementById('sl-modal').hidden = true;
  editingId = null;
}

async function saveForm(event) {
  event.preventDefault();
  const errorBox = document.getElementById('sl-form-error');
  errorBox.textContent = '';

  const body = {
    kind: selectedKind(),
    name: document.getElementById('sl-name').value,
    categoryId: document.getElementById('sl-category').value,
    targetAmount: document.getElementById('sl-target').value,
    startingBalance: document.getElementById('sl-starting').value || 0,
    startDate: document.getElementById('sl-start-date').value,
    interestRate: document.getElementById('sl-rate').value,
    monthlyPayment: document.getElementById('sl-payment').value
  };

  const url = editingId === null ? '/api/accounts' : `/api/accounts/${editingId}`;
  const response = await fetch(url, {
    method: editingId === null ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await response.json().catch(function() { return {}; });
    errorBox.textContent = data.error ?? 'Something went wrong. Try again.';
    return;
  }

  closeForm();
  await loadAccounts();
  render();
}

async function deleteAccount() {
  const account = accounts.find(function(a) { return a.id === editingId; });
  if (!account || !confirm(`Delete "${account.name}"? Your transactions stay, only this tracker is removed.`)) {
    return;
  }
  const response = await fetch(`/api/accounts/${editingId}`, { method: 'DELETE' });
  if (!response.ok) {
    document.getElementById('sl-form-error').textContent = 'Could not delete. Try again.';
    return;
  }
  closeForm();
  await loadAccounts();
  render();
}

// ---------- events ----------

document.getElementById('add-savings-btn').addEventListener('click', function() { openForm(null, 'savings'); });
document.getElementById('add-loan-btn').addEventListener('click', function() { openForm(null, 'loan'); });

// One listener for every card's edit button and the empty-state buttons.
document.querySelector('.main-content').addEventListener('click', function(event) {
  const editButton = event.target.closest('.sl-edit-btn');
  if (editButton) {
    const account = accounts.find(function(a) { return a.id === Number(editButton.dataset.id); });
    openForm(account);
    return;
  }
  const opener = event.target.closest('[data-opens]');
  if (opener) {
    document.getElementById(opener.dataset.opens).click();
  }
});

document.querySelectorAll('input[name="sl-kind"]').forEach(function(radio) {
  radio.addEventListener('change', updateFormForKind);
});
document.getElementById('sl-form').addEventListener('submit', saveForm);
document.getElementById('sl-cancel-btn').addEventListener('click', closeForm);
document.getElementById('sl-delete-btn').addEventListener('click', deleteAccount);

// Click the dark area outside the form, or press Escape, to close it.
document.getElementById('sl-modal').addEventListener('click', function(event) {
  if (event.target === this) {
    closeForm();
  }
});
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !document.getElementById('sl-modal').hidden) {
    closeForm();
  }
});

// ---------- loading ----------

async function loadAccounts() {
  const response = await fetch('/api/accounts');
  if (response.status === 401) {
    window.location.href = 'login.html';
    return;
  }
  accounts = await response.json();
}

async function loadCategories() {
  const response = await fetch('/api/categories');
  if (response.status === 401) {
    window.location.href = 'login.html';
    return;
  }
  categories = await response.json();
}

async function init() {
  await Promise.all([loadAccounts(), loadCategories()]);
  render();
}

init();
