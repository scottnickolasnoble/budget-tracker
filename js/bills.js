let bills = [];
let categories = [];
let transactions = [];
let payments = [];

let viewMonth = todayString().slice(0, 7); // 'YYYY-MM' shown in the list and calendar
let selectedDay = todayString();           // day shown in the panel under the calendar
let showPaid = false;
let tableFilter = 'all';                   // 'all' or a category id
let tableSort = 'yearly';
let editingId = null;

const FREQUENCIES = {
  weekly:    { label: 'Weekly',         perYear: 52, days: 7 },
  biweekly:  { label: 'Every 2 weeks',  perYear: 26, days: 14 },
  monthly:   { label: 'Monthly',        perYear: 12, months: 1 },
  quarterly: { label: 'Every 3 months', perYear: 4,  months: 3 },
  yearly:    { label: 'Yearly',         perYear: 1,  months: 12 }
};

// ================= helpers =================

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

// ---- dates ----
// Every date in this file is a 'YYYY-MM-DD' string. The math is done in
// UTC so daylight-saving changes can never shift a day.
// Bonus: 'YYYY-MM-DD' strings sort correctly with < and >.

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

// Adds months but keeps the day sensible: Jan 31 + 1 month = Feb 28,
// and Feb 28 doesn't "stick" because we always count from the anchor.
function addMonths(dateString, months) {
  const [y, m, d] = dateString.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateString(new Date(Date.UTC(year, month, Math.min(d, lastDay))));
}

function monthStart(month) {
  return month + '-01';
}

function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return toDateString(new Date(Date.UTC(y, m, 0)));
}

function shiftMonth(month, offset) {
  return addMonths(monthStart(month), offset).slice(0, 7);
}

function monthLabel(month, style) {
  return toDate(monthStart(month)).toLocaleDateString('en-US', { month: style, year: 'numeric', timeZone: 'UTC' });
}

