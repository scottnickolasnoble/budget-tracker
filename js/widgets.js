// "current" = the month chosen in the dashboard's month picker (defaults to today's month)
// "previous" = the month before that
function getDate(condition){
  if (condition === 'current') {
    return selectedMonth;
  }
  const [year, month] = selectedMonth.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

function escapeHTML(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// 1234.5 -> "$1,234.50". Always positive; widgets add their own +/- sign.
function formatMoney(amount) {
  return '$' + Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// shiftMonth("2026-10", -1) -> "2026-09". Handles year changes:
// shiftMonth("2026-01", -1) -> "2025-12".
function shiftMonth(month, offset) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// monthName("2026-10", "short") -> "Oct"   |   "long" -> "October"
function monthName(month, style) {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-US', { month: style });
}

// "2026-10-19" -> "Oct 19". Built from parts so it never shifts a day
// because of time zones.
function shortDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

// Reads a CSS variable's real value. Chart.js needs actual colors like
// "#A34A3C", not "var(--negative)".
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Income and expense totals for one month.
function totalsForMonth(transactions, month) {
  return transactions.reduce(function(totals, t) {
    if (!t.date.startsWith(month)) {
      return totals;
    }
    const amount = Number(t.amount);
    if (amount > 0) {
      totals.income += amount;
    } else {
      totals.expense += Math.abs(amount);
    }
    return totals;
  }, { income: 0, expense: 0 });
}

// Spending per category for one month: { "3": 340.5, "7": 120 }
function spendingByCategory(transactions, month) {
  return transactions.reduce(function(totals, t) {
    const amount = Number(t.amount);
    if (!t.date.startsWith(month) || amount >= 0) {
      return totals;
    }
    totals[t.category_id] = (totals[t.category_id] ?? 0) + Math.abs(amount);
    return totals;
  }, {});
}

// Finds a category by id. Number() because object keys are always strings.
function findCategory(categories, id) {
  return categories.find(function(category) {
    return category.id === Number(id);
  });
}

// The icon + uppercase label row every widget starts with.
function widgetLabel(icon, text) {
  return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
      <i class="ti ${icon}" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
      <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">${text}</p>
    </div>
  `;
}

// Colored category pill, same style as Top category.
function tagPill(name, color) {
  return `<span style="display:inline-block; background:${escapeHTML(color)}; color:white; font-size:12px; font-weight:500; padding:3px 10px; border-radius:999px; white-space:nowrap;">${escapeHTML(name)}</span>`;
}

// Soft grey message for empty states.
function emptyMessage(text) {
  return `<p style="font-size:14px; color:var(--ink-soft); margin:0;">${text}</p>`;
}

// "↑ 12.4% vs September" with the right color.
// upIsGood = true for income (more is good), false for spending.
function changeBadge(current, previous, upIsGood) {
  if (previous === 0) {
    return `<p style="font-size:13px; color:var(--ink-soft); margin:6px 0 0;">Nothing to compare from last month</p>`;
  }
  const change = ((current - previous) / previous) * 100;
  const isUp = change >= 0;
  let color = 'var(--ink-soft)';
  if (change !== 0) {
    color = (isUp === upIsGood) ? 'var(--positive)' : 'var(--negative)';
  }
  const icon = isUp ? 'ti-arrow-up-right' : 'ti-arrow-down-right';
  return `
    <p style="display:flex; align-items:center; gap:4px; font-size:13px; font-weight:600; color:${color}; margin:6px 0 0;">
      <i class="ti ${icon}" aria-hidden="true"></i>${Math.abs(change).toFixed(1)}% vs ${monthName(getDate('previous'), 'long')}
    </p>
  `;
}

const widgetCatalog = {
  cashBalance: {
    label: 'Cash balance',
	section: 'snapshot',
	description: "Your total across cash transactions",
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      const cashTransactions = transactions.filter(function(transaction) {
        return transaction.paymentmethod === 'cash';
      });
      const total = cashTransactions.reduce(function(sum, transaction) {
        return sum + Number(transaction.amount);
      }, 0);
      return { total };
    },
render: function(data) {
    const formatted = data.total < 0
        ? `-$${Math.abs(data.total).toFixed(2)}`
        : `$${data.total.toFixed(2)}`;
    return `
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
            <i class="ti ti-wallet" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
            <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Cash balance</p>
        </div>
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">${formatted}</p>
    `;
}
  },
  monthlySpending: {
	  label: 'Monthly Spending',
	  section: 'snapshot',
	  description: 'Your total monthly spending across all transactions',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		const currDate = getDate("current");
		const monthlySpending = transactions.filter(function(transaction){
			return transaction.date.startsWith(currDate) && Number(transaction.amount) < 0;
		});
		const total = monthlySpending.reduce(function(sum, transaction){
			return sum + Number(transaction.amount);
		},0);
		return { total };
	  },
	render: function(data){
    const formatted = Math.abs(data.total).toFixed(2);
    return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <i class="ti ti-calendar" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
        <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Monthly spending</p>
    </div>
    <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">$${formatted}</p>
    `;
}
	  
  },
  creditAccrued: {
	  label: 'Credit Accrued',
	  section: 'snapshot',
	  description: 'Your total transactions that use credit',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate("current");
		  
		  const creditAccrued = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && transaction.paymentmethod.toLowerCase() === "credit" && Number(transaction.amount) < 0;
		  });
		  const total = creditAccrued.reduce(function(sum, transaction){
			  return sum + Number(transaction.amount);
		  },0);
		  return { total };
	  },
