const {
  escapeHTML, formatMoney, todayString, addDays, daysBetween, formatDate, shortDate, monthYear, shiftMonth,
  getJSON, sendJSON, isSpending, isFixedCost, isSavingsTransfer, dueDatesBetween, billsBetween,
  BILL_FREQUENCIES, PAY_FREQUENCIES, paydaysBetween, currentPayPeriod, paychequeDeposit, estimatePaycheque
} = Ledger;

let settings = null;
let categories = [];
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

// The pay period that starts on a given payday
function periodFor(payday) {
  const next = paydaysBetween(settings, addDays(payday, 1), addDays(payday, 40))[0];
  return { start: payday, next, end: addDays(next, -1) };
}

// Works out the whole plan for one pay period: past, current or upcoming.
function buildPlan(period) {
  const today = todayString();
  const status = period.start > today ? 'upcoming' : period.end < today ? 'past' : 'current';
  // Count transactions up to today, or to the end of a finished period
  const asOf = status === 'past' ? period.end : today;

  // This paycheque: the real deposit if it's logged, otherwise an estimate
  const usual = estimatePaycheque(settings, transactions, period.start);
  const deposit = paychequeDeposit(settings, transactions, period.start);
  const pay = deposit ? deposit.amount : usual.amount;
  const payInfo = deposit
    ? { source: 'actual', date: deposit.date, difference: usual.source === 'estimate' ? deposit.amount - usual.amount : 0 }
    : { source: usual.source, count: usual.count, difference: 0 };

  // 1. Smaller bills due before the next payday
  const small = billsBetween(bills, transactions, payments, period.start, period.end)
    .filter(function(item) { return !isBigBill(item.bill); });
  const smallTotal = small.reduce(function(s, i) { return s + Number(i.bill.amount); }, 0);

  // 2. Big bills, a share set aside every paycheque
  const big = bills.filter(isBigBill).map(function(bill) {
    return { bill, amount: perPaycheque(bill) };
  }).sort(function(a, b) { return b.amount - a.amount; });
  const bigTotal = big.reduce(function(s, b) { return s + b.amount; }, 0);

  // 3. Savings plan, and how much was actually moved during the period
  const savings = (settings.savings_plan || []).map(function(line) {
    const account = accounts.find(function(a) { return a.id === line.accountId; });
    if (!account) return null;
    const moved = transactions.reduce(function(s, t) {
      const inPeriod = t.date >= period.start && t.date <= asOf;
      return inPeriod && t.category_id === account.category_id && Number(t.amount) < 0 ? s + Math.abs(Number(t.amount)) : s;
    }, 0);
    return { account, amount: Number(line.amount), moved };
  }).filter(function(line) { return line && line.amount > 0; });
  const savingsTotal = savings.reduce(function(s, l) { return s + l.amount; }, 0);
  const savedTotal = savings.reduce(function(s, l) { return s + l.moved; }, 0);

  // 4. Whatever is left is spending money
  const spending = pay - smallTotal - bigTotal - savingsTotal;
  const spent = status === 'upcoming' ? 0 : transactions.reduce(function(s, t) {
    const inPeriod = t.date >= period.start && t.date <= asOf;
    return inPeriod && isSpending(t, accounts) && !isFixedCost(t, bills, accounts) ? s + Math.abs(Number(t.amount)) : s;
  }, 0);

  const totalDays = daysBetween(period.start, period.end) + 1;
  const daysGone = status === 'upcoming' ? 0 : Math.min(totalDays, daysBetween(period.start, asOf) + 1);
  const daysLeft = status === 'current' ? totalDays - daysGone + 1 : 0; // today still counts

  return { today, status, period, pay, payInfo, small, smallTotal, big, bigTotal, savings, savingsTotal, savedTotal, spending, spent, totalDays, daysGone, daysLeft };
}

