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
	  label: 'incomeVsExpenses',
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
	  label: 'paymentSplit',
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
    const creditPercent = (data.credit / (data.credit + data.cash)) * 100;
    const cashPercent = (data.cash / (data.credit + data.cash)) * 100;
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
        <span>Credit ${creditPercent.toFixed(2)}%</span>
        <span>Cash ${cashPercent.toFixed(2)}%</span>
    </div>
    `;
}
  },
  biggestTransaction: {
	  label: 'biggestTransaction',
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
	  label: 'avgTransaction',
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
	  label: 'savingsRate',
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
	  label: 'transactionCount',
	  section: 'snapshot',
	  description: 'Amount of transactions this month',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const totalTransactions = transactions.reduce(function(sum,current){
			  if(transactions.amount < 0){
				  sum++;
			  }
			  return sum;
		  })
		  return { totalTransactions };
	  }, 
	  render: function(data){
		console.log(data.totalTransactions);
		return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">
			<i class="ti ti-number-99-small" style="font-size:15px; color:var(--ink-soft);" aria-hidden="true"></i>
			<p style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--ink-soft); margin:0;">Transaction count</p>
			</div>
			<p style="font-family:var(--font-mono); font-size:22px; font-weight:500;margin:0;">${data.totalTransactions}</p>
  `;  
	  }
  }
  
  // more widget types go here
};

function renderAllWidgets(userWidgets, isEditMode){
	const container = document.getElementById('widgets-container');
	container.innerHTML = '';
	for(const widget of userWidgets){
		if(widgetCatalog[widget.type]){
			const data = widgetCatalog[widget.type].calculate(transactions, categories, widget.config);
			const html = widgetCatalog[widget.type].render(data);
			const widgetElement = document.createElement('div');
			widgetElement.className = 'card widget-card' + (isEditMode ? ' jiggle-card' : '');
			widgetElement.innerHTML = html;
			widgetElement.dataset.widgetId = widget.id;
			widgetElement.style.gridColumn = 'span ' + widget.span;
			if (isEditMode){
				widgetElement.innerHTML += `<button class="widget-remove-btn" data-widget-id="${widget.id}">x</button>`;
			}
			container.appendChild(widgetElement);
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

function updateConfigSection() {
  const selectedType = document.getElementById('widget-config-type').value;
  const configContainer = document.getElementById('widget-config-typespecific');
  const catalogEntry = widgetCatalog[selectedType];

  if (catalogEntry.renderConfig) {
    const currentConfig = (currentlyEditingWidget.type === selectedType) ? currentlyEditingWidget.config : {};
    configContainer.innerHTML = catalogEntry.renderConfig(currentConfig, categories);
  } else {
    configContainer.innerHTML = '';
  }
}