render: function(data){
    const formatted = Math.abs(data.total).toFixed(2);
    return `
    <div style="background:var(--negative-bg); margin:-1rem; padding:1rem; border-radius:var(--radius);">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
            <i class="ti ti-credit-card" style="font-size:15px; color:var(--negative);" aria-hidden="true"></i>
            <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--negative); margin:0;">Credit accrued</p>
        </div>
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--negative); margin:0;">$${formatted}</p>
    </div>
    `;
}
  },
  topCategory: {
	  label: 'Top Category',
	  section: 'categoryInsights',
	  description: 'Your top transaction in a specific category',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const excludedIds = config.excludedCategoryIds ?? [];
		  const currDate = getDate("current");
		  const topCategoryMonth = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && Number(transaction.amount) < 0 && !excludedIds.includes(transaction.category_id);
		  });
		  const categoriesSorted = topCategoryMonth.reduce(function(sum ,transaction){
			 if(!sum[transaction.category_id]){
				 sum[transaction.category_id] = 0;
			 }
			 sum[transaction.category_id] += Number(transaction.amount);
			 return sum;
		  },{});
		  
		   if(Object.entries(categoriesSorted).length === 0){
			return {
				name: 'No Data yet',
				color: 'var(--text-secondary)',
				total: 0
			};
		   } 
		   
		   const topCategory = Object.entries(categoriesSorted).reduce(function(sum, current){
			return Math.abs(current[1]) > Math.abs(sum[1]) ? current : sum;
		   });
		   
		
		const matchingCategory = categories.find(function(category){
			return category.id === Number(topCategory[0]);
		});
		
		return {
			name: matchingCategory?.name ?? 'Uncategorized',
			color: matchingCategory?.color ?? 'var(--accent)',
			total: topCategory[1]
		};
	  },
render: function(data){
    const formatted = Math.abs(data.total).toFixed(2);
    return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <i class="ti ti-tag" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
        <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Top category</p>
    </div>
    <span style="display:inline-block; background:${data.color}; color:white; font-size:12px; font-weight:500; padding:3px 10px; border-radius:999px; margin:0 0 8px;">${data.name}</span>
    <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">$${formatted}</p>
    `;
},
	  renderConfig: function(currentConfig, categories){
		  const excludedIds = currentConfig.excludedCategoryIds ?? [];
		  const checkboxes = categories.map(function(category){
			  const isChecked = !excludedIds.includes(category.id) ? 'checked' : ''
			  return `<label style="display:flex; align-items:center; gap:8px; font-weight:400; margin-bottom:6px;"><input type="checkbox" data-category-id="${category.id}" ${isChecked} style="width:auto;"> ${category.name}</label>`;
		  });
		  return `<div class="field"><label>Exclude categories</label>` + checkboxes.join('') + `</div>`;
	  }
  }, 
  incomeVsExpenses: {
	  label: 'Income Vs Expenses',
	  section: 'trends',
	  description: 'Income vs expenses trends',
	  defaultSpan: 2,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const currMonthTransactions = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate);
		  });
		  const incomeVsExpenses = currMonthTransactions.reduce(function(sum, current){
			  if(current.amount < 0){
				  sum.expense += Math.abs(current.amount);
			  } else {
				  sum.income += Number(current.amount);
			  }
			  return sum;
		  }, {income: 0, expense: 0});
		  return incomeVsExpenses;
	  },
render: function(data){
  const net = data.income - data.expense;
  const netSign = net >= 0 ? '+' : '-';
  const netColor = net >= 0 ? 'var(--positive)' : 'var(--negative)';

  const largest = Math.max(data.income, data.expense);
  const incomeWidth = largest === 0 ? 0 : (data.income / largest) * 100;
  const expenseWidth = largest === 0 ? 0 : (data.expense / largest) * 100;

  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--space-5); flex-wrap:wrap;">
      <div>
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
          <i class="ti ti-arrows-exchange" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
          <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Income vs expenses</p>
        </div>
        <p style="font-size:11px; color:var(--ink-soft); margin:0 0 2px;">Net this month</p>
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:${netColor}; margin:0;">${netSign}$${Math.abs(net).toFixed(2)}</p>
      </div>

      <div style="flex:1; min-width:200px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
          <span style="color:var(--ink-soft);">Income</span>
          <span style="font-family:var(--font-mono); color:var(--positive);">$${data.income.toFixed(2)}</span>
        </div>
        <div style="height:8px; background:var(--paper); border-radius:4px; overflow:hidden; margin-bottom:10px;">
          <div style="width:${incomeWidth}%; height:100%; background:var(--positive);"></div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
          <span style="color:var(--ink-soft);">Expenses</span>
          <span style="font-family:var(--font-mono); color:var(--negative);">$${data.expense.toFixed(2)}</span>
        </div>
        <div style="height:8px; background:var(--paper); border-radius:4px; overflow:hidden;">
          <div style="width:${expenseWidth}%; height:100%; background:var(--negative);"></div>
        </div>
      </div>
    </div>
  `;
}
  },
  paymentSplit: {
	  label: 'Payment Split',
	  section: 'trends',
	  description: 'Your cash vs credit transactions',
	  defaultSpan: 2,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const transactionsFiltered = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && Number(transaction.amount) < 0;
		  });
		  const total = transactionsFiltered.reduce(function(sum,current){
			  sum[current.paymentmethod] += Math.abs(current.amount);
			  return sum;
		  },{credit:0, cash:0});
		  
		  return total;
	  },
