const { escapeHTML, formatMoney, todayString, shiftMonth, monthYear, getJSON, accountBalance } = Ledger;

let loans = [];          // usable loans: { id, name, balance, rate, min, color }
let skipped = [];        // loans missing a monthly payment
let strategy = 'avalanche';
let extra = 200;

const COLORS = ['#A34A3C', '#7A5A9E', '#3F6B4F', '#C98A3E', '#4A6FA5', '#2F7F7A', '#5B6760'];

// Remember your choices in this browser (nice to have; works without it)
try {
  strategy = localStorage.getItem('debt-strategy') || strategy;
  extra = Number(localStorage.getItem('debt-extra') ?? extra);
} catch (error) { /* private window: just use the defaults */ }

function remember() {
  try {
    localStorage.setItem('debt-strategy', strategy);
    localStorage.setItem('debt-extra', String(extra));
  } catch (error) { /* ignore */ }
}

// =====================================================================
// The heart of the page. Runs month by month until every loan is paid:
//   1. add a month of interest to each loan
//   2. pay each loan's minimum
//   3. put the extra (plus minimums freed up by paid-off loans, if
//      rollover is on) on loans in strategy order
// =====================================================================
function simulate(order, extraPerMonth, rollover) {
  const state = loans.map(function(l) {
    return { loan: l, left: l.balance, paidMonth: null, interest: 0 };
  });
  const byId = {};
  state.forEach(function(s) { byId[s.loan.id] = s; });

  const totals = [state.reduce(function(sum, s) { return sum + s.left; }, 0)];
  let month = 0;
  const MAX_MONTHS = 600; // 50 years: stops loans whose payment never catches up

  while (state.some(function(s) { return s.left > 0.005; }) && month < MAX_MONTHS) {
    month++;

    // 1. Interest
    state.forEach(function(s) {
      if (s.left <= 0.005) return;
      const interest = s.left * (s.loan.rate / 100 / 12);
      s.left += interest;
      s.interest += interest;
    });

    // 2. Minimums. A loan that's already gone frees up its whole minimum.
    let pool = extraPerMonth;
    state.forEach(function(s) {
      if (s.left <= 0.005) {
        if (rollover) pool += s.loan.min;
        return;
      }
      const pay = Math.min(s.loan.min, s.left);
      s.left -= pay;
      if (rollover) pool += s.loan.min - pay; // leftover from a final small payment
    });

    // 3. Extra goes to the first unpaid loan in line, then the next...
    for (const loan of order) {
      if (pool <= 0) break;
      const s = byId[loan.id];
      if (s.left <= 0.005) continue;
      const pay = Math.min(pool, s.left);
      s.left -= pay;
      pool -= pay;
    }

    state.forEach(function(s) {
      if (s.left <= 0.005 && s.paidMonth === null) {
        s.left = 0;
        s.paidMonth = month;
      }
    });
    totals.push(state.reduce(function(sum, s) { return sum + Math.max(0, s.left); }, 0));
  }

  return {
    state,
    months: month,
    finished: state.every(function(s) { return s.paidMonth !== null; }),
    totals,
    interest: state.reduce(function(sum, s) { return sum + s.interest; }, 0)
  };
}

function orderFor(name) {
  return loans.slice().sort(function(a, b) {
    return name === 'snowball'
      ? a.balance - b.balance || b.rate - a.rate
      : b.rate - a.rate || a.balance - b.balance;
  });
}

// Month 1 = next month
function monthLabel(m, style) {
  return monthYear(shiftMonth(todayString().slice(0, 7), m), style);
}