function shortDate(dateString) {
  return toDate(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ---- bill schedule ----

// The k-th due date of a bill (k = 0 is the anchor date).
function occurrence(bill, k) {
  const f = FREQUENCIES[bill.frequency];
  return f.days ? addDays(bill.anchor_date, k * f.days) : addMonths(bill.anchor_date, k * f.months);
}

// Every due date of a bill between start and end (inclusive).
function dueDatesBetween(bill, start, end) {
  const f = FREQUENCIES[bill.frequency];
  let k;
  if (f.days) {
    k = Math.floor(daysBetween(bill.anchor_date, start) / f.days);
  } else {
    const [ay, am] = bill.anchor_date.split('-').map(Number);
    const [sy, sm] = start.split('-').map(Number);
    k = Math.floor(((sy - ay) * 12 + (sm - am)) / f.months) - 1;
  }
  k = Math.max(0, k); // nothing before the first due date

  const dates = [];
  while (dates.length < 60) {
    const due = occurrence(bill, k);
    if (due > end) {
      break;
    }
    if (due >= start) {
      dates.push(due);
    }
    k++;
  }
  return dates;
}

function nextDueDate(bill) {
  const today = todayString();
  return dueDatesBetween(bill, today, addDays(today, 400))[0] ?? null;
}

function estimatedAmount(bill) {
  if (!bill.amount_varies) {
    return { amount: Number(bill.amount), count: 0 };
  }
  const today = todayString();
  const pastDues = dueDatesBetween(bill, addDays(today, -400), today).slice(-3);
  const amounts = [];

  pastDues.forEach(function(due) {
    let best = null;
    let bestGap = Infinity;
    transactions.forEach(function(t) {
      const value = Number(t.amount);
      if (t.category_id !== bill.category_id || value >= 0) {
        return;
      }
      const gap = Math.abs(daysBetween(due, t.date));
      if (gap <= 7 && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    });
    if (best) {
      amounts.push(Math.abs(Number(best.amount)));
    }
  });

  if (amounts.length === 0) {
    return { amount: Number(bill.amount), count: 0 };
  }
  const total = amounts.reduce(function(sum, a) { return sum + a; }, 0);
  return { amount: total / amounts.length, count: amounts.length };
}

// The amount to use for estimates everywhere on the page.
function billAmount(bill) {
  return bill.estimate ?? Number(bill.amount);
}

function perYear(bill) {
  return billAmount(bill) * FREQUENCIES[bill.frequency].perYear;
}

function findCategory(id) {
  return categories.find(function(category) { return category.id === Number(id); });
}

// ================= paid / due logic =================

// Looks for a transaction that pays this due date: same category, an
// expense, within 7 days either side, and close to the amount (within 10%,
// at least $1). Bills marked "amount varies" accept any amount.
function findMatchingTransaction(item, used) {
  const amount = Number(item.bill.amount);
  const tolerance = item.bill.amount_varies ? Infinity : Math.max(1, amount * 0.1);
  let best = null;
  let bestGap = Infinity;

  transactions.forEach(function(t) {
    const value = Number(t.amount);
    if (used.has(t.id) || t.category_id !== item.bill.category_id || value >= 0) {
      return;
    }
    if (Math.abs(Math.abs(value) - amount) > tolerance) {
      return;
    }
    const gap = Math.abs(daysBetween(item.due, t.date));
    if (gap <= 7 && gap < bestGap) {
      best = t;
      bestGap = gap;
    }
  });
  return best;
}

// Every due date in a month, each with a status:
// 'paid' | 'late' | 'soon' (next 7 days) | 'later'
function buildMonth(month) {
  const start = monthStart(month);
  const end = monthEnd(month);
  const today = todayString();

  const items = [];
  bills.forEach(function(bill) {
    dueDatesBetween(bill, start, end).forEach(function(due) {
      items.push({ bill, due });
    });
  });
  items.sort(function(a, b) {
    return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
  });

  // Earliest due dates claim transactions first, and each transaction can
  // only pay ONE bill, so two $65 bills can't both match the same payment.
  const used = new Set();
  items.forEach(function(item) {
    const manual = payments.find(function(p) {
      return p.bill_id === item.bill.id && p.due_date === item.due;
    });

    if (manual) {
		item.paidAmount = billAmount(item.bill);
      item.status = 'paid';
      item.manual = true;
      item.paidOn = manual.paid_on;
      item.paidAmount = Number(item.bill.amount);
    } else {
      const match = findMatchingTransaction(item, used);
      if (match) {
        used.add(match.id);
        item.status = 'paid';
        item.match = match;
        item.paidOn = match.date;
        item.paidAmount = Math.abs(Number(match.amount));
      }
    }

    if (item.status !== 'paid') {
      const diff = daysBetween(today, item.due);
      item.daysAway = diff;
      item.status = diff < 0 ? 'late' : diff <= 7 ? 'soon' : 'later';
    }
  });
  return items;
}

function statusText(item) {
  if (item.status === 'paid') {
    return 'Paid ' + shortDate(item.paidOn);
  }
  const d = item.daysAway;
  if (d < 0) {
    return d === -1 ? '1 day late' : `${-d} days late`;
  }
  if (d === 0) {
    return 'Due today';
  }
  if (d === 1) {
    return 'Tomorrow';
  }
  return `In ${d} days`;
}

function billNote(item) {
  if (item.match) {
    return 'Matched: ' + escapeHTML(item.match.description);
  }
  if (item.manual) {
    return 'Marked paid';
  }
  const parts = [FREQUENCIES[item.bill.frequency].label];
  if (item.bill.autopay) {
    parts.push('Auto-pay');
  }
  if (item.bill.amount_varies) {
    parts.push(item.bill.estimateCount
      ? `Avg of last ${item.bill.estimateCount}`
      : 'Amount varies');
  }
  return parts.join(' · ');
}

function amountText(bill) {
  return (bill.amount_varies ? '~' : '') + formatMoney(billAmount(bill));
}

function pill(name, color) {
  return `<span class="sl-pill"><span class="sl-dot" style="background:${escapeHTML(color)};"></span>${escapeHTML(name)}</span>`;
}

// ================= rendering =================

function renderSummary(items) {
  const unpaid = items.filter(function(i) { return i.status !== 'paid'; });
  const paid = items.filter(function(i) { return i.status === 'paid'; });
  const late = items.filter(function(i) { return i.status === 'late'; });

  const leftTotal = unpaid.reduce(function(sum, i) { return sum + billAmount(i.bill); }, 0);
  const paidTotal = paid.reduce(function(sum, i) { return sum + i.paidAmount; }, 0);
  const yearly = bills.reduce(function(sum, b) { return sum + perYear(b); }, 0);

  document.getElementById('bl-left-label').textContent = 'Left to pay in ' + monthLabel(viewMonth, 'long').split(' ')[0];
  document.getElementById('bl-left').textContent = formatMoney(leftTotal);
  const leftNote = document.getElementById('bl-left-note');
  leftNote.textContent = `${unpaid.length} ${unpaid.length === 1 ? 'bill' : 'bills'}` + (late.length ? ` · ${late.length} overdue` : '');
  leftNote.classList.toggle('bl-negative', late.length > 0);

  document.getElementById('bl-paid').textContent = formatMoney(paidTotal);
  document.getElementById('bl-paid-bar').style.width = items.length ? (paid.length / items.length) * 100 + '%' : '0%';
  document.getElementById('bl-paid-note').textContent = `${paid.length} of ${items.length} bills`;

  document.getElementById('bl-per-month').textContent = formatMoney(yearly / 12);
  document.getElementById('bl-per-month-note').textContent = `${bills.length} ${bills.length === 1 ? 'bill' : 'bills'}, yearly ones spread out`;
  document.getElementById('bl-per-year').textContent = formatMoney(yearly);

  const biggest = bills.slice().sort(function(a, b) { return perYear(b) - perYear(a); })[0];
  document.getElementById('bl-biggest').textContent = biggest
    ? `Biggest: ${biggest.name} (${Math.round((perYear(biggest) / yearly) * 100)}%)`
    : '';
}

function upcomingRow(item) {
  const day = item.due.slice(8, 10).replace(/^0/, '');
  const mon = toDate(item.due).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  let action = '';
  if (item.status !== 'paid') {
    action = `<button type="button" class="btn btn-secondary bl-row-btn" data-action="pay" data-bill-id="${item.bill.id}" data-due="${item.due}">Mark paid</button>`;
  } else if (item.manual) {
    action = `<button type="button" class="btn btn-secondary bl-row-btn" data-action="unpay" data-bill-id="${item.bill.id}" data-due="${item.due}">Undo</button>`;
  }
  return `
    <div class="bl-row">
      <div class="bl-date"><span>${mon}</span><strong>${day}</strong></div>
      <div class="bl-row-main">
        <p class="bl-row-name">${escapeHTML(item.bill.name)}</p>
        <p class="bl-row-meta"><span class="sl-dot" style="background:${escapeHTML(item.bill.category_color)};"></span>${escapeHTML(item.bill.category_name)} · ${billNote(item)}</p>
      </div>
      <div class="bl-row-end">
        <span class="bl-row-amount">${amountText(item.bill)}</span>
        <span class="bl-chip bl-chip-${item.status}">${statusText(item)}</span>
      </div>
      ${action}
    </div>
  `;
}

function upcomingGroup(title, rows, extraClass) {
  if (rows.length === 0) {
    return '';
  }
  const total = rows.reduce(function(sum, i) { return sum + billAmount(i.bill); }, 0);
  return `
    <section class="bl-group">
      <div class="bl-group-head">
        <h2 class="${extraClass ?? ''}">${title}</h2>
        <span class="text-soft">${rows.length} ${rows.length === 1 ? 'bill' : 'bills'} · ${formatMoney(total)}</span>
      </div>
      <div class="card bl-rows">${rows.map(upcomingRow).join('')}</div>
    </section>
  `;
}

function renderUpcoming(items) {
  const container = document.getElementById('bl-upcoming');

  if (bills.length === 0) {
    container.innerHTML = `
      <div class="card bl-empty">
        <p class="text-soft">No bills yet. Add your rent, phone, subscriptions and anything else that repeats.</p>
        <button type="button" class="btn btn-primary" data-action="add">+ Add bill</button>
      </div>
    `;
    return;
  }

  const byStatus = function(status) {
    return items.filter(function(i) { return i.status === status; });
  };
  const paid = byStatus('paid');
  const paidTotal = paid.reduce(function(sum, i) { return sum + i.paidAmount; }, 0);

  let html = upcomingGroup('Overdue', byStatus('late'), 'bl-negative')
    + upcomingGroup('Next 7 days', byStatus('soon'))
    + upcomingGroup('Coming up', byStatus('later'));

  if (html === '') {
    html = `<div class="card bl-empty"><p class="text-soft">Nothing left to pay in ${monthLabel(viewMonth, 'long')}.</p></div>`;
  }

  if (paid.length) {
    html += `
      <button type="button" class="card bl-paid-toggle" data-action="toggle-paid" aria-expanded="${showPaid}">
        <span>Paid <span class="text-soft">· ${paid.length} ${paid.length === 1 ? 'bill' : 'bills'} · ${formatMoney(paidTotal)}</span></span>
        <i class="ti ${showPaid ? 'ti-chevron-up' : 'ti-chevron-down'}" aria-hidden="true"></i>
      </button>
    `;
    if (showPaid) {
      html += `<div class="card bl-rows">${paid.map(upcomingRow).join('')}</div>`;
    }
  }

  container.innerHTML = html;
}

function renderCalendar(items) {
  document.getElementById('bl-cal-title').textContent = monthLabel(viewMonth, 'long');

  const start = monthStart(viewMonth);
  const end = monthEnd(viewMonth);
  const today = todayString();
  const blanks = toDate(start).getUTCDay(); // 0 = Sunday
  const daysInMonth = Number(end.slice(8, 10));

  const txDays = new Set(transactions.map(function(t) { return t.date; }));

  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function(letter) {
    return `<span class="bl-weekday" aria-hidden="true">${letter}</span>`;
  }).join('');

  for (let i = 0; i < blanks; i++) {
    html += '<span></span>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${viewMonth}-${String(d).padStart(2, '0')}`;
    const dots = items
      .filter(function(i) { return i.due === date; })
      .slice(0, 3)
      .map(function(i) { return `<span class="bl-dot-${i.status === 'paid' ? 'paid' : i.status === 'late' ? 'late' : 'due'}"></span>`; })
      .join('');
    const classes = ['bl-day-btn'];
    if (date === today) classes.push('is-today');
    if (date === selectedDay) classes.push('is-selected');
    if (date < today) classes.push('is-past');
    if (txDays.has(date)) classes.push('has-tx');

    html += `
      <button type="button" class="${classes.join(' ')}" data-date="${date}" aria-pressed="${date === selectedDay}" aria-label="${shortDate(date)}">
        <span>${d}</span>
        <span class="bl-dots">${dots}</span>
      </button>
    `;
  }

  document.getElementById('bl-cal-grid').innerHTML = html;
}

function renderDayPanel(items) {
  const panel = document.getElementById('bl-day');
  const today = todayString();
  const weekday = toDate(selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

  const dayItems = items.filter(function(i) { return i.due === selectedDay; });
  const dayTx = transactions.filter(function(t) { return t.date === selectedDay; });

  // Which bill did each transaction pay? (for the "· paid Hydro" note)
  const paidBy = {};
  items.forEach(function(i) {
    if (i.match) {
      paidBy[i.match.id] = i.bill.name;
    }
  });

  const spent = dayTx.reduce(function(sum, t) {
    const value = Number(t.amount);
    return value < 0 ? sum + Math.abs(value) : sum;
  }, 0);

  const billsHTML = dayItems.length
    ? dayItems.map(function(i) {
        return `
          <div class="bl-day-bill">
            <span class="sl-dot" style="background:${escapeHTML(i.bill.category_color)};"></span>
            <span class="bl-day-name">${escapeHTML(i.bill.name)}</span>
            <span class="bl-mono">${amountText(i.bill)}</span>
            <span class="bl-chip bl-chip-${i.status}">${statusText(i)}</span>
          </div>
        `;
      }).join('')
    : '<p class="text-soft bl-small">No bills due this day.</p>';

  const txHTML = dayTx.length
    ? dayTx.map(function(t) {
        const category = findCategory(t.category_id);
        const value = Number(t.amount);
        const note = paidBy[t.id] ? ` · paid ${escapeHTML(paidBy[t.id])}` : '';
        return `
          <div class="bl-day-tx">
            <div class="bl-day-tx-main">
              <p>${escapeHTML(t.description)}</p>
              <p class="text-soft"><span class="sl-dot" style="background:${escapeHTML(category?.color ?? '#B4B2A9')};"></span>${escapeHTML(category?.name ?? 'Uncategorized')}${note}</p>
            </div>
            <span class="bl-mono ${value > 0 ? 'bl-positive' : ''}">${value < 0 ? '−' : '+'}${formatMoney(value)}</span>
          </div>
        `;
      }).join('')
    : `<p class="text-soft bl-small">${selectedDay > today ? 'This day hasn’t happened yet.' : 'Nothing logged this day.'}</p>`;

  panel.innerHTML = `
    <div class="bl-day-head">
      <h3>${weekday}</h3>
      ${selectedDay === today ? '<span class="bl-today-tag">Today</span>' : ''}
    </div>
    <div class="bl-day-section">
      <p class="bl-stat-label">Bills due</p>
      ${billsHTML}
    </div>
    <div class="bl-day-section bl-day-split">
      <div class="bl-day-section-head">
        <p class="bl-stat-label">Transactions</p>
        <span class="text-soft bl-small">${spent > 0 ? formatMoney(spent) + ' spent' : ''}</span>
      </div>
      ${txHTML}
    </div>
    <div class="bl-day-actions">
      <a class="btn btn-secondary" href="transactions.html?date=${selectedDay}">Open in Transactions</a>
      <a class="btn btn-primary" href="transactions.html?date=${selectedDay}&add=1">+ Add transaction</a>
    </div>
  `;
}

function renderFilters() {
  const used = [];
  bills.forEach(function(b) {
    if (!used.some(function(u) { return u.id === b.category_id; })) {
      used.push({ id: b.category_id, name: b.category_name });
    }
  });
  used.sort(function(a, b) { return a.name.localeCompare(b.name); });

  // If the filtered category no longer has bills, go back to All.
  if (tableFilter !== 'all' && !used.some(function(u) { return u.id === tableFilter; })) {
    tableFilter = 'all';
  }

  const chip = function(value, label) {
    const active = tableFilter === value;
    return `<button type="button" class="bl-filter${active ? ' is-active' : ''}" data-filter="${value}" aria-pressed="${active}">${label}</button>`;
  };

  document.getElementById('bl-filters').innerHTML = chip('all', `All ${bills.length}`)
    + used.map(function(u) { return chip(u.id, escapeHTML(u.name)); }).join('');
}

function renderTable() {
  const today = todayString();
  let rows = bills.filter(function(b) {
    return tableFilter === 'all' || b.category_id === tableFilter;
  }).map(function(b) {
    return { bill: b, next: nextDueDate(b), yearly: perYear(b) };
  });

  rows.sort(function(a, b) {
    if (tableSort === 'name') {
      return a.bill.name.localeCompare(b.bill.name);
    }
    if (tableSort === 'next') {
      return (a.next ?? '9999') < (b.next ?? '9999') ? -1 : 1;
    }
    return b.yearly - a.yearly;
  });

  const body = document.getElementById('bl-table-body');
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="text-soft">No bills yet.</td></tr>';
  } else {
    body.innerHTML = rows.map(function(r) {
      const b = r.bill;
      const soon = r.next && daysBetween(today, r.next) <= 7;
      const notes = [b.autopay ? 'Auto-pay' : 'Manual'];
      if (b.amount_varies) {
        notes.push('amount varies');
      }
      return `
        <tr>
          <td data-label="Bill"><strong>${escapeHTML(b.name)}</strong><span class="bl-table-note">${notes.join(' · ')}</span></td>
          <td data-label="Category">${pill(b.category_name, b.category_color)}</td>
          <td data-label="How often" class="text-soft">${FREQUENCIES[b.frequency].label}</td>
          <td data-label="Amount" class="bl-num bl-mono">${amountText(b)}</td>
          <td data-label="Per month" class="bl-num bl-mono text-soft">${formatMoney(r.yearly / 12)}</td>
          <td data-label="Per year" class="bl-num bl-mono"><strong>${formatMoney(r.yearly)}</strong></td>
          <td data-label="Next due" class="${soon ? 'bl-soon-text' : ''}">${r.next ? shortDate(r.next) : '—'}</td>
          <td data-label="" class="bl-num">
            <button type="button" class="sl-edit-btn" data-action="edit" data-bill-id="${b.id}" aria-label="Edit ${escapeHTML(b.name)}">
              <i class="ti ti-pencil" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const yearly = rows.reduce(function(sum, r) { return sum + r.yearly; }, 0);
  document.getElementById('bl-all-total').textContent = rows.length
    ? `${formatMoney(yearly / 12)} a month · ${formatMoney(yearly)} a year`
    : '';
  document.getElementById('bl-table-foot').innerHTML = rows.length
    ? `<tr><td colspan="4"><strong>Total</strong></td><td class="bl-num bl-mono"><strong>${formatMoney(yearly / 12)}</strong></td><td class="bl-num bl-mono"><strong>${formatMoney(yearly)}</strong></td><td colspan="2"></td></tr>`
    : '';
}

function render() {
	bills.forEach(function(b) {
    const result = estimatedAmount(b);
    b.estimate = result.amount;
    b.estimateCount = result.count;
  });
  const items = buildMonth(viewMonth);
  document.getElementById('bl-month-label').textContent = monthLabel(viewMonth, 'long');
  renderSummary(items);
  renderUpcoming(items);
  renderCalendar(items);
  renderDayPanel(items);
  renderFilters();
  renderTable();
}

// ================= add / edit form =================

function fillCategoryOptions(selectedId) {
  document.getElementById('bl-category').innerHTML = '<option value="">Choose a category</option>'
    + categories.map(function(c) {
        return `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${escapeHTML(c.name)}</option>`;
      }).join('');
}

function updateMatchHint() {
  const category = findCategory(document.getElementById('bl-category').value);
  const amount = Number(document.getElementById('bl-amount').value);
  const varies = document.getElementById('bl-varies').checked;
  const hint = document.getElementById('bl-match-hint');
  if (!category) {
    hint.textContent = 'Pick the category you log this bill’s payments under.';
    return;
  }
  hint.textContent = varies || !amount
    ? `Any ${category.name} expense within a week of the due date marks it paid.`
    : `A ${category.name} expense close to ${formatMoney(amount)} within a week of the due date marks it paid.`;
}

function openForm(bill) {
  editingId = bill ? bill.id : null;
  document.getElementById('bl-modal-title').textContent = bill ? 'Edit bill' : 'Add bill';
  document.getElementById('bl-name').value = bill ? bill.name : '';
  document.getElementById('bl-amount').value = bill ? Number(bill.amount) : '';
  fillCategoryOptions(bill ? bill.category_id : null);
  document.getElementById('bl-frequency').value = bill ? bill.frequency : 'monthly';
  // Editing: show the next due date, so changing nothing keeps the schedule.
  document.getElementById('bl-anchor').value = bill ? (nextDueDate(bill) ?? bill.anchor_date) : todayString();
  document.getElementById('bl-autopay').checked = bill ? bill.autopay : false;
  document.getElementById('bl-varies').checked = bill ? bill.amount_varies : false;
  document.getElementById('bl-delete-btn').hidden = !bill;
  document.getElementById('bl-form-error').textContent = categories.length === 0
    ? 'Create a category first on the Categories page.'
    : '';
  updateMatchHint();
  document.getElementById('bl-modal').hidden = false;
  document.getElementById('bl-name').focus();
}

function closeForm() {
  document.getElementById('bl-modal').hidden = true;
  editingId = null;
}

async function saveForm(event) {
  event.preventDefault();
  const errorBox = document.getElementById('bl-form-error');
  errorBox.textContent = '';

  const body = {
    name: document.getElementById('bl-name').value,
    amount: document.getElementById('bl-amount').value,
    categoryId: document.getElementById('bl-category').value,
    frequency: document.getElementById('bl-frequency').value,
    anchorDate: document.getElementById('bl-anchor').value,
    autopay: document.getElementById('bl-autopay').checked,
    amountVaries: document.getElementById('bl-varies').checked
  };

  const response = await fetch(editingId === null ? '/api/bills' : `/api/bills/${editingId}`, {
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
  await Promise.all([loadBills(), loadPayments()]);
  render();
}

async function deleteBill() {
  const bill = bills.find(function(b) { return b.id === editingId; });
  if (!bill || !confirm(`Delete "${bill.name}"? Your transactions stay, only this bill is removed.`)) {
    return;
  }
  const response = await fetch(`/api/bills/${editingId}`, { method: 'DELETE' });
  if (!response.ok) {
    document.getElementById('bl-form-error').textContent = 'Could not delete. Try again.';
    return;
  }
  closeForm();
  await Promise.all([loadBills(), loadPayments()]);
  render();
}

async function setPaid(billId, dueDate, paid) {
  const response = paid
    ? await fetch(`/api/bills/${billId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate })
      })
    : await fetch(`/api/bills/${billId}/payments/${dueDate}`, { method: 'DELETE' });

  if (!response.ok) {
    alert('Could not update that bill. Try again.');
    return;
  }
  await loadPayments();
  render();
}

// ================= events =================

document.getElementById('bl-add-btn').addEventListener('click', function() { openForm(null); });

document.getElementById('bl-prev-month').addEventListener('click', function() {
  viewMonth = shiftMonth(viewMonth, -1);
  selectedDay = viewMonth === todayString().slice(0, 7) ? todayString() : monthStart(viewMonth);
  render();
});

document.getElementById('bl-next-month').addEventListener('click', function() {
  viewMonth = shiftMonth(viewMonth, 1);
  selectedDay = viewMonth === todayString().slice(0, 7) ? todayString() : monthStart(viewMonth);
  render();
});

// One listener for every button the page draws.
document.querySelector('.main-content').addEventListener('click', function(event) {
  const day = event.target.closest('.bl-day-btn');
  if (day) {
    selectedDay = day.dataset.date;
    render();
    return;
  }

  const filter = event.target.closest('[data-filter]');
  if (filter) {
    tableFilter = filter.dataset.filter === 'all' ? 'all' : Number(filter.dataset.filter);
    renderFilters();
    renderTable();
    return;
  }

  const button = event.target.closest('[data-action]');
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  if (action === 'pay' || action === 'unpay') {
    button.disabled = true;
    setPaid(Number(button.dataset.billId), button.dataset.due, action === 'pay');
  } else if (action === 'toggle-paid') {
    showPaid = !showPaid;
    render();
  } else if (action === 'edit') {
    openForm(bills.find(function(b) { return b.id === Number(button.dataset.billId); }));
  } else if (action === 'add') {
    openForm(null);
  }
});

document.getElementById('bl-sort').addEventListener('change', function() {
  tableSort = this.value;
  renderTable();
});

['bl-category', 'bl-amount', 'bl-varies'].forEach(function(id) {
  document.getElementById(id).addEventListener('input', updateMatchHint);
});
document.getElementById('bl-form').addEventListener('submit', saveForm);
document.getElementById('bl-cancel-btn').addEventListener('click', closeForm);
document.getElementById('bl-delete-btn').addEventListener('click', deleteBill);

document.getElementById('bl-modal').addEventListener('click', function(event) {
  if (event.target === this) {
    closeForm();
  }
});
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !document.getElementById('bl-modal').hidden) {
    closeForm();
  }
});

// ================= loading =================

async function getJSON(url) {
  const response = await fetch(url);
  if (response.status === 401) {
    window.location.href = 'login.html';
    return [];
  }
  return response.json();
}

async function loadBills() { bills = await getJSON('/api/bills'); }
async function loadPayments() { payments = await getJSON('/api/bills/payments'); }
async function loadCategories() { categories = await getJSON('/api/categories'); }
async function loadTransactions() { transactions = await getJSON('/api/transactions'); }

async function init() {
  await Promise.all([loadBills(), loadPayments(), loadCategories(), loadTransactions()]);
  render();
}

init();