render: function(data){
    const creditPercent = data.credit === 0 ? 0 : (data.credit / (data.credit + data.cash)) * 100;
    const cashPercent = data.cash === 0 ? 0 : (data.cash / (data.credit + data.cash)) * 100;
    return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
        <i class="ti ti-chart-pie" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
        <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Payment split</p>
    </div>
    <div style="display:flex; height:8px; border-radius:4px; overflow:hidden; margin-bottom:8px; background:var(--line);">
        <div style="width:${creditPercent}%; background:var(--accent);"></div>
        <div style="width:${cashPercent}%; background:var(--ink-soft);"></div>
    </div>
    <div style="display:flex; gap:16px; font-size:12px; color:var(--ink-soft);">
        <span>Credit ${Number(creditPercent.toFixed(2))}%</span>
        <span>Cash ${Number(cashPercent.toFixed(2))}%</span>
    </div>
    `;
}
  },
  biggestTransaction: {
	  label: 'Biggest Transaction',
	  section: 'trends',
	  description: 'Largest transaction this month',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){

		  const currDate = getDate('current');
		  const filteredTransactions = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && Number(transaction.amount) < 0;
		  });
		  	if (filteredTransactions.length === 0) {
			return { description: 'No expenses yet', amount: 0 };
			}
		  const biggestTransaction = filteredTransactions.reduce(function(sum,current){
			 return Math.abs(sum.amount) > Math.abs(current.amount) ? sum : current; 
		  });
		  return {
			  description: biggestTransaction.description,
			  amount: biggestTransaction.amount
		  }
	  },
render: function(data){
    return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <i class="ti ti-star" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
        <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Biggest transaction</p>
    </div>
    <p style="font-size:14px; font-weight:500; color:var(--ink); margin:0 0 2px;">${data.description}</p>
    <p style="font-family:var(--font-mono); font-size:19px; font-weight:500; color:var(--ink); margin:0;">$${Math.abs(data.amount).toFixed(2)}</p>
    `;
}
  },
  avgTransaction: {
	  label: 'Average Transaction',
	  section: 'snapshot',
	  description: 'Your average transaction cost across all transactions',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const filteredTransactions = transactions.filter(function(transaction){
			 return transaction.date.startsWith(currDate) && Number(transaction.amount) < 0; 
		  });
		  const total = filteredTransactions.reduce(function(sum,current){
			  sum += Math.abs(current.amount);
			  return sum;
		  },0);
		 const avgTransaction = filteredTransactions.length === 0 ? 0 : total / filteredTransactions.length;
		 
		 return { avgTransaction };
	  },
