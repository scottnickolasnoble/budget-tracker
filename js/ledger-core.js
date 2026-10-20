// =====================================================================
// ledger-core.js — helpers shared by the newer pages.
//
// Everything lives inside ONE global object, `Ledger`, instead of loose
// functions. That way it can't clash with older files like widgets.js that
// already have their own formatMoney, escapeHTML, etc.
//
// Use it like:  Ledger.formatMoney(12)   or, on pages that only load
// this file:    const { formatMoney, escapeHTML } = Ledger;
// =====================================================================

const Ledger = (function() {

  // ---------------- text & money ----------------

  function escapeHTML(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // 1234.5 -> "$1,234.50" (always positive; add your own sign)
  function formatMoney(amount) {
    return '$' + Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // -12 -> "−$12.00", 12 -> "+$12.00" (a real minus sign)
  function signedMoney(amount) {
    return (amount < 0 ? '−' : '+') + formatMoney(amount);
  }

  // -12 -> "−$12.00", 12 -> "$12.00"
  function money(amount) {
    return (amount < 0 ? '−' : '') + formatMoney(amount);
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---------------- dates ----------------
  // Every date is a 'YYYY-MM-DD' string. Math is done in UTC so daylight
  // saving can't shift a day, and strings compare correctly with < and >.

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

  // Adds months but keeps the day sensible: Jan 31 + 1 month = Feb 28
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

  function monthsBetween(a, b) {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  }

  function formatDate(dateString, options) {
    return toDate(dateString).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, options));
  }

  function shortDate(dateString) {
    return formatDate(dateString, { month: 'short', day: 'numeric' });
  }

  function monthName(month, style) {
    return formatDate(month + '-01', { month: style || 'long' });
  }

  function monthYear(month, style) {
    return formatDate(month + '-01', { month: style || 'long', year: 'numeric' });
  }

  // ---------------- loading ----------------

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

  async function sendJSON(url, method, body) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      throw new Error(data.error ?? 'Something went wrong. Try again.');
    }
    return data;
  }

  function findCategory(categories, id) {
    return categories.find(function(c) { return c.id === Number(id); });
  }

  // ---------------- spending rules (same as Reports) ----------------

  // Money moved INTO a savings goal is saving, not spending.
  function isSavingsTransfer(t, accounts) {
    return accounts.some(function(a) { return a.kind === 'savings' && a.category_id === t.category_id; });
  }

  function isSpending(t, accounts) {
    return Number(t.amount) < 0 && !isSavingsTransfer(t, accounts);
  }

  // Bills and loan payments: expected, so left out of "everyday" spending views.
  function isFixedCost(t, bills, accounts) {
    return bills.some(function(b) { return b.category_id === t.category_id; })
      || accounts.some(function(a) { return a.category_id === t.category_id; });
  }

  // ---------------- bills ----------------

  const BILL_FREQUENCIES = {
    weekly:    { label: 'Weekly',         perYear: 52, days: 7 },
    biweekly:  { label: 'Every 2 weeks',  perYear: 26, days: 14 },
    monthly:   { label: 'Monthly',        perYear: 12, months: 1 },
    quarterly: { label: 'Every 3 months', perYear: 4,  months: 3 },
    yearly:    { label: 'Yearly',         perYear: 1,  months: 12 }
  };

  function billOccurrence(bill, k) {
    const f = BILL_FREQUENCIES[bill.frequency];
    return f.days ? addDays(bill.anchor_date, k * f.days) : addMonths(bill.anchor_date, k * f.months);
  }

  function dueDatesBetween(bill, start, end) {
    const f = BILL_FREQUENCIES[bill.frequency];
    let k = f.days
      ? Math.floor(daysBetween(bill.anchor_date, start) / f.days)
      : Math.floor(monthsBetween(bill.anchor_date.slice(0, 7), start.slice(0, 7)) / f.months) - 1;
    k = Math.max(0, k);
    const dates = [];
    while (dates.length < 60) {
      const due = billOccurrence(bill, k);
      if (due > end) break;
      if (due >= start) dates.push(due);
      k++;
    }
    return dates;
  }

  // Every bill due date between start and end, each marked paid or not using
  // the same rules as the Bills page (hand-marked payments, or a matching
  // transaction within 7 days and 10% of the amount).
  function billsBetween(bills, transactions, payments, start, end) {
    const items = [];
    bills.forEach(function(bill) {
      dueDatesBetween(bill, start, end).forEach(function(due) {
        items.push({ bill, due });
      });
    });
    items.sort(function(a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });

    const used = new Set();
    items.forEach(function(item) {
      const manual = payments.find(function(p) {
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
        item.match = best;
      }
    });
    return items;
  }

  // ---------------- savings goals & loans ----------------

  // Balance at the end of `endDate`, rebuilt from the starting balance plus
  // every transaction in the account's category since its start date.
  // Returns null if the account didn't exist yet.
  function accountBalance(account, transactions, endDate) {
    if (account.start_date > endDate) {
      return null;
    }
    let moved = 0;
    transactions.forEach(function(t) {
      if (t.category_id === account.category_id && t.date >= account.start_date && t.date <= endDate) {
        moved += -Number(t.amount);
      }
    });
    const starting = Number(account.starting_balance);
    return account.kind === 'savings' ? Math.max(0, starting + moved) : Math.max(0, starting - moved);
  }

  // ---------------- paydays ----------------

  const PAY_FREQUENCIES = {
    weekly:      { label: 'Every week',          perYear: 52 },
    biweekly:    { label: 'Every 2 weeks',       perYear: 26 },
    semimonthly: { label: 'Twice a month (15th and last day)', perYear: 24 },
    monthly:     { label: 'Once a month',        perYear: 12 }
  };

  // All paydays between start and end (inclusive).
  function paydaysBetween(settings, start, end) {
    const dates = [];
    const anchor = settings.anchor_date;
    if (settings.frequency === 'weekly' || settings.frequency === 'biweekly') {
      const step = settings.frequency === 'weekly' ? 7 : 14;
      let k = Math.floor(daysBetween(anchor, start) / step);
      let d = addDays(anchor, k * step);
      while (d <= end) {
        if (d >= start) dates.push(d);
        k++;
        d = addDays(anchor, k * step);
      }
    } else if (settings.frequency === 'semimonthly') {
      for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = shiftMonth(m, 1)) {
        [m + '-15', monthEnd(m)].forEach(function(d) {
          if (d >= start && d <= end) dates.push(d);
        });
      }
    } else {
      for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = shiftMonth(m, 1)) {
        const d = addMonths(anchor, monthsBetween(anchor.slice(0, 7), m));
        if (d >= start && d <= end) dates.push(d);
      }
    }
    return dates;
  }

  // The current pay period: { start: last payday, next: next payday, end: day before next }
  function currentPayPeriod(settings, today) {
    const recent = paydaysBetween(settings, addDays(today, -40), today);
    const start = recent[recent.length - 1] ?? settings.anchor_date;
    const next = paydaysBetween(settings, addDays(today, 1), addDays(today, 40))[0];
    return { start, next, end: addDays(next, -1) };
  }

  // ---------------- subscription detection ----------------

  // "NETFLIX.COM 12345" and "Netflix.com #889" both become "netflix com"
  function normalizeDescription(text) {
    return String(text).toLowerCase().replace(/[0-9#*]+/g, ' ').replace(/[^a-z]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  const SUB_FREQUENCIES = [
    { id: 'weekly',    label: 'Weekly',         min: 6,   max: 8,   perYear: 52 },
    { id: 'biweekly',  label: 'Every 2 weeks',  min: 13,  max: 16,  perYear: 26 },
    { id: 'monthly',   label: 'Monthly',        min: 26,  max: 35,  perYear: 12 },
    { id: 'quarterly', label: 'Every 3 months', min: 84,  max: 98,  perYear: 4 },
    { id: 'yearly',    label: 'Yearly',         min: 350, max: 380, perYear: 1 }
  ];

  function median(values) {
    const sorted = values.slice().sort(function(a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Finds charges that repeat: same description (cleaned up), same category,
  // about the same amount, on a regular schedule.
  function detectSubscriptions(transactions, bills, accounts, today) {
    const groups = {};
    transactions.forEach(function(t) {
      if (Number(t.amount) >= 0 || isSavingsTransfer(t, accounts)) return;
      // Loan payments are handled on the Savings page
      if (accounts.some(function(a) { return a.kind === 'loan' && a.category_id === t.category_id; })) return;
      const name = normalizeDescription(t.description);
      if (name === '') return;
      const key = name + '|' + t.category_id;
      (groups[key] = groups[key] || []).push(t);
    });

    const found = [];
    Object.keys(groups).forEach(function(key) {
      const list = groups[key].slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });
      if (list.length < 2) return;

      const gaps = [];
      for (let i = 1; i < list.length; i++) {
        gaps.push(daysBetween(list[i - 1].date, list[i].date));
      }
      const typical = median(gaps);
      const freq = SUB_FREQUENCIES.find(function(f) { return typical >= f.min && typical <= f.max; });
      if (!freq) return;
      // Need at least 3 charges, except yearly (2 is all you'd see in a year or two)
      if (list.length < (freq.id === 'yearly' ? 2 : 3)) return;
      // Most gaps should fit the schedule
      const regular = gaps.filter(function(g) { return g >= freq.min && g <= freq.max; }).length;
      if (regular / gaps.length < 0.6) return;
      // Amounts should be about the same
      const amounts = list.map(function(t) { return Math.abs(Number(t.amount)); });
      const typicalAmount = median(amounts);
      if (amounts.some(function(a) { return Math.abs(a - typicalAmount) > typicalAmount * 0.15 + 0.5; })) return;

      const last = list[list.length - 1];
      const lastAmount = Math.abs(Number(last.amount));
      // Rent, mortgage and other big regular payments aren't "subscriptions"
      if (lastAmount * freq.perYear / 12 >= 250) return;
      // Stopped? Skip anything that's missed more than one charge
      if (daysBetween(last.date, today) > freq.max * 1.6) return;

      // Most recent price change, if any
      let priceChange = null;
      for (let i = amounts.length - 1; i > 0; i--) {
        if (Math.abs(amounts[i] - amounts[i - 1]) >= 0.5) {
          priceChange = { from: amounts[i - 1], on: list[i].date };
          break;
        }
      }
      const tracked = bills.some(function(b) {
        return b.category_id === last.category_id && Math.abs(Number(b.amount) - lastAmount) <= Math.max(1, lastAmount * 0.15);
      });

      // "NETFLIX.COM #4821" -> "NETFLIX.COM"
      const cleanName = String(last.description).replace(/\s*[#*]?\d{3,}.*$/, '').trim() || String(last.description);

      found.push({
        key,
        name: cleanName,
        categoryId: last.category_id,
        amount: lastAmount,
        frequency: freq,
        yearly: lastAmount * freq.perYear,
        lastDate: last.date,
        nextDate: addDays(last.date, Math.round(typical)),
        count: list.length,
        priceChange,
        tracked
      });
    });

    return found.sort(function(a, b) { return b.yearly - a.yearly; });
  }

  // ---------------- category trends ----------------

  // Spending per month for one category: [{ month, total }], oldest first
  function categoryMonths(transactions, accounts, categoryId, endMonth, count) {
    const months = [];
    for (let i = count - 1; i >= 0; i--) {
      months.push({ month: shiftMonth(endMonth, -i), total: 0 });
    }
    const byMonth = {};
    months.forEach(function(m) { byMonth[m.month] = m; });
    transactions.forEach(function(t) {
      if (t.category_id !== Number(categoryId) || !isSpending(t, accounts)) return;
      const bucket = byMonth[t.date.slice(0, 7)];
      if (bucket) bucket.total += Math.abs(Number(t.amount));
    });
    return months;
  }

  // ---------------- insights ----------------
  // Each insight: { key, kind: 'headsup'|'tip'|'win', icon, title, detail,
  //                 action: { label, href }, date, bar?, spark? }
  // `key` is stable, so a dismissed insight stays dismissed.

  function buildInsights(data) {
    const { transactions, categories, bills, payments, accounts, paySettings, subscriptions, ignoredSubs } = data;
    const today = data.today ?? todayString();
    const month = today.slice(0, 7);
    const day = Number(today.slice(8));
    const daysInMonth = Number(monthEnd(month).slice(8));
    const out = [];

    const spendThisMonth = {};
    transactions.forEach(function(t) {
      if (t.date.startsWith(month) && isSpending(t, accounts)) {
        spendThisMonth[t.category_id] = (spendThisMonth[t.category_id] ?? 0) + Math.abs(Number(t.amount));
      }
    });

    // 1. Limits: already over, or on pace to go over
    categories.forEach(function(c) {
      const limit = Number(c.limit);
      if (!(limit > 0)) return;
      const spent = spendThisMonth[c.id] ?? 0;
      if (spent > limit) {
        out.push({
          key: `limit-over:${c.id}:${month}`, kind: 'headsup', icon: 'ti-alert-triangle', date: today,
          title: `${c.name} is over its limit`,
          detail: `You've spent ${formatMoney(spent)} of your ${formatMoney(limit)} limit this month, ${formatMoney(spent - limit)} over.`,
          action: { label: `See ${c.name} trend`, href: `reports.html#trends-${c.id}` },
          bar: { now: 100, pace: (day / daysInMonth) * 100 }
        });
      } else if (day >= 5) {
        const projected = (spent / day) * daysInMonth;
        if (projected > limit * 1.05) {
          out.push({
            key: `limit-pace:${c.id}:${month}`, kind: 'headsup', icon: 'ti-alert-circle', date: today,
            title: `${c.name} is on pace to go over its limit`,
            detail: `You're at ${formatMoney(spent)} of ${formatMoney(limit)} with ${daysInMonth - day} days left. At this pace the month ends around ${formatMoney(projected)}. The red line marks an even pace for today.`,
            action: { label: `See ${c.name} trend`, href: `reports.html#trends-${c.id}` },
            bar: { now: (spent / limit) * 100, pace: (day / daysInMonth) * 100 }
          });
        }
      }
    });

    // 2. Late bills (this month and last)
    billsBetween(bills, transactions, payments, shiftMonth(month, -1) + '-01', addDays(today, -1)).forEach(function(item) {
      if (item.paidOn) return;
      const late = daysBetween(item.due, today);
      out.push({
        key: `bill-late:${item.bill.id}:${item.due}`, kind: 'headsup', icon: 'ti-clock-exclamation', date: today,
        title: `${item.bill.name} is ${late} ${late === 1 ? 'day' : 'days'} late`,
        detail: `It was due ${shortDate(item.due)} and no matching payment has shown up yet.`,
        action: { label: 'Open Bills', href: 'bills.html' }
      });
    });

    // 3. Payday coming up
    if (paySettings) {
      const period = currentPayPeriod(paySettings, today);
      const daysAway = daysBetween(today, period.next);
      if (daysAway <= 3) {
        out.push({
          key: `payday:${period.next}`, kind: 'tip', icon: 'ti-coin', date: today,
          title: daysAway === 0 ? 'Payday is today' : `Payday is in ${daysAway} ${daysAway === 1 ? 'day' : 'days'}`,
          detail: `${formatMoney(Number(paySettings.amount))} on ${formatDate(period.next, { weekday: 'long', month: 'short', day: 'numeric' })}. Your plan for it is ready.`,
          action: { label: 'Open paycheque planner', href: 'paycheque.html' }
        });
      }
    }

    // 4. Subscriptions: new ones and price increases
    (subscriptions || []).forEach(function(s) {
      if (!s.tracked && !(ignoredSubs || []).includes(s.key)) {
        out.push({
          key: `sub-new:${s.key}`, kind: 'tip', icon: 'ti-repeat', date: s.lastDate,
          title: `Recurring charge found: ${s.name}`,
          detail: `${formatMoney(s.amount)} ${s.frequency.label.toLowerCase()}, ${s.count} times so far. That's ${formatMoney(s.yearly)} a year, and it isn't set up as a bill.`,
          action: { label: 'Review subscriptions', href: 'subscriptions.html' }
        });
      }
      if (s.priceChange && s.priceChange.from < s.amount && daysBetween(s.priceChange.on, today) <= 60) {
        out.push({
          key: `sub-price:${s.key}:${s.priceChange.on}`, kind: 'headsup', icon: 'ti-trending-up', date: s.priceChange.on,
          title: `${s.name} went up ${formatMoney(s.amount - s.priceChange.from)}`,
          detail: `It's now ${formatMoney(s.amount)}, up from ${formatMoney(s.priceChange.from)}. That's ${formatMoney((s.amount - s.priceChange.from) * s.frequency.perYear)} more a year.`,
          action: { label: 'Review subscriptions', href: 'subscriptions.html' }
        });
      }
    });

    // 5. Categories trending up: last 3 full months vs the 3 before
    const lastFull = shiftMonth(month, -1);
    categories.forEach(function(c) {
      const series = categoryMonths(transactions, accounts, c.id, lastFull, 6);
      const before = (series[0].total + series[1].total + series[2].total) / 3;
      const recent = (series[3].total + series[4].total + series[5].total) / 3;
      if (before >= 50 && recent - before >= 30 && recent / before >= 1.15) {
        out.push({
          key: `trend-up:${c.id}:${lastFull}`, kind: 'headsup', icon: 'ti-chart-line', date: lastFull + '-01',
          title: `${c.name} is up ${Math.round((recent / before - 1) * 100)}% lately`,
          detail: `About ${formatMoney(recent)} a month over the last 3 months, up from ${formatMoney(before)} in the 3 before.`,
          action: { label: `See ${c.name} trend`, href: `reports.html#trends-${c.id}` },
          spark: series.map(function(m) { return m.total; })
        });
      }
    });

    // 6. Loans and savings goals passing 25 / 50 / 75 / 100%
    accounts.forEach(function(a) {
      const balance = accountBalance(a, transactions, today);
      if (balance === null) return;
      const target = Number(a.target_amount);
      const pct = a.kind === 'loan' ? ((target - balance) / target) * 100 : (balance / target) * 100;
      const step = [100, 75, 50, 25].find(function(s) { return pct >= s; });
      if (!step) return;
      const done = step === 100;
      out.push({
        key: `progress:${a.id}:${step}`, kind: 'win', icon: done ? 'ti-confetti' : 'ti-trophy', date: today,
        title: a.kind === 'loan'
          ? (done ? `${a.name} is paid off` : `${a.name} is ${step === 50 ? 'past halfway' : step + '% paid off'}`)
          : (done ? `You reached your ${a.name} goal` : `${a.name} is ${step}% of the way there`),
        detail: a.kind === 'loan'
          ? `${Math.floor(pct)}% paid off, ${formatMoney(balance)} to go.`
          : `${formatMoney(balance)} saved of ${formatMoney(target)}.`,
        action: { label: 'Open Savings', href: 'savings.html' }
      });
    });

    // 7. No-spend days this month
    const spendDays = new Set(transactions.filter(function(t) {
      return t.date.startsWith(month) && isSpending(t, accounts) && !isFixedCost(t, bills, accounts);
    }).map(function(t) { return t.date; }));
    let noSpend = 0;
    for (let d = 1; d <= day; d++) {
      if (!spendDays.has(`${month}-${String(d).padStart(2, '0')}`)) noSpend++;
    }
    if (noSpend >= 3 && transactions.some(function(t) { return t.date < month + '-01'; })) {
      out.push({
        key: `nospend:${month}:${noSpend}`, kind: 'win', icon: 'ti-calendar-check', date: today,
        title: `${noSpend} no-spend days so far in ${monthName(month)}`,
        detail: 'Days with no everyday spending (bills and loan payments not counted).',
        action: { label: 'Open the calendar', href: 'reports.html#calendar' }
      });
    }

    // 8. Nothing logged in a while
    const lastLogged = transactions.map(function(t) { return t.date; }).sort().pop();
    if (lastLogged && daysBetween(lastLogged, today) >= 3) {
      out.push({
        key: `stale:${lastLogged}`, kind: 'tip', icon: 'ti-pencil', date: today,
        title: `Nothing logged in ${daysBetween(lastLogged, today)} days`,
        detail: 'Catching up now keeps your limits and reports accurate.',
        action: { label: 'Add a transaction', href: 'transactions.html' }
      });
    }

    const order = { headsup: 0, tip: 1, win: 2 };
    return out.sort(function(a, b) {
      return order[a.kind] - order[b.kind] || (a.date < b.date ? 1 : -1);
    });
  }

  return {
    escapeHTML, formatMoney, signedMoney, money, cssVar,
    todayString, toDate, toDateString, addDays, daysBetween, addMonths, shiftMonth, monthEnd, monthsBetween,
    formatDate, shortDate, monthName, monthYear,
    getJSON, sendJSON, findCategory,
    isSavingsTransfer, isSpending, isFixedCost,
    BILL_FREQUENCIES, dueDatesBetween, billsBetween,
    accountBalance,
    PAY_FREQUENCIES, paydaysBetween, currentPayPeriod,
    detectSubscriptions, categoryMonths, buildInsights
  };
})();
