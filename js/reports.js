let transactions = [];
let categories = [];
let bills = [];
let billPayments = [];
let accounts = [];

let reportMonth = shiftMonth(todayString().slice(0, 7), -1); // last full month
let nwRange = '12';            // '6' | '12' | 'all'
let nwShowProjection = true;
let nwChart = null;

const FREQUENCIES = {
  weekly:    { perYear: 52, days: 7 },
  biweekly:  { perYear: 26, days: 14 },
  monthly:   { perYear: 12, months: 1 },
  quarterly: { perYear: 4,  months: 3 },
  yearly:    { perYear: 1,  months: 12 }
};

// ======================= helpers =======================

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

// "+$12.00" / "−$12.00" (a real minus sign, not a hyphen)
function signedMoney(amount) {
  return (amount < 0 ? '−' : '+') + formatMoney(amount);
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- dates: 'YYYY-MM-DD' strings, math done in UTC ----

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = toDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000);
}

function addMonths(dateString, months) {
  const [y, m, d] = dateString.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateString(new Date(Date.UTC(year, month, Math.min(d, lastDay))));
}

function shiftMonth(month, offset) {
  return addMonths(month + '-01', offset).slice(0, 7);
}

function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return toDateString(new Date(Date.UTC(y, m, 0)));
}

function monthName(month, style) {
  return toDate(month + '-01').toLocaleDateString('en-US', { month: style, timeZone: 'UTC' });
}