function billTag(item, plan) {
  if (item.paidOn) return { text: 'Paid', cls: 'rp-good' };
  const d = daysBetween(plan.today, item.due);
  if (d < 0) return { text: plan.status === 'past' ? 'Not paid' : 'Late', cls: 'rp-bad' };
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

function dayLabel(date) {
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- months and paycheques to pick from ----------

function paydaysInMonth(month) {
  return paydaysBetween(settings, month + '-01', Ledger.monthEnd(month));
}

// Up to 12 months back, but not before your first transaction
function monthList(today) {
  const thisMonth = today.slice(0, 7);
  const first = transactions.reduce(function(min, t) { return t.date < min ? t.date : min; }, today).slice(0, 7);
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(thisMonth, -i);
    if (m >= first) months.push(m);
  }
  return months;
}

// Which paycheque is picked: from the address (#2026-10-02), or the current one
function pickedPayday(current) {
  const hash = location.hash.slice(1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(hash) && paydaysInMonth(hash.slice(0, 7)).includes(hash)) {
    return hash;
  }
  return current.start;
}

function renderPicker(picked, current) {
  const today = todayString();
  const pickedMonth = picked.slice(0, 7);

  // Month tabs: each one opens its latest paycheque so far
  document.getElementById('pc-months').innerHTML = monthList(today).map(function(m) {
    const days = paydaysInMonth(m).filter(function(d) { return d <= today; });
    const target = m === current.start.slice(0, 7) ? current.start : (days[days.length - 1] ?? paydaysInMonth(m)[0]);
    const label = m.slice(0, 4) === today.slice(0, 4) ? monthYear(m).split(' ')[0] : monthYear(m);
    return `<a href="#${target}"${m === pickedMonth ? ' aria-current="page"' : ''}>${escapeHTML(label)}</a>`;
  }).join('');

  // The picked month's paycheques
  document.getElementById('pc-paychips').innerHTML = paydaysInMonth(pickedMonth).map(function(day) {
    const deposit = paychequeDeposit(settings, transactions, day);
    let amount;
    if (deposit) amount = formatMoney(deposit.amount);
    else if (day > today) amount = 'Upcoming';
    else {
      const estimate = estimatePaycheque(settings, transactions, day);
      amount = (estimate.source === 'estimate' ? '~' : '') + formatMoney(estimate.amount);
    }
    return `
      <a href="#${day}" class="pc-chip"${day === picked ? ' aria-current="true"' : ''}>
        <span>${dayLabel(day)}${day === current.start ? ' · now' : ''}</span>
        <span class="rp-mono">${amount}</span>
      </a>
    `;
  }).join('');

  // Keep the picked month tab in view on phones
  const active = document.querySelector('#pc-months [aria-current]');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// Month totals across every paycheque that landed in the picked month
function renderMonth(month) {
  const plans = paydaysInMonth(month).map(function(day) { return buildPlan(periodFor(day)); });
  const landed = plans.filter(function(p) { return p.status !== 'upcoming'; });
  const total = function(list, key) { return list.reduce(function(s, p) { return s + p[key]; }, 0); };
  const planned = total(landed, 'spending');
  const spent = total(landed, 'spent');
  const finished = landed.filter(function(p) { return p.status === 'past'; });
  const finishedLeft = total(finished, 'spending') - total(finished, 'spent');

  const row = function(label, value, cls) {
    return `<div class="rp-list-row"><span>${label}</span><span class="rp-mono ${cls || ''}">${value}</span></div>`;
  };
  let html = row('Paycheques', `${landed.length} of ${plans.length}`)
    + row('Pay received', formatMoney(total(landed, 'pay')))
    + row('Moved to savings', formatMoney(total(landed, 'savedTotal')), 'rp-good')
    + row('Spending money', formatMoney(Math.max(0, planned)))
    + row('Spent', formatMoney(spent));
  if (finished.length) {
    html += row(finishedLeft >= 0 ? 'Left over (finished paycheques)' : 'Overspent (finished paycheques)',
      formatMoney(Math.abs(finishedLeft)), finishedLeft >= 0 ? 'rp-good' : 'rp-bad');
  }
  document.getElementById('pc-month-title').textContent = monthYear(month);
  document.getElementById('pc-month').innerHTML = html;
}

function render() {
  const today = todayString();
  const current = currentPayPeriod(settings, today);
  const picked = pickedPayday(current);
  const period = picked === current.start ? current : periodFor(picked);
  const plan = buildPlan(period);

  renderPicker(picked, current);
  renderMonth(picked.slice(0, 7));

  const usual = estimatePaycheque(settings, transactions, today);
  document.getElementById('pc-schedule').textContent =
    `${usual.source === 'estimate' ? 'Usually about ' : ''}${formatMoney(usual.amount)} · ${PAY_FREQUENCIES[settings.frequency].label.toLowerCase()}`;

  // Where this paycheque's number came from
  const info = plan.payInfo;
  let sourceText;
  if (info.source === 'actual') {
    sourceText = `Actual · matched your ${shortDate(info.date)} deposit`;
  } else if (info.source === 'estimate') {
    const average = `average of your last ${info.count === 1 ? 'paycheque' : info.count + ' paycheques'}`;
    sourceText = plan.status === 'past'
      ? `Estimate · no deposit found around this payday, so this uses the ${average}`
      : `Estimate · ${average} (not logged yet)`;
  } else {
    sourceText = settings.income_category_id
      ? 'The amount from your settings (no paycheques found yet)'
      : 'The amount from your settings. Pick your paycheque category to use real amounts.';
  }
  document.getElementById('pc-source').textContent = sourceText;

  const heading = { current: 'This paycheque', past: 'Paycheque', upcoming: 'Upcoming paycheque' }[plan.status];
  document.getElementById('pc-period').textContent = `${heading} · ${dayLabel(period.start)} to ${dayLabel(period.end)}`;
  document.getElementById('pc-amount').textContent = formatMoney(plan.pay);

  const left = plan.spending - plan.spent;
  const dailyBudget = plan.spending / plan.totalDays;
  const leftEl = document.getElementById('pc-left');
  const dailyEl = document.getElementById('pc-daily');
  const leftLabel = document.getElementById('pc-left-label');

  if (plan.status === 'current') {
    const untilNext = daysBetween(today, period.next);
    document.getElementById('pc-next').textContent =
      `Next payday: ${formatDate(period.next, { weekday: 'long', month: 'short', day: 'numeric' })} (in ${untilNext} ${untilNext === 1 ? 'day' : 'days'})`;
    const leftPerDay = left / plan.daysLeft;
    const onTrack = plan.spent <= dailyBudget * plan.daysGone * 1.05;
    leftLabel.textContent = 'Spending money left';
    leftEl.textContent = (left < 0 ? '−' : '') + formatMoney(left);
    dailyEl.textContent = left > 0
      ? `${formatMoney(leftPerDay)} a day for ${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'} · ${onTrack ? 'on track' : 'running ahead'}`
      : 'Spending money is used up until payday';
    dailyEl.className = 'pc-daily ' + (left > 0 && onTrack ? 'is-good' : 'is-warn');
  } else if (plan.status === 'past') {
    document.getElementById('pc-next').textContent = `${plan.totalDays} days · finished`;
    leftLabel.textContent = left >= 0 ? 'Left over' : 'Overspent by';
    leftEl.textContent = formatMoney(Math.abs(left));
    dailyEl.textContent = `Spent ${formatMoney(plan.spent)} of ${formatMoney(Math.max(0, plan.spending))}`;
    dailyEl.className = 'pc-daily ' + (left >= 0 ? 'is-good' : 'is-warn');
  } else {
    const until = daysBetween(today, period.start);
    document.getElementById('pc-next').textContent = `In ${until} ${until === 1 ? 'day' : 'days'}`;
    leftLabel.textContent = 'Spending money';
    leftEl.textContent = formatMoney(Math.max(0, plan.spending));
    dailyEl.textContent = `${formatMoney(dailyBudget)} a day for ${plan.totalDays} days`;
    dailyEl.className = 'pc-daily';
  }

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
      return line(`${escapeHTML(i.bill.name)} · ${shortDate(i.due)}`, billTag(i, plan), Number(i.bill.amount));
    }).join(''));

  const nextFrom = plan.status === 'current' ? today : period.start;
  html += bucket('#7A5A9E', 'Set aside for big bills', plan.bigTotal,
    plan.big.length ? `Bills of ${formatMoney(BIG_BILL)} or more get a share from every paycheque, so no single one has to cover them.` : `No bills of ${formatMoney(BIG_BILL)} or more.`,
    plan.big.map(function(b) {
      const next = dueDatesBetween(b.bill, nextFrom, addDays(nextFrom, 400))[0];
      return line(`${escapeHTML(b.bill.name)} · ${formatMoney(Number(b.bill.amount))} ${BILL_FREQUENCIES[b.bill.frequency].label.toLowerCase()}`,
        next ? { text: 'next ' + shortDate(next), cls: 'text-soft' } : null, b.amount);
    }).join(''));

  html += bucket('var(--positive)', 'Savings goals', plan.savingsTotal,
    plan.savings.length ? 'Moved on payday, before there\'s a chance to spend it. Moving money means logging a transfer in the goal\'s category.' : 'No savings set for each payday yet. Use "Edit pay and savings" to add some.',
    plan.savings.map(function(l) {
      const done = l.moved >= l.amount - 0.005;
      let tag;
      if (plan.status === 'upcoming') tag = { text: 'Planned', cls: 'text-soft' };
      else if (done) tag = { text: 'Moved', cls: 'rp-good' };
      else if (l.moved > 0) tag = { text: `${formatMoney(l.moved)} moved`, cls: 'rp-warn' };
      else tag = { text: plan.status === 'past' ? 'Not moved' : 'Not yet', cls: plan.status === 'past' ? 'rp-bad' : 'rp-warn' };
      return line(escapeHTML(l.account.name), tag, l.amount);
    }).join(''));

  // A noticeably bigger or smaller paycheque than usual changes spending money
  let difference = '';
  if (Math.abs(plan.payInfo.difference) >= 50) {
    difference = plan.payInfo.difference > 0
      ? `<p class="pc-diff is-up">This paycheque is ${formatMoney(plan.payInfo.difference)} more than usual, so spending money went up by that much.${plan.status === 'current' ? ' Want to put some of it toward savings instead? Raise a savings amount in "Edit pay and savings".' : ''}</p>`
      : `<p class="pc-diff is-down">This paycheque is ${formatMoney(plan.payInfo.difference)} less than usual, so there's that much less spending money this time.</p>`;
  }

  html += bucket('var(--accent)', 'Spending money', plan.spending,
    plan.spending >= 0
      ? `Whatever's left: groceries, gas, eating out. That's ${formatMoney(dailyBudget)} a day for ${plan.totalDays} days.`
      : `This plan spends ${formatMoney(plan.spending)} more than the paycheque. Lower some savings, or check your bills.`,
    difference);

  if (plan.status === 'past') {
    html += '<p class="text-soft rp-small pc-history-note">Uses your current bills and savings plan, so older paycheques may not match what you planned at the time.</p>';
  }

  document.getElementById('pc-buckets').innerHTML = html;

  // Tracker
  const tracker = document.getElementById('pc-tracker');
  if (plan.status === 'upcoming') {
    tracker.innerHTML = `<p class="text-soft rp-small" style="margin:0;">Starts on ${dayLabel(period.start)}. Nothing spent yet.</p>`;
  } else {
    const spentPct = plan.spending > 0 ? Math.min(100, (plan.spent / plan.spending) * 100) : 100;
    const pacePct = (plan.daysGone / plan.totalDays) * 100;
    const average = formatMoney(plan.spent / plan.daysGone);
    tracker.innerHTML = `
      <div class="rp-limit-top"><span class="text-soft">${plan.status === 'past' ? 'Spent' : 'Spent so far'} (${plan.daysGone} ${plan.daysGone === 1 ? 'day' : 'days'})</span><span class="rp-mono">${formatMoney(plan.spent)} of ${formatMoney(Math.max(0, plan.spending))}</span></div>
      <div class="pc-track">
        <div class="rp-bar"><div style="width:${spentPct}%; background:${plan.spent > plan.spending ? 'var(--negative)' : 'var(--accent)'};"></div></div>
        ${plan.status === 'current' ? `<span class="pc-pace" style="left:${pacePct}%;" title="An even pace for today"></span>` : ''}
      </div>
      <p class="rp-small" style="margin:10px 0 0;">${plan.status === 'current' ? 'The line marks an even pace for today. ' : ''}The plan allowed <strong>${formatMoney(dailyBudget)} a day</strong>, and you averaged <strong>${average}</strong>.</p>
    `;
  }

  renderPaydays(current);
}