render: function(data){
    const formatted = data.avgTransaction.toFixed(2);
    return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <i class="ti ti-receipt" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
        <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Average transaction</p>
    </div>
    <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">$${formatted}</p>
    `;
}
  },
  savingsRate: {
	  label: 'Savings Rate',
	  section: 'snapshot',
	  description: 'Percent of income you kept this month',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const currMonthTransactions = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate);
		  });
		  const total = currMonthTransactions.reduce(function(sum,current){
			  if(current.amount > 0){
				  sum.income += Number(current.amount);
			  } else {
				  sum.expense += Math.abs(Number(current.amount));
			  }
			  return sum;
		  },{income:0,expense:0});
		 if(total.income === 0){
			 return { savingsRate: 0, hasIncome: false };
		 } 
		 
		 const savingsRate = ((total.income-total.expense)/total.income)*100;
		 return { savingsRate, hasIncome: true };
	  },
	  render: function(data){
		const color = data.savingsRate >= 0 ? 'var(--positive)' : 'var(--negative)';
		const value = data.hasIncome ? `${data.savingsRate.toFixed(1)}%` : 'No income yet';

		return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
			<i class="ti ti-pig-money" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
			<p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Savings rate</p>
			</div>
			<p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:${data.hasIncome ? color : 'var(--ink-soft)'}; margin:0;">${value}</p>
  `;
}
  }, 
  transactionCount: {
	  label: 'Transaction Count',
	  section: 'snapshot',
	  description: 'Amount of transactions this month',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const filteredTransactions = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate);
		  });
		  const totalTransactions = filteredTransactions.reduce(function(sum,current){
			  if(current.amount < 0){
				  sum++;
			  }
			  return sum;
		  },0)
		  return { totalTransactions };
	  }, 
	  render: function(data){
		const value = data.totalTransactions ? `${data.totalTransactions}` : 'No transactions yet';
		return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
			<i class="ti ti-hash" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
			<p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Transaction count</p>
			</div>
			<p style="font-family:var(--font-mono); font-size:22px; font-weight:500;margin:0;">${value}</p>
  `;  
	  }
  },
  mostFrequentCategory: {
	  label: 'Most frequent category',
	  section: 'categoryInsights',
	  description: 'Most frequent category used on transactions',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		 const currDate = getDate('current');
		const filteredTransactions = transactions.filter(function(transaction){
			return transaction.date.startsWith(currDate);
		});
		
		const transactionFiltered = filteredTransactions.reduce(function(acc, curr){
			if(!acc[curr.category_id]){
					acc[curr.category_id] = 0;
			}
			acc[curr.category_id]++;
			return acc;
		},{})
		
		if (Object.entries(transactionFiltered).length === 0) {
			return { name: 'No transactions yet', color: 'var(--ink-soft)', count: 0 };
		}
		
		const [maxCategory, maxValue] = Object.entries(transactionFiltered).reduce(function(max,current){
			return current[1] > max[1] ? current : max;
		});
		
		
		
		const matchingCategory = categories.find(function(category){
			return category.id === Number(maxCategory);
		})
		return { name : matchingCategory?.name ?? 'Uncategorized' , color : matchingCategory?.color ?? 'var(--accent)', count: maxValue};
	  },
	  render: function(data){
		  const word = data.count === 1 ? 'transaction' : 'transactions';
		  
		  if(data.count === 0){
			  return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
      <i class="ti ti-repeat" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
      <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Most frequent category</p>
    </div>
    <p style="font-size:14px; color:var(--ink-soft); margin:0;">No transactions this month</p>
  `;
		  }
		return `
    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
        <i class="ti ti-repeat" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
        <p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Most frequent category</p>
    </div>
    <span style="display:inline-block; background:${data.color}; color:white; font-size:12px; font-weight:500; padding:3px 10px; border-radius:999px; margin:0 0 8px;">${data.name}</span>
    <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">
	${data.count} <span style="font-family:var(--font-body); font-size:13px; font-weight:400; color:var(--ink-soft);">${word}</span>
	</p>
    `;
	  }
  },
  limitsAtRisk: {
    label: 'Limits at risk',
    section: 'categoryInsights',
    description: 'Categories over budget or close to their limit',
    defaultSpan: 2,
    calculate: function(transactions, categories, config) {
      const spending = spendingByCategory(transactions, getDate('current'));
      const limited = categories.filter(function(category) {
        return category.limit !== null && category.limit !== '' && Number(category.limit) > 0;
      });
      const atRisk = limited
        .map(function(category) {
          const spent = spending[category.id] ?? 0;
          const limit = Number(category.limit);
          return { name: category.name, color: category.color, spent, limit, ratio: spent / limit };
        })
        .filter(function(item) { return item.ratio >= 0.8; })
        .sort(function(a, b) { return b.ratio - a.ratio; });
      return { atRisk, hasLimits: limited.length > 0 };
    },
    render: function(data) {
      const label = widgetLabel('ti-alert-triangle', 'Limits at risk');
      if (!data.hasLimits) {
        return label + emptyMessage('Set limits on the Categories page to track them here');
      }
      if (data.atRisk.length === 0) {
        return label + `
          <p style="display:flex; align-items:center; gap:6px; font-size:14px; font-weight:500; color:var(--positive); margin:0;">
            <i class="ti ti-circle-check" aria-hidden="true"></i>All categories are on track
          </p>
        `;
      }
      const overCount = data.atRisk.filter(function(item) { return item.ratio > 1; }).length;
      const nearCount = data.atRisk.length - overCount;
      const rows = data.atRisk.slice(0, 4).map(function(item) {
        const isOver = item.ratio > 1;
        const detail = isOver
          ? `Over by ${formatMoney(item.spent - item.limit)}`
          : `${formatMoney(item.limit - item.spent)} left`;
        const color = isOver ? 'var(--negative)' : 'var(--accent-ink)';
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-top:1px solid var(--line);">
            ${tagPill(item.name, item.color)}
            <span style="font-size:13px; font-weight:600; color:${color}; white-space:nowrap;">${detail}</span>
          </div>
        `;
      }).join('');
      return label + `
        <p style="font-size:13px; color:var(--ink-soft); margin:0 0 8px;">${overCount} over budget · ${nearCount} close to limit</p>
        ${rows}
      `;
    }
  },

  topThreeCategories: {
    label: 'Top 3 categories',
    section: 'categoryInsights',
    description: 'Your three biggest spending categories this month',
    defaultSpan: 2,
    calculate: function(transactions, categories, config) {
      const spending = spendingByCategory(transactions, getDate('current'));
      const top = Object.entries(spending)
        .sort(function(a, b) { return b[1] - a[1]; })
        .slice(0, 3)
        .map(function(entry) {
          const category = findCategory(categories, entry[0]);
          return {
            name: category?.name ?? 'Uncategorized',
            color: category?.color ?? 'var(--accent)',
            amount: entry[1]
          };
        });
      return { top };
    },
    render: function(data) {
      const label = widgetLabel('ti-trophy', 'Top 3 categories');
      if (data.top.length === 0) {
        return label + emptyMessage('No spending this month');
      }
      const largest = data.top[0].amount;
      const rows = data.top.map(function(item, index) {
        const width = (item.amount / largest) * 100;
        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="display:flex; align-items:center; gap:8px; min-width:0;">
                <span style="font-size:12px; font-weight:600; color:var(--ink-soft);">${index + 1}</span>
                ${tagPill(item.name, item.color)}
              </span>
              <span style="font-family:var(--font-mono); font-size:14px; font-weight:500; color:var(--ink);">${formatMoney(item.amount)}</span>
            </div>
            <div style="height:6px; background:var(--paper); border-radius:4px; overflow:hidden;">
              <div style="width:${width}%; height:100%; background:${escapeHTML(item.color)};"></div>
            </div>
          </div>
        `;
      }).join('');
      return label + rows;
    }
  },

  categorySpotlight: {
    label: 'Category spotlight',
    section: 'categoryInsights',
    description: 'A closer look at one category you choose',
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      if (config?.categoryId === undefined) {
        return { configured: false };
      }
      const category = findCategory(categories, config.categoryId);
      if (!category) {
        return { configured: false };
      }
      const month = getDate('current');
      const matches = transactions.filter(function(t) {
        return t.category_id === category.id && t.date.startsWith(month) && Number(t.amount) < 0;
      });
      const spent = matches.reduce(function(sum, t) {
        return sum + Math.abs(Number(t.amount));
      }, 0);
      const hasLimit = category.limit !== null && category.limit !== '';
      return {
        configured: true,
        name: category.name,
        color: category.color,
        spent,
        count: matches.length,
        average: matches.length === 0 ? 0 : spent / matches.length,
        limit: hasLimit ? Number(category.limit) : null
      };
    },
    render: function(data) {
      const label = widgetLabel('ti-zoom-in', 'Category spotlight');
      if (!data.configured) {
        return label + emptyMessage('Choose Edit widgets, then select this card to pick a category');
      }
      const word = data.count === 1 ? 'transaction' : 'transactions';
      const limitLine = data.limit === null
        ? ''
        : `<p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">of ${formatMoney(data.limit)} limit</p>`;
      return label + `
        <div style="margin-bottom:8px;">${tagPill(data.name, data.color)}</div>
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">${formatMoney(data.spent)}</p>
        ${limitLine}
        <p style="font-size:12px; color:var(--ink-soft); margin:6px 0 0;">${data.count} ${word} · avg ${formatMoney(data.average)}</p>
      `;
    },
    renderConfig: function(currentConfig, categories) {
      const options = categories.map(function(category) {
        const selected = currentConfig?.categoryId === category.id ? ' selected' : '';
        return `<option value="${category.id}"${selected}>${escapeHTML(category.name)}</option>`;
      }).join('');
      return `
        <div class="field">
          <label for="spotlight-category">Category to spotlight</label>
          <select id="spotlight-category">
            <option value="">Choose a category</option>
            ${options}
          </select>
        </div>
      `;
    }
  },

  biggestCategoryChange: {
    label: 'Biggest category change',
    section: 'categoryInsights',
    description: 'The category whose spending changed most since last month',
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      const current = spendingByCategory(transactions, getDate('current'));
      const previous = spendingByCategory(transactions, getDate('previous'));
      const ids = new Set([...Object.keys(current), ...Object.keys(previous)]);

      let biggest = null;
      ids.forEach(function(id) {
        const now = current[id] ?? 0;
        const before = previous[id] ?? 0;
        const difference = now - before;
        if (biggest === null || Math.abs(difference) > Math.abs(biggest.difference)) {
          biggest = { id, now, before, difference };
        }
      });

      if (biggest === null || biggest.difference === 0) {
        return { hasChange: false };
      }
      const category = findCategory(categories, biggest.id);
      return {
        hasChange: true,
        name: category?.name ?? 'Uncategorized',
        color: category?.color ?? 'var(--accent)',
        now: biggest.now,
        before: biggest.before,
        difference: biggest.difference
      };
    },
    render: function(data) {
      const label = widgetLabel('ti-arrows-up-down', 'Biggest category change');
      if (!data.hasChange) {
        return label + emptyMessage('No change from last month');
      }
      const isUp = data.difference > 0;
      const color = isUp ? 'var(--negative)' : 'var(--positive)';
      const sign = isUp ? '+' : '-';
      const comparison = data.before === 0
        ? 'New this month'
        : `${formatMoney(data.now)} vs ${formatMoney(data.before)} in ${monthName(getDate('previous'), 'short')}`;
      return label + `
        <div style="margin-bottom:8px;">${tagPill(data.name, data.color)}</div>
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:${color}; margin:0;">${sign}${formatMoney(data.difference)}</p>
        <p style="font-size:12px; color:var(--ink-soft); margin:6px 0 0;">${comparison}</p>
      `;
    }
  },

  recentTransactions: {
    label: 'Recent transactions',
    section: 'trends',
    description: 'Your five most recent transactions',
    defaultSpan: 2,
    calculate: function(transactions, categories, config) {
      const month = getDate('current');
      // filter() makes a new array, so sorting it here doesn't reorder
      // your main transactions list.
      const recent = transactions
        .filter(function(t) { return t.date.startsWith(month); })
        .sort(function(a, b) {
          if (a.date !== b.date) {
            return a.date > b.date ? -1 : 1;
          }
          return b.id - a.id;
        })
        .slice(0, 5)
        .map(function(t) {
          const category = findCategory(categories, t.category_id);
          return {
            date: t.date,
            description: t.description,
            amount: Number(t.amount),
            categoryName: category?.name ?? 'Uncategorized',
            categoryColor: category?.color ?? 'var(--accent)'
          };
        });
      return { recent };
    },
    render: function(data) {
      const label = widgetLabel('ti-clock', 'Recent transactions');
      if (data.recent.length === 0) {
        return label + emptyMessage('No transactions this month');
      }
      const rows = data.recent.map(function(t) {
        const isIncome = t.amount > 0;
        return `
          <div style="display:grid; grid-template-columns:52px minmax(0,1fr) auto; align-items:center; gap:10px; padding:7px 0; border-top:1px solid var(--line);">
            <span style="font-size:12px; color:var(--ink-soft);">${shortDate(t.date)}</span>
            <span style="min-width:0;">
              <span style="display:block; font-size:14px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(t.description)}</span>
              <span style="display:flex; align-items:center; gap:5px; font-size:11px; color:var(--ink-soft);">
                <span style="width:7px; height:7px; border-radius:50%; background:${escapeHTML(t.categoryColor)};"></span>${escapeHTML(t.categoryName)}
              </span>
            </span>
            <span style="font-family:var(--font-mono); font-size:14px; font-weight:500; color:${isIncome ? 'var(--positive)' : 'var(--negative)'};">${isIncome ? '+' : '-'}${formatMoney(t.amount)}</span>
          </div>
        `;
      }).join('');
      return label + rows;
    }
  },

  spendingVsLastMonth: {
    label: 'Spending vs last month',
    section: 'trends',
    description: "How this month's spending compares to last month",
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      return {
        current: totalsForMonth(transactions, getDate('current')).expense,
        previous: totalsForMonth(transactions, getDate('previous')).expense
      };
    },
    render: function(data) {
      return widgetLabel('ti-trending-up', 'Spending vs last month') + `
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--ink); margin:0;">${formatMoney(data.current)}</p>
        ${changeBadge(data.current, data.previous, false)}
        <p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">${monthName(getDate('previous'), 'long')}: ${formatMoney(data.previous)}</p>
      `;
    }
  },

  incomeVsLastMonth: {
    label: 'Income vs last month',
    section: 'trends',
    description: "How this month's income compares to last month",
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      return {
        current: totalsForMonth(transactions, getDate('current')).income,
        previous: totalsForMonth(transactions, getDate('previous')).income
      };
    },
    render: function(data) {
      return widgetLabel('ti-cash', 'Income vs last month') + `
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:var(--positive); margin:0;">${formatMoney(data.current)}</p>
        ${changeBadge(data.current, data.previous, true)}
        <p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">${monthName(getDate('previous'), 'long')}: ${formatMoney(data.previous)}</p>
      `;
    }
  },

  spendingByWeekday: {
    label: 'Spending by day of week',
    section: 'trends',
    description: 'Which days of the week you spend the most',
    defaultSpan: 2,
    calculate: function(transactions, categories, config) {
      const month = getDate('current');
      const totals = [0, 0, 0, 0, 0, 0, 0]; // Sunday through Saturday
      transactions.forEach(function(t) {
        const amount = Number(t.amount);
        if (!t.date.startsWith(month) || amount >= 0) {
          return;
        }
        const [year, m, day] = t.date.split('-').map(Number);
        const weekday = new Date(year, m - 1, day).getDay();
        totals[weekday] += Math.abs(amount);
      });
      const max = Math.max(...totals);
      return { totals, max, topDay: totals.indexOf(max) };
    },
    render: function(data) {
      const label = widgetLabel('ti-calendar-week', 'Spending by day of week');
      if (data.max === 0) {
        return label + emptyMessage('No spending this month');
      }
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const fullNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
      const bars = data.totals.map(function(total, index) {
        const height = Math.max((total / data.max) * 100, 3);
        const isTop = index === data.topDay;
        return `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;" title="${names[index]}: ${formatMoney(total)}">
            <div style="width:100%; max-width:28px; height:70px; display:flex; align-items:flex-end;">
              <div style="width:100%; height:${height}%; border-radius:4px 4px 0 0; background:${isTop ? 'var(--accent)' : 'var(--line)'};"></div>
            </div>
            <span style="font-size:11px; color:${isTop ? 'var(--ink)' : 'var(--ink-soft)'}; font-weight:${isTop ? 600 : 400};">${names[index]}</span>
          </div>
        `;
      }).join('');
      return label + `
        <p style="font-size:14px; color:var(--ink); margin:0 0 10px;">You spend most on <strong>${fullNames[data.topDay]}</strong>, ${formatMoney(data.max)} this month</p>
        <div style="display:flex; justify-content:space-between; gap:6px;">${bars}</div>
      `;
    }
  },

  yearToDate: {
    label: 'Year to date',
    section: 'trends',
    description: 'Income, expenses, and net since January',
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      const month = getDate('current');
      const year = month.slice(0, 4);
      const totals = transactions.reduce(function(sum, t) {
        // Same year, and not after the selected month
        if (!t.date.startsWith(year) || t.date.slice(0, 7) > month) {
          return sum;
        }
        const amount = Number(t.amount);
        if (amount > 0) {
          sum.income += amount;
        } else {
          sum.expense += Math.abs(amount);
        }
        return sum;
      }, { income: 0, expense: 0 });
      return {
        year,
        income: totals.income,
        expense: totals.expense,
        net: totals.income - totals.expense
      };
    },
    render: function(data) {
      const netColor = data.net >= 0 ? 'var(--positive)' : 'var(--negative)';
      const netSign = data.net >= 0 ? '+' : '-';
      return widgetLabel('ti-calendar-stats', `${data.year} to date`) + `
        <p style="font-size:11px; color:var(--ink-soft); margin:0 0 2px;">Net</p>
        <p style="font-family:var(--font-mono); font-size:22px; font-weight:500; color:${netColor}; margin:0 0 8px;">${netSign}${formatMoney(data.net)}</p>
        <div style="display:flex; justify-content:space-between; font-size:12px;">
          <span style="color:var(--ink-soft);">Income</span>
          <span style="font-family:var(--font-mono); color:var(--positive);">${formatMoney(data.income)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:2px;">
          <span style="color:var(--ink-soft);">Expenses</span>
          <span style="font-family:var(--font-mono); color:var(--negative);">${formatMoney(data.expense)}</span>
        </div>
      `;
    }
  },

  sixMonthTrend: {
    label: '6-month trend',
    section: 'trends',
    description: 'Income and spending over the last six months',
    defaultSpan: 2,
    calculate: function(transactions, categories, config) {
      const end = getDate('current');
      const months = [-5, -4, -3, -2, -1, 0].map(function(offset) {
        return shiftMonth(end, offset);
      });
      return {
        labels: months.map(function(month) { return monthName(month, 'short'); }),
        spending: months.map(function(month) { return totalsForMonth(transactions, month).expense; }),
        income: months.map(function(month) { return totalsForMonth(transactions, month).income; })
      };
    },
    render: function(data) {
      return widgetLabel('ti-chart-line', '6-month trend') + `
        <div style="position:relative; height:170px;">
          <canvas role="img" aria-label="Line chart of income and spending over the last six months"></canvas>
        </div>
      `;
    },
    // Runs AFTER the widget is on the page, because Chart.js needs a real
    // <canvas> that already exists. See PART 3.
    afterRender: function(element, data) {
      const canvas = element.querySelector('canvas');
      const chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [
            {
              label: 'Spending',
              data: data.spending,
              borderColor: cssVar('--negative'),
              backgroundColor: cssVar('--negative'),
              tension: 0.3,
              pointRadius: 3
            },
            {
              label: 'Income',
              data: data.income,
              borderColor: cssVar('--positive'),
              backgroundColor: cssVar('--positive'),
              tension: 0.3,
              pointRadius: 3
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return context.dataset.label + ': ' + formatMoney(context.parsed.y);
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) { return '$' + Number(value).toLocaleString(); }
              }
            }
          }
        }
      });
      widgetCharts.push(chart);
    }
  
  // more widget types go here
},
insights: {
    label: 'Insights',
    section: 'snapshot',
    description: 'The newest things Ledger noticed in your money',
    defaultSpan: 2,
    calculate: function(transactions, categories, config) {
      const list = typeof dashboardInsights !== 'undefined' ? dashboardInsights : [];
      return { items: list.slice(0, 3), total: list.length };
    },
    render: function(data) {
      const label = widgetLabel('ti-bulb', 'Insights');
      if (data.items.length === 0) {
        return label + emptyMessage("You're all caught up.");
      }
      const colors = { headsup: 'var(--negative)', tip: 'var(--accent)', win: 'var(--positive)' };
      const rows = data.items.map(function(i) {
        return `
          <div class="wd-insight">
            <span class="sl-dot" style="background:${colors[i.kind]};"></span>
            <span>${escapeHTML(i.title)}</span>
          </div>
        `;
      }).join('');
      const more = data.total > 3 ? ` (${data.total - 3} more)` : '';
      return label + rows + `<a href="insights.html" style="font-size:13px; font-weight:500;">See all insights${more}</a>`;
    }
  }
};

