const {
  escapeHTML, formatMoney, todayString, addDays, daysBetween, formatDate, shortDate, monthYear, shiftMonth,
  getJSON, sendJSON, isSpending, isFixedCost, isSavingsTransfer, dueDatesBetween, billsBetween,
  BILL_FREQUENCIES, PAY_FREQUENCIES, paydaysBetween, currentPayPeriod
} = Ledger;

let settings = null;
let bills = [];
let payments = [];
let accounts = [];
let transactions = [];

// Bills this big (per due date) get spread across paycheques instead of
// coming out of whichever paycheque lands before them.
const BIG_BILL = 250;

function isBigBill(bill) {
  return Number(bill.amount) >= BIG_BILL;
}

function perPaycheque(bill) {
  return Number(bill.amount) * BILL_FREQUENCIES[bill.frequency].perYear / PAY_FREQUENCIES[settings.frequency].perYear;
}

// Works out the whole plan for the current pay period.
function buildPlan() {
  const today = todayString();
  const period = currentPayPeriod(settings, today);
  const pay = Number(settings.amount);

  // 1. Smaller bills due before the next payday
  const small = billsBetween(bills, transactions, payments, period.start, period.end)
    .filter(function(item) { return !isBigBill(item.bill); });
  const smallTotal = small.reduce(function(s, i) { return s + Number(i.bill.amount); }, 0);

  // 2. Big bills, a share set aside every paycheque
  const big = bills.filter(isBigBill).map(function(bill) {
    return { bill, amount: perPaycheque(bill) };
  }).sort(function(a, b) { return b.amount - a.amount; });
  const bigTotal = big.reduce(function(s, b) { return s + b.amount; }, 0);

  // 3. Savings plan, and how much has actually been moved this period
  const savings = (settings.savings_plan || []).map(function(line) {
    const account = accounts.find(function(a) { return a.id === line.accountId; });
    if (!account) return null;
    const moved = transactions.reduce(function(s, t) {
      const inPeriod = t.date >= period.start && t.date <= today;
      return inPeriod && t.category_id === account.category_id && Number(t.amount) < 0 ? s + Math.abs(Number(t.amount)) : s;
    }, 0);
    return { account, amount: Number(line.amount), moved };
  }).filter(function(line) { return line && line.amount > 0; });
  const savingsTotal = savings.reduce(function(s, l) { return s + l.amount; }, 0);

  // 4. Whatever is left is spending money
  const spending = pay - smallTotal - bigTotal - savingsTotal;
  const spent = transactions.reduce(function(s, t) {
    const inPeriod = t.date >= period.start && t.date <= today;
    return inPeriod && isSpending(t, accounts) && !isFixedCost(t, bills, accounts) ? s + Math.abs(Number(t.amount)) : s;
  }, 0);

  const totalDays = daysBetween(period.start, period.end) + 1;
  const daysGone = Math.min(totalDays, daysBetween(period.start, today) + 1);
  const daysLeft = totalDays - daysGone + 1; // today still counts

  return { today, period, pay, small, smallTotal, big, bigTotal, savings, savingsTotal, spending, spent, totalDays, daysGone, daysLeft };
}

function billTag(item, today) {
  if (item.paidOn) return { text: 'Paid', cls: 'rp-good' };
  const d = daysBetween(today, item.due);
  if (d < 0) return { text: 'Late', cls: 'rp-bad' };
  if (d === 0) return { text: 'Due today', cls: 'rp-warn' };
  return { text: `In ${d} ${d === 1 ? 'day' : 'days'}`, cls: 'text-soft' };
}

function line(name, tag, amount) {
  return `
    <div class="pc-line">
      <span class="pc-line-name">${name}</span>
      <span class="pc-line-tag ${tag ? tag.cls : ''}">${tag ? tag.text : ''}</span>
      <span class="rp-mono">${formatMoney(amount)}</span>
    </div>
  `;
}