function renderPaydays(current) {
  const today = todayString();
  const upcoming = paydaysBetween(settings, addDays(today, 1), addDays(today, 120)).slice(0, 5);
  const big = bills.filter(isBigBill);
  const expected = estimatePaycheque(settings, transactions, addDays(today, 1));
  const prefix = expected.source === 'estimate' ? '~' : '';

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
        <span class="rp-mono">${prefix}${formatMoney(expected.amount)}</span>
      </div>
    `;
  }).join('');

  if (expected.source === 'estimate') {
    html += `<p class="text-soft rp-small" style="margin:8px 0 0;">~ Estimated from your last ${expected.count === 1 ? 'paycheque' : expected.count + ' paycheques'}.</p>`;
  }

  // Months with an extra payday (weekly and every-2-weeks pay)
  if (settings.frequency === 'weekly' || settings.frequency === 'biweekly') {
    const normal = settings.frequency === 'weekly' ? 4 : 2;
    const thisMonth = today.slice(0, 7);
    for (let i = 0; i < 12; i++) {
      const m = shiftMonth(thisMonth, i);
      const count = paydaysBetween(settings, m + '-01', Ledger.monthEnd(m)).length;
      if (count > normal) {
        html += `<p class="pc-bonus">${monthYear(m)} has ${count} paydays, an extra ${prefix}${formatMoney(expected.amount)} with no extra bills.</p>`;
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

  document.getElementById('pc-in-category').innerHTML = '<option value="">Not set: always use the amount above</option>'
    + categories.map(function(c) {
        const selected = settings && settings.income_category_id === c.id ? ' selected' : '';
        return `<option value="${c.id}"${selected}>${escapeHTML(c.name)}</option>`;
      }).join('');

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
      savingsPlan,
      incomeCategoryId: document.getElementById('pc-in-category').value || null
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
  [settings, bills, payments, accounts, transactions, categories] = await Promise.all([
    getJSON('/api/paycheque'),
    getJSON('/api/bills'),
    getJSON('/api/bills/payments'),
    getJSON('/api/accounts'),
    getJSON('/api/transactions'),
    getJSON('/api/categories')
  ]);
  show();
}

window.addEventListener('hashchange', function() {
  if (settings) render();
});

init();