function duration(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'month' : 'months'}`);
  return parts.join(', ') || 'less than a month';
}

// ---------------- rendering ----------------

function renderWarnings() {
  const notes = [];
  if (skipped.length) {
    notes.push(`${skipped.map(function(l) { return '<strong>' + escapeHTML(l.name) + '</strong>'; }).join(', ')} ${skipped.length === 1 ? "isn't" : "aren't"} included because ${skipped.length === 1 ? 'it has' : 'they have'} no monthly payment. Add one on the Savings page.`);
  }
  const noRate = loans.filter(function(l) { return l.rateMissing; });
  if (noRate.length) {
    notes.push(`${noRate.map(function(l) { return '<strong>' + escapeHTML(l.name) + '</strong>'; }).join(', ')} ${noRate.length === 1 ? 'has' : 'have'} no interest rate, so 0% is assumed.`);
  }
  document.getElementById('dp-warnings').innerHTML = notes.map(function(n) {
    return `<p class="card dp-warning">${n} <a href="savings.html">Open Savings</a></p>`;
  }).join('');
}

function renderControls() {
  document.querySelectorAll('[data-strategy]').forEach(function(b) {
    b.setAttribute('aria-pressed', String(b.dataset.strategy === strategy));
  });
  document.getElementById('dp-extra').value = extra;
  document.getElementById('dp-extra-text').textContent = formatMoney(extra);
  const mins = loans.reduce(function(s, l) { return s + l.min; }, 0);
  document.getElementById('dp-total-payment').innerHTML =
    `Minimums add up to ${formatMoney(mins)} a month. Total going to debt: <strong>${formatMoney(mins + extra)} a month</strong>.`;
}

function render() {
  const empty = loans.length === 0;
  document.getElementById('dp-empty').hidden = !empty || skipped.length > 0;
  document.getElementById('dp-body').hidden = empty && skipped.length === 0;
  renderWarnings();
  if (empty) {
    return;
  }
  renderControls();

  const order = orderFor(strategy);
  const plan = simulate(order, extra, true);
  const base = simulate(order, 0, false); // minimums only, no rollover

  // Stats
  const saved = base.interest - plan.interest;
  const monthsSaved = base.months - plan.months;
  const tiles = [
    {
      label: 'Debt-free',
      value: plan.finished ? monthLabel(plan.months, 'long') : 'Not yet',
      note: plan.finished ? 'in ' + duration(plan.months) : 'Payments don\'t cover the interest. Raise the extra amount.',
      dark: true
    },
    { label: 'Total interest', value: formatMoney(plan.interest), note: 'Minimums only: ' + (base.finished ? formatMoney(base.interest) : 'never paid off') },
    { label: 'Interest saved', value: formatMoney(Math.max(0, saved)), note: 'vs paying minimums only', cls: 'rp-good' },
    {
      label: 'Time saved',
      value: monthsSaved > 0 ? duration(monthsSaved) : '—',
      note: base.finished ? 'Minimums only: debt-free ' + monthLabel(base.months, 'long') : 'Minimums alone never finish',
      cls: 'rp-good'
    }
  ];
  document.getElementById('dp-stats').innerHTML = tiles.map(function(t) {
    return `
      <div class="card${t.dark ? ' dp-dark' : ''}">
        <p class="rp-stat-label">${t.label}</p>
        <p class="rp-stat-value ${t.cls ?? ''}">${t.value}</p>
        <p class="rp-stat-note">${t.note}</p>
      </div>
    `;
  }).join('');

  renderChart(plan, base);

  // Payoff order
  const span = Math.max(plan.months, base.finished ? base.months : plan.months, 1);
  const byId = {};
  plan.state.forEach(function(s) { byId[s.loan.id] = s; });
  document.getElementById('dp-rows').innerHTML = order.map(function(loan, i) {
    const s = byId[loan.id];
    return `
      <tr>
        <td data-label="#"><span class="dp-order">${i + 1}</span></td>
        <td data-label="Loan"><strong>${escapeHTML(loan.name)}</strong></td>
        <td data-label="Balance" class="rp-num rp-mono">${formatMoney(loan.balance)}</td>
        <td data-label="Rate" class="rp-num">${loan.rate.toFixed(2)}%</td>
        <td data-label="Minimum" class="rp-num rp-mono text-soft">${formatMoney(loan.min)}</td>
        <td data-label="Timeline"><div class="dp-timeline"><div style="width:${s.paidMonth ? (s.paidMonth / span) * 100 : 100}%; background:${loan.color};"></div></div></td>
        <td data-label="Paid off" class="rp-num"><strong>${s.paidMonth ? monthLabel(s.paidMonth, 'short') : 'Not in 50 years'}</strong><span class="rp-table-note">${formatMoney(s.interest)} interest</span></td>
      </tr>
    `;
  }).join('');
}

function renderChart(plan, base) {
  const span = Math.max(plan.months, base.months, 1);
  const top = Math.max(base.totals[0], 1) * 1.05;
  const step = top > 50000 ? 20000 : top > 20000 ? 10000 : top > 8000 ? 5000 : 1000;
  const max = Math.ceil(top / step) * step;
  const point = function(v, i) { return `${((i / span) * 1000).toFixed(1)},${(300 - (v / max) * 300).toFixed(1)}`; };
  const planPoints = plan.totals.map(point).join(' ');
  const basePoints = base.totals.map(point).join(' ');

  document.getElementById('dp-chart').innerHTML = `
    ${Array.from({ length: max / step + 1 }, function(_, k) {
      return `<span class="dp-grid" style="top:${(k * step / max) * 100}%;"></span>`;
    }).join('')}
    <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${planPoints} ${((plan.totals.length - 1) / span * 1000).toFixed(1)},300 0,300" fill="var(--positive)" fill-opacity="0.10"></polygon>
      <polyline points="${basePoints}" fill="none" stroke="#8A8F88" stroke-width="2" stroke-dasharray="6 6" vector-effect="non-scaling-stroke"></polyline>
      <polyline points="${planPoints}" fill="none" stroke="var(--positive)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polyline>
    </svg>
  `;
  document.getElementById('dp-chart').setAttribute('aria-label',
    `Total debt falls from ${formatMoney(plan.totals[0])} to zero ` +
    (plan.finished ? `by ${monthLabel(plan.months, 'long')} with your plan` : 'never with your plan') +
    (base.finished ? `, vs ${monthLabel(base.months, 'long')} paying minimums only.` : '.'));

  document.getElementById('dp-y').innerHTML = Array.from({ length: max / step + 1 }, function(_, k) {
    const v = max - k * step;
    return `<span style="top:${(k * step / max) * 100}%;">$${v >= 1000 ? v / 1000 + 'k' : v}</span>`;
  }).join('');

  document.getElementById('dp-x').innerHTML = [0, 0.25, 0.5, 0.75, 1].map(function(f) {
    return `<span>${monthLabel(Math.max(1, Math.round(span * f)), 'short')}</span>`;
  }).join('');
}

// ---------------- events ----------------

document.querySelector('.dp-strategies').addEventListener('click', function(event) {
  const button = event.target.closest('[data-strategy]');
  if (!button) return;
  strategy = button.dataset.strategy;
  remember();
  render();
});

document.getElementById('dp-extra').addEventListener('input', function() {
  extra = Number(this.value);
  remember();
  render();
});

// ---------------- loading ----------------

async function init() {
  const [accounts, transactions] = await Promise.all([
    getJSON('/api/accounts'),
    getJSON('/api/transactions')
  ]);
  const today = todayString();

  accounts.filter(function(a) { return a.kind === 'loan'; }).forEach(function(a, i) {
    const balance = accountBalance(a, transactions, today) ?? Number(a.starting_balance);
    if (balance <= 0.005) return; // already paid off
    const min = a.monthly_payment === null ? null : Number(a.monthly_payment);
    const item = {
      id: a.id,
      name: a.name,
      balance,
      rate: a.interest_rate === null ? 0 : Number(a.interest_rate),
      rateMissing: a.interest_rate === null,
      min,
      color: COLORS[i % COLORS.length]
    };
    if (!min || min <= 0) {
      skipped.push(item);
    } else {
      loans.push(item);
    }
  });

  render();
}

init();
