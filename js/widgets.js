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
			  return transaction.date.startsWith(currDate) && transaction.amount < 0 && transaction.category_id !== excludedIds;
		  });
		  const categoriesSorted = topCategoryMonth.reduce(function(sum ,transaction){
			 if(!sum[transaction.category_id]){
				 sum[transaction.category_id] = 0;
			 }
			 sum[transaction.category_id] += transaction.amount;
			 return sum;
		  },{});
		  
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
	  }	
  }
  
  // more widget types go here
};

function renderAllWidgets(userWidgets){
	const container = document.getElementById('widgets-container');
	container.innerHTML = '';
	for(const widget of userWidgets){
		if(widgetCatalog[widget.type]){
			const data = widgetCatalog[widget.type].calculate(transactions, categories, {});
			const html = widgetCatalog[widget.type].render(data);
			const widgetElement = document.createElement('div');
			widgetElement.className = 'card widget-card';
			widgetElement.innerHTML = html;
			
			container.appendChild(widgetElement);
		}
	} 
}