function monthYear(month) {
  return toDate(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shortMonthYear(month) {
  return toDate(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function shortDate(dateString) {
  return toDate(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function monthsBetween(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function findCategory(id) {
  return categories.find(function(c) { return c.id === Number(id); });
}

function inMonth(t, month) {
  return t.date.startsWith(month);
}

// Money moved INTO a savings goal isn't spending, it's saving.
// Expenses in a savings goal's category are left out of "Spent",
// so they show up in "Kept" instead.
function isSavingsTransfer(t) {
  return accounts.some(function(a) {
    return a.kind === 'savings' && a.category_id === t.category_id;
  });
}

// Is this an expense that counts as spending?
function isSpending(t) {
  return Number(t.amount) < 0 && !isSavingsTransfer(t);
}

// Bills and loan payments are expected; leave them out of "Biggest purchases".
function isFixedCost(t) {
  return bills.some(function(b) { return b.category_id === t.category_id; })
    || accounts.some(function(a) { return a.category_id === t.category_id; });
}

// ======================= monthly report: numbers =======================

function monthTotals(month) {
  let income = 0;
  let spent = 0;
  transactions.forEach(function(t) {
    if (!inMonth(t, month)) {
      return;
    }
    const value = Number(t.amount);
    if (value > 0) {
      income += value;
    } else if (isSpending(t)) {
      spent += Math.abs(value);
    }
  });
  const kept = income - spent;
  return { income, spent, kept, rate: income > 0 ? (kept / income) * 100 : null };
}

// { categoryId: amountSpent }
function spendingByCategory(month) {
  const totals = {};
  transactions.forEach(function(t) {
    if (inMonth(t, month) && isSpending(t)) {
      totals[t.category_id] = (totals[t.category_id] ?? 0) + Math.abs(Number(t.amount));
    }
  });
  return totals;
}

function hasLimit(category) {
  return category.limit !== null && category.limit !== '' && Number(category.limit) > 0;
}

// ---- bills (same schedule + matching rules as the Bills page) ----

function occurrence(bill, k) {
  const f = FREQUENCIES[bill.frequency];
  return f.days ? addDays(bill.anchor_date, k * f.days) : addMonths(bill.anchor_date, k * f.months);
}

function dueDatesBetween(bill, start, end) {
  const f = FREQUENCIES[bill.frequency];
  let k;
  if (f.days) {
    k = Math.floor(daysBetween(bill.anchor_date, start) / f.days);
  } else {
    k = Math.floor(monthsBetween(bill.anchor_date.slice(0, 7), start.slice(0, 7)) / f.months) - 1;
  }
  k = Math.max(0, k);
  const dates = [];
  while (dates.length < 60) {
    const due = occurrence(bill, k);
    if (due > end) break;
    if (due >= start) dates.push(due);
    k++;
  }
  return dates;
}

function billsForMonth(month) {
  const start = month + '-01';
  const end = monthEnd(month);
  const items = [];
  bills.forEach(function(bill) {
    dueDatesBetween(bill, start, end).forEach(function(due) {
      items.push({ bill, due });
    });
  });
  items.sort(function(a, b) { return a.due < b.due ? -1 : 1; });

  const used = new Set();
  items.forEach(function(item) {
    const manual = billPayments.find(function(p) {
      return p.bill_id === item.bill.id && p.due_date === item.due;
    });
    if (manual) {
      item.paidOn = manual.paid_on;
      return;
    }
    const amount = Number(item.bill.amount);
    const tolerance = item.bill.amount_varies ? Infinity : Math.max(1, amount * 0.1);
    let best = null;
    let bestGap = Infinity;
    transactions.forEach(function(t) {
      const value = Number(t.amount);
      if (used.has(t.id) || t.category_id !== item.bill.category_id || value >= 0) return;
      if (Math.abs(Math.abs(value) - amount) > tolerance) return;
      const gap = Math.abs(daysBetween(item.due, t.date));
      if (gap <= 7 && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    });
    if (best) {
      used.add(best.id);
      item.paidOn = best.date;
      item.paidAmount = Math.abs(Number(best.amount));
    }
  });
  return items;
}

// ======================= monthly report: rendering =======================

function changeText(now, before, upIsGood) {
  if (before === 0) {
    return { text: 'Nothing to compare', className: 'text-soft' };
  }
  const pct = ((now - before) / before) * 100;
  const good = (pct >= 0) === upIsGood;
  return {
    text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}% vs ${monthName(shiftMonth(reportMonth, -1), 'long')}`,
    className: Math.abs(pct) < 0.05 ? 'text-soft' : good ? 'rp-good' : 'rp-bad'
  };
}

function renderHero(now, before, prevName) {
  const isCurrent = reportMonth === todayString().slice(0, 7);
  document.getElementById('rp-hero-label').textContent = `${monthName(reportMonth, 'long')} in short${isCurrent ? ' (so far)' : ''}`;

  let title;
  if (now.income > 0 && now.kept >= 0) {
    title = `You spent ${formatMoney(now.spent)} and kept ${formatMoney(now.kept)}, which is ${now.rate.toFixed(1)}% of what came in.`;
  } else if (now.income > 0) {
    title = `You spent ${formatMoney(now.spent)}, which is ${formatMoney(now.kept)} more than came in.`;
  } else {
    title = `You spent ${formatMoney(now.spent)}.`;
  }
  document.getElementById('rp-hero-title').textContent = title;

  const parts = [];
  const diff = now.spent - before.spent;
  if (before.spent > 0 && Math.abs(diff) >= 0.01) {
    parts.push(`That's ${formatMoney(diff)} ${diff < 0 ? 'less' : 'more'} spending than ${prevName}`);
  }
  // Best savings rate of the last 6 months?
  if (now.rate !== null) {
    const rates = [1, 2, 3, 4, 5].map(function(i) {
      return monthTotals(shiftMonth(reportMonth, -i)).rate;
    }).filter(function(r) { return r !== null; });
    if (rates.length >= 2 && rates.every(function(r) { return now.rate > r; })) {
      parts.push(`your best savings rate in ${rates.length + 1} months`);
    }
  }
  document.getElementById('rp-hero-sub').textContent = parts.length ? parts.join(', and ') + '.' : '';
}

function renderKpis(now, before, prevName) {
  const income = changeText(now.income, before.income, true);
  const spent = changeText(now.spent, before.spent, false);
  const keptDiff = now.kept - before.kept;

  const tiles = [
    { label: 'Came in', value: formatMoney(now.income), note: income.text, cls: income.className },
    { label: 'Spent', value: formatMoney(now.spent), note: spent.text, cls: spent.className },
    {
      label: 'Kept',
      value: (now.kept < 0 ? '−' : '') + formatMoney(now.kept),
      valueCls: now.kept >= 0 ? 'rp-good' : 'rp-bad',
      note: `${signedMoney(keptDiff)} vs ${prevName}`,
      cls: keptDiff >= 0 ? 'rp-good' : 'rp-bad'
    },
    {
      label: 'Savings rate',
      value: now.rate === null ? '—' : now.rate.toFixed(1) + '%',
      note: before.rate === null ? 'No income last month' : `${prevName} was ${before.rate.toFixed(1)}%`,
      cls: 'text-soft'
    }
  ];

  document.getElementById('rp-kpis').innerHTML = tiles.map(function(t) {
    return `
      <div class="card">
        <p class="rp-stat-label">${t.label}</p>
        <p class="rp-stat-value ${t.valueCls ?? ''}">${t.value}</p>
        <p class="rp-stat-note ${t.cls}">${t.note}</p>
      </div>
    `;
  }).join('');
}

const ICONS = {
  down: 'ti-arrow-down',
  up: 'ti-arrow-up',
  alert: 'ti-alert-triangle',
  calendar: 'ti-calendar-event',
  check: 'ti-check',
  clock: 'ti-clock-exclamation'
};

function renderHighlights(spendNow, spendBefore, prevName, billItems) {
  const items = [];
  const ids = new Set([...Object.keys(spendNow), ...Object.keys(spendBefore)]);
  const changes = [...ids].map(function(id) {
    return { id, diff: (spendNow[id] ?? 0) - (spendBefore[id] ?? 0), now: spendNow[id] ?? 0, before: spendBefore[id] ?? 0 };
  });

  // Biggest drop
  const drop = changes.filter(function(c) { return c.diff < -0.005; }).sort(function(a, b) { return a.diff - b.diff; })[0];
  if (drop) {
    const name = findCategory(drop.id)?.name ?? 'Uncategorized';
    items.push({ icon: ICONS.down, tone: 'good', text: `${escapeHTML(name)} spending fell the most, ${formatMoney(drop.diff)} less than ${prevName}.` });
  }

  // Biggest rise
  const rise = changes.filter(function(c) { return c.diff > 0.005; }).sort(function(a, b) { return b.diff - a.diff; })[0];
  if (rise) {
    const name = findCategory(rise.id)?.name ?? 'Uncategorized';
    const pct = rise.before > 0 ? ` (+${((rise.diff / rise.before) * 100).toFixed(1)}%)` : '';
    items.push({ icon: ICONS.up, tone: 'warn', text: `${escapeHTML(name)} went up the most, ${formatMoney(rise.diff)} more than ${prevName}${pct}.` });
  }

  // Limits gone over (up to 2)
  categories.filter(hasLimit).map(function(c) {
    return { name: c.name, limit: Number(c.limit), spent: spendNow[c.id] ?? 0 };
  }).filter(function(c) { return c.spent > c.limit; })
    .sort(function(a, b) { return (b.spent - b.limit) - (a.spent - a.limit); })
    .slice(0, 2)
    .forEach(function(c) {
      items.push({ icon: ICONS.alert, tone: 'bad', text: `${escapeHTML(c.name)} went ${formatMoney(c.spent - c.limit)} over its ${formatMoney(c.limit)} limit.` });
    });

  // Biggest spending weekday
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  transactions.forEach(function(t) {
    if (inMonth(t, reportMonth) && isSpending(t) && !isFixedCost(t)) {
      byDay[toDate(t.date).getUTCDay()] += Math.abs(Number(t.amount));
    }
  });
  const top = byDay.indexOf(Math.max(...byDay));
  if (byDay[top] > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let count = 0;
    for (let d = 1; d <= Number(monthEnd(reportMonth).slice(8)); d++) {
      if (toDate(`${reportMonth}-${String(d).padStart(2, '0')}`).getUTCDay() === top) count++;
    }
    items.push({ icon: ICONS.calendar, tone: 'neutral', text: `${dayNames[top]}s were your biggest spending day: ${formatMoney(byDay[top])} across ${count} ${dayNames[top]}s.` });
  }

  // Bills
  if (billItems.length) {
    const onTime = billItems.filter(function(i) { return i.paidOn && i.paidOn <= i.due; }).length;
    items.push(onTime === billItems.length
      ? { icon: ICONS.check, tone: 'good', text: `All ${billItems.length} bills were paid on time.` }
      : { icon: ICONS.clock, tone: 'warn', text: `${onTime} of ${billItems.length} bills were paid on time.` });
  }

  document.getElementById('rp-highlights').innerHTML = items.length
    ? items.map(function(h) {
        return `
          <div class="rp-highlight">
            <span class="rp-highlight-icon rp-tone-${h.tone}"><i class="ti ${h.icon}" aria-hidden="true"></i></span>
            <p>${h.text}</p>
          </div>
        `;
      }).join('')
    : '<p class="text-soft rp-small">Not enough data yet to compare.</p>';
}

function renderCategories(spendNow, spendBefore, prevName) {
  document.getElementById('rp-cats-compare').textContent = `vs ${prevName}`;
  const ids = new Set([...Object.keys(spendNow), ...Object.keys(spendBefore)]);
  const rows = [...ids].map(function(id) {
    const category = findCategory(id);
    return {
      name: category?.name ?? 'Uncategorized',
      color: category?.color ?? '#B4B2A9',
      now: spendNow[id] ?? 0,
      before: spendBefore[id] ?? 0
    };
  }).sort(function(a, b) { return b.now - a.now; });

  const max = Math.max(...rows.map(function(r) { return r.now; }), 1);

  document.getElementById('rp-cats').innerHTML = rows.map(function(r) {
    const diff = r.now - r.before;
    const same = Math.abs(diff) < 0.005;
    const changeCls = same ? 'text-soft' : diff < 0 ? 'rp-good' : 'rp-bad';
    return `
      <div class="rp-cat-row">
        <span class="rp-cat-name"><span class="sl-dot" style="background:${escapeHTML(r.color)};"></span>${escapeHTML(r.name)}</span>
        <div class="rp-bar"><div style="width:${(r.now / max) * 100}%; background:${escapeHTML(r.color)};"></div></div>
        <span class="rp-cat-amount">${formatMoney(r.now)}</span>
        <span class="rp-cat-change ${changeCls}">${same ? 'same' : signedMoney(diff)}</span>
      </div>
    `;
  }).join('');
}

function renderLimits(spendNow) {
  const limited = categories.filter(hasLimit).map(function(c) {
    const limit = Number(c.limit);
    const spent = spendNow[c.id] ?? 0;
    return { name: c.name, color: c.color, limit, spent, ratio: spent / limit };
  }).sort(function(a, b) { return b.ratio - a.ratio; }).slice(0, 5);

  document.getElementById('rp-limits-card').hidden = limited.length === 0;
  document.getElementById('rp-limits').innerHTML = limited.map(function(l) {
    const over = l.spent > l.limit;
    const near = !over && l.ratio >= 0.8;
    const note = over ? `Over by ${formatMoney(l.spent - l.limit)}` : `${formatMoney(l.limit - l.spent)} left`;
    const cls = over ? 'rp-bad' : near ? 'rp-warn' : 'rp-good';
    const bar = over ? cssVar('--negative') : l.color;
    return `
      <div class="rp-limit">
        <div class="rp-limit-top"><strong>${escapeHTML(l.name)}</strong><span class="${cls}">${note}</span></div>
        <div class="rp-bar"><div style="width:${Math.min(100, l.ratio * 100)}%; background:${escapeHTML(bar)};"></div></div>
        <span class="text-soft rp-small">${formatMoney(l.spent)} of ${formatMoney(l.limit)}</span>
      </div>
    `;
  }).join('');
}

function renderBiggest() {
  const top = transactions
    .filter(function(t) { return inMonth(t, reportMonth) && isSpending(t) && !isFixedCost(t); })
    .sort(function(a, b) { return Number(a.amount) - Number(b.amount); })
    .slice(0, 3);

  document.getElementById('rp-biggest').innerHTML = top.length
    ? top.map(function(t) {
        const category = findCategory(t.category_id);
        return `
          <div class="rp-list-row">
            <div>
              <p class="rp-list-name">${escapeHTML(t.description)}</p>
              <p class="text-soft rp-small">${escapeHTML(category?.name ?? 'Uncategorized')} · ${shortDate(t.date)}</p>
            </div>
            <span class="rp-mono">${formatMoney(Number(t.amount))}</span>
          </div>
        `;
      }).join('')
    : '<p class="text-soft rp-small">No expenses this month.</p>';
}

function renderBills(billItems) {
  document.getElementById('rp-bills-card').hidden = billItems.length === 0;
  if (billItems.length === 0) {
    return;
  }
  const today = todayString();
  const total = billItems.reduce(function(sum, i) { return sum + (i.paidAmount ?? Number(i.bill.amount)); }, 0);
  const onTime = billItems.filter(function(i) { return i.paidOn && i.paidOn <= i.due; });
  const late = billItems.filter(function(i) { return i.paidOn && i.paidOn > i.due; });
  const unpaid = billItems.filter(function(i) { return !i.paidOn && i.due < today; });

  let html = `<p class="rp-small" style="margin:0 0 6px;"><strong>${onTime.length} of ${billItems.length}</strong> paid on time · ${formatMoney(total)} total</p>`;
  late.forEach(function(i) {
    html += `<p class="rp-small rp-warn" style="margin:0;">${escapeHTML(i.bill.name)} was paid ${daysBetween(i.due, i.paidOn)} days late.</p>`;
  });
  unpaid.forEach(function(i) {
    html += `<p class="rp-small rp-bad" style="margin:0;">${escapeHTML(i.bill.name)} (due ${shortDate(i.due)}) hasn't been paid.</p>`;
  });
  document.getElementById('rp-bills').innerHTML = html;
}

function renderReport() {
  document.getElementById('rp-month-label').textContent = monthYear(reportMonth);
  // Don't let people page into the future
  document.getElementById('rp-next').disabled = reportMonth >= todayString().slice(0, 7);

  const hasData = transactions.some(function(t) { return inMonth(t, reportMonth); });
  document.getElementById('rp-empty').hidden = hasData;
  document.getElementById('rp-body').hidden = !hasData;
  if (!hasData) {
    return;
  }

  const prevMonth = shiftMonth(reportMonth, -1);
  const prevName = monthName(prevMonth, 'long');
  const now = monthTotals(reportMonth);
  const before = monthTotals(prevMonth);
  const spendNow = spendingByCategory(reportMonth);
  const spendBefore = spendingByCategory(prevMonth);
  const billItems = billsForMonth(reportMonth);

  renderHero(now, before, prevName);
  renderKpis(now, before, prevName);
  renderHighlights(spendNow, spendBefore, prevName, billItems);
  renderCategories(spendNow, spendBefore, prevName);
  renderLimits(spendNow);
  renderBiggest();
  renderBills(billItems);
}

// ======================= net worth =======================

// One account's balance at the end of a month, rebuilt from its starting
// balance plus every transaction in its category from start_date onward.
// Returns null if the account didn't exist yet.
function accountBalanceAt(account, month) {
  const end = monthEnd(month);
  if (account.start_date > end) {
    return null;
  }
  let moved = 0;
  transactions.forEach(function(t) {
    if (t.category_id === account.category_id && t.date >= account.start_date && t.date <= end) {
      moved += -Number(t.amount); // expense of -520 => +520 moved
    }
  });
  const starting = Number(account.starting_balance);
  return account.kind === 'savings'
    ? Math.max(0, starting + moved)
    : Math.max(0, starting - moved);
}

// Net worth for every month from the earliest account to now.
function buildHistory() {
  const firstMonth = accounts.map(function(a) { return a.start_date.slice(0, 7); }).sort()[0];
  const lastMonth = todayString().slice(0, 7);
  const history = [];
  for (let m = firstMonth; m <= lastMonth; m = shiftMonth(m, 1)) {
    let saved = 0;
    let owed = 0;
    accounts.forEach(function(a) {
      const balance = accountBalanceAt(a, m);
      if (balance === null) return;
      if (a.kind === 'savings') saved += balance;
      else owed += balance;
    });
    history.push({ month: m, saved, owed, net: saved - owed });
  }
  return history;
}

// Average change per month over (up to) the last 12 months.
function monthlyPace(history) {
  const recent = history.slice(-13);
  if (recent.length < 2) {
    return 0;
  }
  return (recent[recent.length - 1].net - recent[0].net) / (recent.length - 1);
}

function projectedMonthFor(target, history, pace) {
  const last = history[history.length - 1];
  if (pace <= 0 || last.net >= target) {
    return null;
  }
  const months = Math.ceil((target - last.net) / pace);
  return months > 120 ? null : shiftMonth(last.month, months);
}

function renderNetWorth() {
  const empty = accounts.length === 0;
  document.getElementById('nw-empty').hidden = !empty;
  document.getElementById('nw-body').hidden = empty;
  if (empty) {
    return;
  }

  const history = buildHistory();
  const shown = nwRange === 'all' ? history : history.slice(-Number(nwRange));
  const first = shown[0];
  const last = shown[shown.length - 1];
  const pace = monthlyPace(history);
  const zeroMonth = projectedMonthFor(0, history, pace);

  // Header
  document.getElementById('nw-value').textContent = (last.net < 0 ? '−' : '') + formatMoney(last.net);
  const change = last.net - first.net;
  const span = shown.length - 1;
  const changeEl = document.getElementById('nw-change');
  changeEl.textContent = span === 0
    ? 'Your first month of history'
    : `${change >= 0 ? 'Up' : 'Down'} ${formatMoney(change)} since ${shortMonthYear(first.month)}`;
  changeEl.className = 'nw-change ' + (change >= 0 ? 'rp-good' : 'rp-bad');

  document.querySelectorAll('#nw-ranges button').forEach(function(b) {
    b.setAttribute('aria-pressed', String(b.dataset.range === nwRange));
  });

  // Projection: until $0 if you're below it, otherwise 6 months ahead
  const projection = [];
  if (nwShowProjection && pace !== 0) {
    const steps = zeroMonth ? Math.max(1, monthsBetween(last.month, zeroMonth)) : 6;
    for (let i = 1; i <= Math.min(steps, 36); i++) {
      projection.push({ month: shiftMonth(last.month, i), net: last.net + pace * i });
    }
  }

  document.getElementById('nw-note').textContent = pace === 0
    ? 'Solid line: your balance at the end of each month.'
    : `Solid line: your balance at the end of each month. Dashed line: where you'd land at your recent pace of ${signedMoney(pace)} a month.`
      + (zeroMonth && nwShowProjection ? ` On pace for $0 around ${shortMonthYear(zeroMonth)}.` : '');

  drawChart(shown, projection);
  renderAccountsTable(first.month);
  renderSplit(first, last);
  renderMilestones(history, pace);
}

function drawChart(shown, projection) {
  if (typeof Chart === 'undefined') {
    return; // Chart.js didn't load; the rest of the page still works
  }
  const labels = shown.concat(projection).map(function(p) {
    return toDate(p.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  });
  const actual = shown.map(function(p) { return p.net; }).concat(projection.map(function() { return null; }));
  const projected = shown.map(function(p, i) { return i === shown.length - 1 ? p.net : null; })
    .concat(projection.map(function(p) { return p.net; }));

  const positive = cssVar('--positive');
  const soft = cssVar('--ink-soft');

  if (nwChart) {
    nwChart.destroy();
  }
  nwChart = new Chart(document.getElementById('nw-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Net worth',
          data: actual,
          borderColor: positive,
          backgroundColor: positive + '1A', // ~10% opacity fill
          fill: 'origin',
          tension: 0.25,
          pointRadius: 3,
          spanGaps: false
        },
        {
          label: 'Projection',
          data: projected,
          borderColor: soft,
          borderDash: [6, 6],
          pointRadius: 0,
          tension: 0,
          spanGaps: false
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: function(item) { return item.raw !== null; },
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${(context.parsed.y < 0 ? '−' : '')}${formatMoney(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: function(value) {
              return (value < 0 ? '−$' : '$') + Math.abs(value / 1000) + 'k';
            }
          },
          grid: {
            color: function(context) {
              return context.tick.value === 0 ? soft : cssVar('--line');
            }
          }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderAccountsTable(startMonth) {
  document.getElementById('nw-table-title').textContent = `What changed since ${shortMonthYear(startMonth)}`;
  document.getElementById('nw-col-before').textContent = shortMonthYear(startMonth);
  const nowMonth = todayString().slice(0, 7);
  let totalBefore = 0;
  let totalNow = 0;

  const rows = accounts.map(function(a) {
    const sign = a.kind === 'savings' ? 1 : -1;
    const before = accountBalanceAt(a, startMonth);
    const now = accountBalanceAt(a, nowMonth) ?? 0;
    const beforeSigned = before === null ? 0 : sign * before;
    const nowSigned = sign * now;
    totalBefore += beforeSigned;
    totalNow += nowSigned;
    return { a, before, beforeSigned, nowSigned, effect: nowSigned - beforeSigned };
  }).sort(function(x, y) { return Math.abs(y.effect) - Math.abs(x.effect); });

  const money = function(v) { return (v < 0 ? '−' : '') + formatMoney(v); };

  document.getElementById('nw-accounts').innerHTML = rows.map(function(r) {
    const kind = r.a.kind === 'savings' ? 'Savings goal' : 'Loan';
    const started = r.before === null ? ` · started ${shortMonthYear(r.a.start_date.slice(0, 7))}` : '';
    return `
      <tr>
        <td data-label="Account"><strong>${escapeHTML(r.a.name)}</strong><span class="rp-table-note">${kind}${started}</span></td>
        <td data-label="${shortMonthYear(startMonth)}" class="rp-num rp-mono text-soft">${r.before === null ? '—' : money(r.beforeSigned)}</td>
        <td data-label="Now" class="rp-num rp-mono ${r.nowSigned < 0 ? 'rp-bad' : ''}">${money(r.nowSigned)}</td>
        <td data-label="Effect" class="rp-num ${r.effect >= 0 ? 'rp-good' : 'rp-bad'}"><strong>${signedMoney(r.effect)}</strong></td>
      </tr>
    `;
  }).join('');

  document.getElementById('nw-accounts-foot').innerHTML = `
    <tr>
      <td><strong>Net worth</strong></td>
      <td class="rp-num rp-mono text-soft">${money(totalBefore)}</td>
      <td class="rp-num rp-mono"><strong>${money(totalNow)}</strong></td>
      <td class="rp-num ${totalNow - totalBefore >= 0 ? 'rp-good' : 'rp-bad'}"><strong>${signedMoney(totalNow - totalBefore)}</strong></td>
    </tr>
  `;
}

function renderSplit(first, last) {
  const max = Math.max(last.saved, last.owed, 1);
  const row = function(label, value, change, colorVar, goodWhenDown) {
    const good = goodWhenDown ? change <= 0 : change >= 0;
    return `
      <div class="nw-split-row">
        <div class="rp-limit-top"><span class="text-soft">${label}</span><span class="rp-mono">${formatMoney(value)}</span></div>
        <div class="rp-bar"><div style="width:${(value / max) * 100}%; background:var(${colorVar});"></div></div>
        <span class="rp-small ${good ? 'rp-good' : 'rp-bad'}">${signedMoney(change)} since ${shortMonthYear(first.month)}</span>
      </div>
    `;
  };
  document.getElementById('nw-split').innerHTML =
    row('Saved', last.saved, last.saved - first.saved, '--positive', false)
    + row('Owed', last.owed, last.owed - first.owed, '--negative', true);
}

// Milestones every $5,000: the last two you crossed going up,
// and the next two ahead with a projected month.
function renderMilestones(history, pace) {
  const step = 5000;
  const crossed = [];
  for (let i = 1; i < history.length; i++) {
    const before = history[i - 1].net;
    const after = history[i].net;
    for (let level = Math.ceil((before + 0.01) / step) * step; level <= after; level += step) {
      crossed.push({ level, month: history[i].month });
    }
  }

  const last = history[history.length - 1].net;
  const next = [1, 2].map(function(n) {
    const level = (Math.floor(last / step) + n) * step;
    return { level, month: projectedMonthFor(level, history, pace) };
  });

  const label = function(level) { return (level < 0 ? '−' : '') + '$' + Math.abs(level).toLocaleString('en-US'); };

  const html = crossed.slice(-2).map(function(c) {
    return `<div class="nw-milestone"><span class="nw-ms-icon rp-tone-good"><i class="ti ti-check" aria-hidden="true"></i></span><span>Crossed ${label(c.level)}</span><span class="text-soft">${shortMonthYear(c.month)}</span></div>`;
  }).join('') + next.map(function(n) {
    return `<div class="nw-milestone"><span class="nw-ms-icon rp-tone-neutral"><i class="ti ti-flag" aria-hidden="true"></i></span><span>Reach ${label(n.level)}</span><span class="text-soft">${n.month ? 'about ' + shortMonthYear(n.month) : 'keep going'}</span></div>`;
  }).join('');

  document.getElementById('nw-milestones').innerHTML = html;
}

// ======================= spending calendar =======================

let calMonth = todayString().slice(0, 7);
let calDay = todayString();
let calHideFixed = true;

// The spending that counts on the calendar for one day.
function calItems(date) {
  return transactions.filter(function(t) {
    return t.date === date && isSpending(t) && !(calHideFixed && isFixedCost(t));
  });
}

// { 'YYYY-MM-DD': total } for every day with spending
function calTotalsByDay() {
  const totals = {};
  transactions.forEach(function(t) {
    if (isSpending(t) && !(calHideFixed && isFixedCost(t))) {
      totals[t.date] = (totals[t.date] ?? 0) + Math.abs(Number(t.amount));
    }
  });
  return totals;
}

// Shade levels come from YOUR spending: a quarter of your spending days
// land in each of the 4 shades, so the colours stay useful whether a
// normal day for you is $20 or $200.
function calThresholds(totals) {
  const values = Object.values(totals).filter(function(v) { return v > 0; }).sort(function(a, b) { return a - b; });
  if (values.length === 0) {
    return [Infinity, Infinity, Infinity];
  }
  const at = function(p) { return values[Math.min(values.length - 1, Math.floor(values.length * p))]; };
  return [at(0.25), at(0.5), at(0.75)];
}

function calLevel(value, thresholds) {
  if (!value) return 0;
  if (value < thresholds[0]) return 1;
  if (value < thresholds[1]) return 2;
  if (value < thresholds[2]) return 3;
  return 4;
}

// First day we have data for (no point counting "no-spend days" before you started)
function calDataStart() {
  const first = transactions.map(function(t) { return t.date; }).sort()[0];
  const yearAgo = addDays(todayString(), -364);
  return first && first > yearAgo ? first : yearAgo;
}

function renderCalStats(totals, start) {
  const today = todayString();
  let days = 0;
  let sum = 0;
  let zero = 0;
  let streak = 0;
  let best = 0;
  let biggest = { date: null, value: 0 };

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const v = totals[d] ?? 0;
    days++;
    sum += v;
    if (v === 0) {
      zero++;
      streak++;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
    if (v > biggest.value) {
      biggest = { date: d, value: v };
    }
  }

  const tiles = [
    { label: 'Average day', value: formatMoney(sum / days), note: calHideFixed ? 'not counting bills' : 'including bills' },
    { label: 'No-spend days', value: String(zero), note: `out of ${days} days` },
    { label: 'Longest no-spend streak', value: `${best} ${best === 1 ? 'day' : 'days'}`, note: 'in a row' },
    {
      label: 'Biggest day',
      value: formatMoney(biggest.value),
      note: biggest.date
        ? toDate(biggest.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        : '—'
    }
  ];

  document.getElementById('cal-stats').innerHTML = tiles.map(function(t) {
    return `
      <div class="card">
        <p class="rp-stat-label">${t.label}</p>
        <p class="rp-stat-value">${t.value}</p>
        <p class="rp-stat-note text-soft">${t.note}</p>
      </div>
    `;
  }).join('');
}

// 52 columns (weeks, Sunday on top) ending with this week.
function renderCalHeatmap(totals, thresholds, start) {
  const today = todayString();
  const thisSunday = addDays(today, -toDate(today).getUTCDay());
  const firstSunday = addDays(thisSunday, -51 * 7);

  let labels = '';
  let columns = '';
  for (let w = 0; w < 52; w++) {
    let label = '';
    let cells = '';
    for (let r = 0; r < 7; r++) {
      const date = addDays(firstSunday, w * 7 + r);
      if (date.endsWith('-01')) {
        label = monthName(date.slice(0, 7), 'short');
      }
      if (date > today || date < start) {
        cells += '<span class="cal-sq cal-off"></span>';
        continue;
      }
      const v = totals[date] ?? 0;
      const selected = date === calDay ? ' is-selected' : '';
      cells += `<button type="button" class="cal-sq cal-l${calLevel(v, thresholds)}${selected}" data-date="${date}" aria-label="${shortDate(date)}: ${formatMoney(v)}"></button>`;
    }
    labels += `<span>${label}</span>`;
    columns += `<div class="cal-col">${cells}</div>`;
  }

  document.getElementById('cal-heat').innerHTML = `
    <div class="cal-months" aria-hidden="true"><span></span>${labels}</div>
    <div class="cal-grid">
      <div class="cal-days" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
      ${columns}
    </div>
  `;

  // On a phone the heatmap scrolls sideways; start at the newest weeks.
  const scroller = document.getElementById('cal-heat-scroll');
  scroller.scrollLeft = scroller.scrollWidth;
}

function renderCalMonth(totals, thresholds, start) {
  const today = todayString();
  document.getElementById('cal-month-title').textContent = monthYear(calMonth);
  document.getElementById('cal-prev').disabled = calMonth <= start.slice(0, 7);
  document.getElementById('cal-next').disabled = calMonth >= today.slice(0, 7);

  const firstDay = calMonth + '-01';
  const last = monthEnd(calMonth);
  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function(d) {
    return `<span class="cal-weekday" aria-hidden="true">${d}</span>`;
  }).join('');

  for (let i = 0; i < toDate(firstDay).getUTCDay(); i++) {
    html += '<span></span>';
  }

  let monthTotal = 0;
  let noSpend = 0;
  for (let date = firstDay; date <= last; date = addDays(date, 1)) {
    const day = Number(date.slice(8));
    const future = date > today;
    const v = totals[date] ?? 0;
    if (!future && date >= start) {
      monthTotal += v;
      if (v === 0) noSpend++;
    }
    const classes = ['cal-day', `cal-l${future ? 'f' : calLevel(v, thresholds)}`];
    if (date === calDay) classes.push('is-selected');
    if (date === today) classes.push('is-today');
    const amount = future ? '' : v === 0 ? '—' : (v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v));
    html += `
      <button type="button" class="${classes.join(' ')}" data-date="${date}" ${future ? 'disabled' : ''} aria-label="${shortDate(date)}${future ? '' : ': ' + formatMoney(v)}">
        <span>${day}</span>
        <span class="cal-amount">${amount}</span>
      </button>
    `;
  }

  document.getElementById('cal-month').innerHTML = html;
  document.getElementById('cal-month-summary').textContent =
    `${formatMoney(monthTotal)} spent · ${noSpend} no-spend ${noSpend === 1 ? 'day' : 'days'}${calMonth === today.slice(0, 7) ? ' so far' : ''}`;
}

function renderCalDay(totals, start) {
  const items = calItems(calDay);
  const total = items.reduce(function(sum, t) { return sum + Math.abs(Number(t.amount)); }, 0);

  // Average for the same weekday across your data
  const weekday = toDate(calDay).getUTCDay();
  let sameDays = 0;
  let sameSum = 0;
  for (let d = start; d <= todayString(); d = addDays(d, 1)) {
    if (toDate(d).getUTCDay() === weekday) {
      sameDays++;
      sameSum += totals[d] ?? 0;
    }
  }
  const weekdayName = toDate(calDay).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const title = toDate(calDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  const list = items.length
    ? items.map(function(t) {
        const category = findCategory(t.category_id);
        return `
          <div class="rp-list-row">
            <div>
              <p class="rp-list-name">${escapeHTML(t.description)}</p>
              <p class="text-soft rp-small cal-cat"><span class="sl-dot" style="background:${escapeHTML(category?.color ?? '#B4B2A9')};"></span>${escapeHTML(category?.name ?? 'Uncategorized')}${isFixedCost(t) ? ' · bill' : ''}</p>
            </div>
            <span class="rp-mono">${formatMoney(Number(t.amount))}</span>
          </div>
        `;
      }).join('')
    : '<p class="cal-nospend">No spending this day.</p>';

  document.getElementById('cal-day').innerHTML = `
    <p class="rp-stat-label">${title}</p>
    <p class="cal-day-total">${formatMoney(total)}</p>
    <p class="text-soft rp-small" style="margin:2px 0 12px;">${sameDays ? `Your average ${weekdayName} is ${formatMoney(sameSum / sameDays)}` : ''}</p>
    ${list}
    <a class="btn btn-secondary cal-open" href="transactions.html?date=${calDay}">Open in Transactions</a>
  `;
}

function renderCalendar() {
  const hasSpending = transactions.some(isSpending);
  document.getElementById('cal-empty').hidden = hasSpending;
  document.getElementById('cal-body').hidden = !hasSpending;
  if (!hasSpending) {
    return;
  }
  const totals = calTotalsByDay();
  const thresholds = calThresholds(totals);
  const start = calDataStart();
  renderCalStats(totals, start);
  renderCalHeatmap(totals, thresholds, start);
  renderCalMonth(totals, thresholds, start);
  renderCalDay(totals, start);
}

document.getElementById('rp-calendar').addEventListener('click', function(event) {
  const cell = event.target.closest('[data-date]');
  if (!cell || cell.disabled) {
    return;
  }
  calDay = cell.dataset.date;
  calMonth = calDay.slice(0, 7);
  renderCalendar();
});

document.getElementById('cal-prev').addEventListener('click', function() {
  calMonth = shiftMonth(calMonth, -1);
  renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', function() {
  if (calMonth < todayString().slice(0, 7)) {
    calMonth = shiftMonth(calMonth, 1);
    renderCalendar();
  }
});

document.getElementById('cal-hide-fixed').addEventListener('change', function() {
  calHideFixed = this.checked;
  renderCalendar();
});

// ======================= tabs & events =======================

const TABS = ['report', 'networth', 'calendar'];

function showTab(tab) {
  if (!TABS.includes(tab)) {
    tab = 'report';
  }
  TABS.forEach(function(name) {
    document.getElementById('rp-' + name).hidden = name !== tab;
    document.getElementById('tab-' + name).setAttribute('aria-selected', String(name === tab));
  });
  document.getElementById('cal-fixed-wrap').hidden = tab !== 'calendar';
  // Remember the tab in the address, so reports.html#calendar opens it directly
  history.replaceState(null, '', '#' + tab);

  if (tab === 'networth') {
    renderNetWorth(); // Chart.js needs the canvas visible to size itself
  } else if (tab === 'calendar') {
    renderCalendar();
  }
}

document.querySelectorAll('.rp-tabs [data-tab]').forEach(function(button) {
  button.addEventListener('click', function() { showTab(button.dataset.tab); });
});

document.getElementById('rp-prev').addEventListener('click', function() {
  reportMonth = shiftMonth(reportMonth, -1);
  renderReport();
});

document.getElementById('rp-next').addEventListener('click', function() {
  if (reportMonth < todayString().slice(0, 7)) {
    reportMonth = shiftMonth(reportMonth, 1);
    renderReport();
  }
});

document.getElementById('rp-print').addEventListener('click', function() { window.print(); });

document.getElementById('nw-ranges').addEventListener('click', function(event) {
  const button = event.target.closest('[data-range]');
  if (button) {
    nwRange = button.dataset.range;
    renderNetWorth();
  }
});

document.getElementById('nw-projection').addEventListener('change', function() {
  nwShowProjection = this.checked;
  renderNetWorth();
});

// ======================= loading =======================

async function getJSON(url) {
  const response = await fetch(url);
  if (response.status === 401) {
    window.location.href = 'login.html';
    return [];
  }
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function init() {
  [transactions, categories, bills, billPayments, accounts] = await Promise.all([
    getJSON('/api/transactions'),
    getJSON('/api/categories'),
    getJSON('/api/bills'),
    getJSON('/api/bills/payments'),
    getJSON('/api/accounts')
  ]);
  renderReport();
  showTab(location.hash.slice(1));
}

init();