let widgetCharts = [];

function renderAllWidgets(userWidgets, isEditMode){
  // NEW: destroy old charts before redrawing. Without this, every month
  // change or edit-mode toggle would leave old charts running in memory.
  widgetCharts.forEach(function(chart) { chart.destroy(); });
  widgetCharts = [];

  const container = document.getElementById('widgets-container');
  container.innerHTML = '';

  for (const widget of userWidgets){
    const entry = widgetCatalog[widget.type];
    if (!entry) {
      continue;
    }

    const data = entry.calculate(transactions, categories, widget.config ?? {});
    const widgetElement = document.createElement('div');
    widgetElement.className = 'card widget-card' + (isEditMode ? ' jiggle-card' : '');
    widgetElement.innerHTML = entry.render(data);
    widgetElement.dataset.widgetId = widget.id;
    widgetElement.style.gridColumn = 'span ' + widget.span;

    if (isEditMode){
      widgetElement.innerHTML += `<button class="widget-remove-btn" data-widget-id="${widget.id}">x</button>`;
    }

    container.appendChild(widgetElement);

    // NEW: let widgets like the 6-month trend draw after they're on the page.
    if (entry.afterRender) {
      entry.afterRender(widgetElement, data);
    }
  }

  if (isEditMode) {
    const addCard = document.createElement('div');
    addCard.id = 'add-widget-card';
    addCard.className = 'card widget-add-card';
    addCard.textContent = '+ Add widget';
    container.appendChild(addCard);
  }
}



