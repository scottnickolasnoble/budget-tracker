function getDate(condition){
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	const monthPadded = month.toString().padStart(2,0);
	const prevMonth = month === 1 ? 12: month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	const prevMonthPadded = prevMonth.toString().padStart(2,0);
	if(condition === "current"){
	return `${year}-${monthPadded}`;
	} else {
		return `${prevYear}-${prevMonthPadded}`;
	}
}

const widgetCatalog = {
  cashBalance: {
    label: 'Cash balance',
    defaultSpan: 1,
    calculate: function(transactions, categories, config) {
      const cashTransactions = transactions.filter(function(transaction) {
        return transaction.paymentmethod === 'cash';
      });
      const total = cashTransactions.reduce(function(sum, transaction) {
        return sum + transaction.amount;
      }, 0);
      return { total };
    },
    render: function(data) {
      const formatted = data.total < 0
        ? `-$${Math.abs(data.total).toFixed(2)}`
        : `$${data.total.toFixed(2)}`;
      return `
        <p style="font-size:13px; color:var(--text-secondary);">Cash balance</p>
        <p style="font-size:24px; font-weight:500;">${formatted}</p>
      `;
    }
  },
  monthlySpending: {
	  label: 'Monthly Spending',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		const currDate = getDate("current");
		const monthlySpending = transactions.filter(function(transaction){
			return transaction.date.startsWith(currDate) && transaction.amount < 0;
		});
		const total = monthlySpending.reduce(function(sum, transaction){
			return sum + transaction.amount;
		},0);
		return { total };
	  },
	  render: function(data){
		  const formatted = Math.abs(data.total).toFixed(2);
		  return `
		  <p style="font-size:13px; color:var(--text-secondary);">Monthly Spending</p>
		  <p style="font-size:24px; font-weight:500;">${formatted}</p>
		  `;
	  }
	  
  },
  creditAccrued: {
	  label: 'Credit Accrued',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate("current");
		  
		  const creditAccrued = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && transaction.paymentmethod.toLowerCase() === "credit" && transaction.amount < 0;
		  });
		  const total = creditAccrued.reduce(function(sum, transaction){
			  return sum + transaction.amount;
		  },0);
		  return { total };
	  },
	  render: function(data){
		  const formatted = Math.abs(data.total).toFixed(2);
		  return `
		  <p style="font-size:13px; color:var(--text-secondary);">Credit Accrued</p>
		  <p style="font-size:24px; font-weight:500;">${formatted}</p>
		  `;
	  }
  },
  topCategory: {
	  label: 'Top Category',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const excludedIds = config.excludedCategoryIds ?? [];
		  const currDate = getDate("current");
		  const topCategoryMonth = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && transaction.amount < 0 && !excludedIds.includes(transaction.category_id);
		  });
		  const categoriesSorted = topCategoryMonth.reduce(function(sum ,transaction){
			 if(!sum[transaction.category_id]){
				 sum[transaction.category_id] = 0;
			 }
			 sum[transaction.category_id] += transaction.amount;
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
		  <p style="font-size:13px; color:var(--text-secondary);">Top category</p>
		  <span style="display:inline-block; background:${data.color}; color:white; font-size:12px; font-weight:500; padding:3px 10px; border-radius:999px; margin:4px 0;">${data.name}</span>
		  <p style="font-size:24px; font-weight:500;">$${formatted}</p>
		  `;
	  },
	  renderConfig: function(currentConfig, categories){
		  const excludedIds = currentConfig.excludedCategoryIds ?? [];
		  const checkboxes = categories.map(function(category){
			  const isChecked = !excludedIds.includes(category.id) ? 'checked' : ''
			  return `<label><input type="checkbox" data-category-id="${category.id}" ${isChecked}> ${category.name}</label>`;
		  });
		  return `<label>Exclude categories</label>` + checkboxes.join('');
	  }
  }, 
  incomeVsExpenses: {
	  label: 'incomeVsExpenses',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const currMonthTransactions = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate);
		  });
		  const incomeVsExpenses = currMonthTransactions.reduce(function(sum, current){
			  if(current.amount < 0){
				  sum.expense += Math.abs(current.amount);
			  } else {
				  sum.income += current.amount;
			  }
			  return sum;
		  }, {income: 0, expense: 0});
		  return incomeVsExpenses;
	  },
	  render: function(data){
		  return `<p style="font-size:13px; color:var(--text-secondary);">Income VS Expenses</p>
		  <p style="font-size:24px; font-weight:500;">Income: $${data.income.toFixed(2)}</p>
		  <p style="font-size:24px; font-weight:500;">Expenses: $${data.expense.toFixed(2)}</p>
		  `;
	  }
  },
  paymentSplit: {
	  label: 'paymentSplit',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const transactionsFiltered = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && transaction.amount < 0;
		  });
		  const total = transactionsFiltered.reduce(function(sum,current){
			  sum[current.paymentmethod] += Math.abs(current.amount);
			  return sum;
		  },{credit:0, cash:0});
		  
		  return total;
	  },
	  render: function(data){
		  const creditPercent = (data.credit / (data.credit + data.cash)) * 100
		  const cashPercent = (data.cash / (data.credit + data.cash)) * 100
		  return `<p style="font-size:13px; color:var(--text-secondary);">Payment Split</p>
		  <p style="font-size:24px; font-weight:500;">Credit: ${(creditPercent).toFixed(2)}%</p>
		  <p style="font-size:24px; font-weight:500;">Cash: ${(cashPercent).toFixed(2)}%</p>
		  `;
	  }
  },
  biggestTransaction: {
	  label: 'biggestTransaction',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const filteredTransactions = transactions.filter(function(transaction){
			  return transaction.date.startsWith(currDate) && transaction.amount < 0;
		  });
		  const biggestTransaction = filteredTransactions.reduce(function(sum,current){
			 return Math.abs(sum.amount) > Math.abs(current.amount) ? sum : current; 
		  });
		  return {
			  description: biggestTransaction.description,
			  amount: biggestTransaction.amount
		  }
	  },
	  render: function(data){
		  return `<p style="font-size:13px; color:var(--text-secondary);">Biggest Transaction</p>
		  <p style="font-size:24px; font-weight:500;">${data.description}</p>
		  <p style="font-size:24px; font-weight:500;">Amount: $${Math.abs(data.amount).toFixed(2)}</p>
		  `;
	  }
  },
  avgTransaction: {
	  label: 'avgTransaction',
	  defaultSpan: 1,
	  calculate: function(transactions, categories, config){
		  const currDate = getDate('current');
		  const filteredTransactions = transactions.filter(function(transaction){
			 return transaction.date.startsWith(currDate) && transaction.amount < 0; 
		  });
		  const total = filteredTransactions.reduce(function(sum,current){
			  sum += Math.abs(current.amount);
			  return sum;
		  },0);
		 const avgTransaction = filteredTransactions.length === 0 ? 0 : total / filteredTransactions.length;
		 
		 return { avgTransaction };
	  },
	  render: function(data){
		  return `<p style="font-size:13px; color:var(--text-secondary);">Average Transaction</p>
		  <p style="font-size:24px; font-weight:500;">$${data.avgTransaction.toFixed(2)}</p>
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
			if (isEditMode){
				widgetElement.innerHTML += `<button class="widget-remove-btn" data-widget-id="${widget.id}">x</button>`;
			}
			container.appendChild(widgetElement);
		}
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