function render() {
  const plan = buildPlan();
  const { today, period } = plan;

  document.getElementById('pc-schedule').textContent =
    `${formatMoney(plan.pay)} · ${PAY_FREQUENCIES[settings.frequency].label.toLowerCase()}`;
  document.getElementById('pc-period').textContent =
    `This paycheque · ${formatDate(period.start, { weekday: 'short', month: 'short', day: 'numeric' })} to ${formatDate(period.end, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  document.getElementById('pc-amount').textContent = formatMoney(plan.pay);
  const untilNext = daysBetween(today, period.next);
  document.getElementById('pc-next').textContent =
    `Next payday: ${formatDate(period.next, { weekday: 'long', month: 'short', day: 'numeric' })} (in ${untilNext} ${untilNext === 1 ? 'day' : 'days'})`;

  const left = plan.spending - plan.spent;
  const dailyBudget = plan.spending / plan.totalDays;
  const leftPerDay = left / plan.daysLeft;
  const expected = dailyBudget * plan.daysGone;
  const onTrack = plan.spent <= expected * 1.05;
  document.getElementById('pc-left').textContent = (left < 0 ? '−' : '') + formatMoney(left);
  document.getElementById('pc-daily').textContent = left > 0
    ? `${formatMoney(leftPerDay)} a day for ${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'} · ${onTrack ? 'on track' : 'running ahead'}`
    : 'Spending money is used up until payday';
  document.getElementById('pc-daily').className = 'pc-daily ' + (left > 0 && onTrack ? 'is-good' : 'is-warn');

  // Split bar
  const parts = [
    { label: 'Bills before payday', value: plan.smallTotal, color: 'var(--negative)' },
    { label: 'Set aside for big bills', value: plan.bigTotal, color: '#7A5A9E' },
    { label: 'Savings', value: plan.savingsTotal, color: 'var(--positive)' },
    { label: 'Spending money', value: Math.max(0, plan.spending), color: 'var(--accent)' }
  ];
  const sum = parts.reduce(function(s, p) { return s + p.value; }, 0) || 1;
  const split = document.getElementById('pc-split');
  split.innerHTML = parts.filter(function(p) { return p.value > 0; }).map(function(p) {
    return `<span style="width:${(p.value / sum) * 100}%; background:${p.color};" title="${p.label}: ${formatMoney(p.value)}"></span>`;
  }).join('');
  split.setAttribute('aria-label', 'Paycheque split: ' + parts.map(function(p) { return `${p.label} ${formatMoney(p.value)}`; }).join(', '));

  // Buckets
  const bucket = function(color, title, amount, note, lines) {
    return `
      <div class="pc-bucket">
        <div class="pc-bucket-head">
          <span><span class="pc-swatch" style="background:${color};"></span>${title}</span>
          <span class="rp-mono">${formatMoney(amount)}</span>
        </div>
        <p class="text-soft rp-small">${note}</p>
        ${lines}
      </div>
    `;
  };

  let html = bucket('var(--negative)', 'Bills before the next payday', plan.smallTotal,
    plan.small.length ? `Everything under ${formatMoney(BIG_BILL)} due ${shortDate(period.start)} to ${shortDate(period.end)}, from Bills.` : 'No smaller bills due this paycheque.',
    plan.small.map(function(i) {
      return line(`${escapeHTML(i.bill.name)} · ${shortDate(i.due)}`, billTag(i, today), Number(i.bill.amount));
    }).join(''));

  html += bucket('#7A5A9E', 'Set aside for big bills', plan.bigTotal,
    plan.big.length ? `Bills of ${formatMoney(BIG_BILL)} or more get a share from every paycheque, so no single one has to cover them.` : `No bills of ${formatMoney(BIG_BILL)} or more.`,
    plan.big.map(function(b) {
      const next = dueDatesBetween(b.bill, today, addDays(today, 400))[0];
      return line(`${escapeHTML(b.bill.name)} · ${formatMoney(Number(b.bill.amount))} ${BILL_FREQUENCIES[b.bill.frequency].label.toLowerCase()}`,
        next ? { text: 'next ' + shortDate(next), cls: 'text-soft' } : null, b.amount);
    }).join(''));

  html += bucket('var(--positive)', 'Savings goals', plan.savingsTotal,
    plan.savings.length ? 'Moved on payday, before there\'s a chance to spend it. Moving money means logging a transfer in the goal\'s category.' : 'No savings set for each payday yet. Use "Edit pay and savings" to add some.',
    plan.savings.map(function(l) {
      const done = l.moved >= l.amount - 0.005;
      return line(escapeHTML(l.account.name),
        done ? { text: 'Moved', cls: 'rp-good' } : { text: l.moved > 0 ? `${formatMoney(l.moved)} moved` : 'Not yet', cls: 'rp-warn' },
        l.amount);
    }).join(''));

  html += bucket('var(--accent)', 'Spending money', plan.spending,
    plan.spending >= 0
      ? `Whatever's left: groceries, gas, eating out. That's ${formatMoney(dailyBudget)} a day for ${plan.totalDays} days.`
      : `This plan spends ${formatMoney(plan.spending)} more than the paycheque. Lower some savings, or check your bills.`,
    '');

  document.getElementById('pc-buckets').innerHTML = html;

  // Tracker
  const spentPct = plan.spending > 0 ? Math.min(100, (plan.spent / plan.spending) * 100) : 100;
  const pacePct = (plan.daysGone / plan.totalDays) * 100;
  document.getElementById('pc-tracker').innerHTML = `
    <div class="rp-limit-top"><span class="text-soft">Spent so far (${plan.daysGone} ${plan.daysGone === 1 ? 'day' : 'days'})</span><span class="rp-mono">${formatMoney(plan.spent)} of ${formatMoney(Math.max(0, plan.spending))}</span></div>
    <div class="pc-track">
      <div class="rp-bar"><div style="width:${spentPct}%; background:var(--accent);"></div></div>
      <span class="pc-pace" style="left:${pacePct}%;" title="An even pace for today"></span>
    </div>
    <p class="rp-small" style="margin:10px 0 0;">The line marks an even pace for today. The plan allows <strong>${formatMoney(dailyBudget)} a day</strong>, and you've averaged <strong>${formatMoney(plan.spent / plan.daysGone)}</strong>.</p>
  `;

  renderPaydays(plan);
}

function renderPaydays(plan) {
  const upcoming = paydaysBetween(settings, addDays(plan.today, 1), addDays(plan.today, 120)).slice(0, 5);
  const big = bills.filter(isBigBill);

  let html = upcoming.map(function(day, i) {
    const nextDay = upcoming[i + 1] ?? addDays(day, 14);
    const covers = big.filter(function(b) {
      return dueDatesBetween(b, day, addDays(nextDay, -1)).length > 0;
    }).map(function(b) { return escapeHTML(b.name); });
    return `
      <div class="rp-list-row">
        <div>
          <p class="rp-list-name">${formatDate(day, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
          <p class="text-soft rp-small">${i === 0 ? 'Next' : ''}${i === 0 && covers.length ? ' · ' : ''}${covers.length ? 'before ' + covers.join(', ') : ''}</p>
        </div>
        <span class="rp-mono">${formatMoney(plan.pay)}</span>
      </div>
    `;
  }).join('');

  // Months with an extra payday (weekly and every-2-weeks pay)
  if (settings.frequency === 'weekly' || settings.frequency === 'biweekly') {
    const normal = settings.frequency === 'weekly' ? 4 : 2;
    const thisMonth = plan.today.slice(0, 7);
    for (let i = 0; i < 12; i++) {
      const m = shiftMonth(thisMonth, i);
      const count = paydaysBetween(settings, m + '-01', Ledger.monthEnd(m)).length;
      if (count > normal) {
        html += `<p class="pc-bonus">${monthYear(m)} has ${count} paydays, an extra ${formatMoney(plan.pay)} with no extra bills.</p>`;
        break;
      }
    }
  }
  document.getElementById('pc-paydays').innerHTML = html;
}

// ---------- settings form ----------

function openForm() {
  document.getElementById('pc-in-amount').value = settings ? Number(settings.amount) : '';
  document.getElementById('pc-in-frequency').value = settings ? settings.frequency : 'biweekly';
  document.getElementById('pc-in-anchor').value = settings ? settings.anchor_date : todayString();
  updateAnchorField();

  const plan = settings?.savings_plan || [];
  const goals = accounts.filter(function(a) { return a.kind === 'savings'; });
  document.getElementById('pc-in-plan').innerHTML = goals.length
    ? goals.map(function(a) {
        const current = plan.find(function(l) { return l.accountId === a.id; });
        return `
          <div class="pc-plan-row">
            <label for="pc-plan-${a.id}">${escapeHTML(a.name)}</label>
            <input type="number" id="pc-plan-${a.id}" data-account-id="${a.id}" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${current ? current.amount : ''}" />
          </div>
        `;
      }).join('')
    : '<p class="text-soft rp-small" style="margin:0;">Add savings goals on the Savings page to plan them here.</p>';

  document.getElementById('pc-form-error').textContent = '';
  document.getElementById('pc-modal').hidden = false;
  document.getElementById('pc-in-amount').focus();
}

// "15th and last day" doesn't need a payday picked
function updateAnchorField() {
  document.getElementById('pc-in-anchor-wrap').hidden = document.getElementById('pc-in-frequency').value === 'semimonthly';
}

function closeForm() {
  document.getElementById('pc-modal').hidden = true;
}

document.getElementById('pc-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const frequency = document.getElementById('pc-in-frequency').value;
  const savingsPlan = [...document.querySelectorAll('#pc-in-plan input')]
    .filter(function(input) { return input.value !== '' && Number(input.value) > 0; })
    .map(function(input) { return { accountId: Number(input.dataset.accountId), amount: Number(input.value) }; });

  try {
    settings = await sendJSON('/api/paycheque', 'PUT', {
      amount: document.getElementById('pc-in-amount').value,
      frequency,
      anchorDate: frequency === 'semimonthly' ? todayString().slice(0, 7) + '-15' : document.getElementById('pc-in-anchor').value,
      savingsPlan
    });
    closeForm();
    show();
  } catch (error) {
    document.getElementById('pc-form-error').textContent = error.message;
  }
});

document.getElementById('pc-in-frequency').addEventListener('change', updateAnchorField);
document.getElementById('pc-setup-btn').addEventListener('click', openForm);
document.getElementById('pc-edit-btn').addEventListener('click', openForm);
document.getElementById('pc-cancel-btn').addEventListener('click', closeForm);
document.getElementById('pc-modal').addEventListener('click', function(event) {
  if (event.target === this) closeForm();
});
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !document.getElementById('pc-modal').hidden) closeForm();
});

// ---------- loading ----------

function show() {
  document.getElementById('pc-setup').hidden = settings !== null;
  document.getElementById('pc-body').hidden = settings === null;
  if (settings) {
    render();
  }
}

async function init() {
  [settings, bills, payments, accounts, transactions] = await Promise.all([
    getJSON('/api/paycheque'),
    getJSON('/api/bills'),
    getJSON('/api/bills/payments'),
    getJSON('/api/accounts'),
    getJSON('/api/transactions')
  ]);
  show();
}

init();
