let categories = [];
let transactions = [];
let statements = [];
let categoryTotals = {};
const endDateInput = document.getElementById('close-statement-date');
const startDateInput = document.getElementById('start-statement-date');
const monthlySpendingLabel = document.getElementById('monthly-spend-value');
const prevMonthlySpendingLabel = document.getElementById('last-month-spend-value');
const topCategoryValue = document.getElementById('top-category-value');
const topCategoryLabel = document.getElementById('top-category-name');

const topCategoryFilterBtn = document.getElementById('top-category-filter-btn');
const topCategoryFilterPanel = document.getElementById('top-category-filter-panel');
const topCategoryFilterAll = document.getElementById('top-category-filter-all');
const topCategoryFilterOptions = document.getElementById('top-category-filter-options');

topCategoryFilterBtn.addEventListener('click', function(event){
	if (topCategoryFilterPanel.style.display === "none") {
		topCategoryFilterPanel.style.display = "flex";
	} else {
		topCategoryFilterPanel.style.display = "none";
	}
});

topCategoryFilterOptions.addEventListener('change', function(event){
	const checkbox = event.target;
	const category = categories.find(function(c){
		return c.name === checkbox.value;
	});
	category.excludeFromTop = checkbox.checked ? "" : "true";

	if (!checkbox.checked) {
		topCategoryFilterAll.checked = false;
	} else {
		const allCheckboxes = topCategoryFilterOptions.querySelectorAll('input[type="checkbox"]');
		const allChecked = Array.from(allCheckboxes).every(function(cb){
			return cb.checked;
		});
		topCategoryFilterAll.checked = allChecked;
	}

	saveCategories();
	loadCategoryTotals();
});

topCategoryFilterAll.addEventListener('change', function(event){
	const checkboxes = topCategoryFilterOptions.querySelectorAll('input[type="checkbox"]');
	checkboxes.forEach(function(checkbox){
		checkbox.checked = topCategoryFilterAll.checked;
		const category = categories.find(function(c){
			return c.name === checkbox.value;
		});
		category.excludeFromTop = topCategoryFilterAll.checked ? "" : "true";
	});
	saveCategories();
	loadCategoryTotals();
});
document.addEventListener('click',function(event){
	const clickedInsideButton = event.target.closest('#top-category-filter-btn');
	const clickedInsidePanel = event.target.closest('#top-category-filter-panel');
	
	if (!clickedInsideButton && !clickedInsidePanel) {
		topCategoryFilterPanel.style.display = 'none';
	}
});


startDateInput.addEventListener('change', async function(event){
	const pickedDate = document.getElementById('start-statement-date').value;
	const openStatement = statements.find(function(statement){
		return statement.status === "open";
	});

	if (!openStatement) {
		const newStatement = {
			id: Date.now(),
			startDate: pickedDate,
			closeDate: "",
			status: "open"
		};
		statements.push(newStatement); // add it to the statements array
		await saveStatements();
		updateCreditAccrued();
	} else {
		const confirmed = confirm(`Change the statement start date from ${openStatement.startDate} to ${pickedDate}?`); // what message goes here?
		if (confirmed) {
			openStatement.startDate = pickedDate;
			await saveStatements();
			updateCreditAccrued();
		} else {
			document.getElementById('start-statement-date').value = openStatement.startDate; // revert the visible input
		}
	}
	updateCreditAccrued();
});

endDateInput.addEventListener('change',async function(event){
	const openStatement = statements.find(function(statement){
		return statement.status === "open"
	});
	if (!openStatement){
		document.getElementById('credit-accrued-value').textContent = "$0.00";
		return;
	}
	const closedStatement = document.getElementById('close-statement-date').value;
	openStatement.closeDate = closedStatement;
	openStatement.status = "closed";
	transactions.forEach(function(transaction){
		if(transaction.paymentMethod === "credit" && transaction.date >= openStatement.startDate && transaction.date <= closedStatement && !transaction.statementId){
			transaction.statementId = openStatement.id;
		}
	
	});
	await saveTransactions();
	await saveStatements();
	updateCreditAccrued();
	document.getElementById('start-statement-date').value = getNextStartDefault();
});

function populateTopCategoryFilterOptions(categoryList){
	const container = document.getElementById('top-category-filter-options');
	container.innerHTML = categoryList.map(function(category){
		const isChecked = category.excludeFromTop ? '' : 'checked';
		return `
			<label style="display:flex; align-items:center; gap:4px;">
				<input type="checkbox" value="${category.name}" ${isChecked} style="margin:0; width:auto; padding:0;" />
				${category.name}
			</label>
		`;
	}).join('');
}

function getNextStartDefault(){
	const closedStatements = statements.filter(function(statement){
		return statement.status === "closed";
	});

	if (closedStatements.length === 0) {
		// no statement has ever existed — fall back to today
		const today = new Date();
		return today.toISOString().slice(0, 10);
	}

	const mostRecentlyClosed = closedStatements.reduce(function(latest, statement){
		return statement.closeDate > latest.closeDate ? statement : latest;
	});

	const nextDay = new Date(mostRecentlyClosed.closeDate);
	nextDay.setDate(nextDay.getDate() + 1);
	return nextDay.toISOString().slice(0, 10);
}

async function loadCashBalance(){
	const cashBalanceLabel = document.getElementById('cash-balance-value');
	let cashBalanceValue = 0;
	const newTransaction = transactions.filter(function(transaction){
		return transaction.paymentMethod === "cash";
	})
	newTransaction.forEach(function(transaction){
		cashBalanceValue += transaction.amount;
	})
	cashBalanceLabel.textContent = cashBalanceValue < 0 ? `-$${Math.abs(cashBalanceValue).toFixed(2)}` : `$${cashBalanceValue.toFixed(2)}`;
}
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
function updateCreditAccrued(){
	const openStatement = statements.find(function(statement){
		return statement.status === "open"
	});
	if (!openStatement){
		document.getElementById('credit-accrued-value').textContent = "$0.00";
		return;
	}
	let accrued = 0;
	transactions.forEach(function(transaction){
		if(transaction.date >= openStatement.startDate && transaction.paymentMethod === "credit" && !transaction.statementId){
			accrued += Math.abs(transaction.amount);
			
		}
	});
	document.getElementById('credit-accrued-value').textContent = `$${accrued.toFixed(2)}`;
}
function monthlySpending(){
	const currDate = getDate("current");
	const prevDate = getDate("previous");
	
	let monthlySpendingValue = 0;
	let prevMonthlySpending = 0;
	transactions.forEach(function(transaction){
		if(transaction.date.startsWith(currDate) && transaction.amount < 0){
			monthlySpendingValue += Math.abs(transaction.amount);
			
		} else if(transaction.date.startsWith(prevDate) && !transaction.date.startsWith(currDate) && transaction.amount < 0){
			prevMonthlySpending += Math.abs(transaction.amount);
		}
	})
	monthlySpendingLabel.textContent = `$${monthlySpendingValue}`;
	prevMonthlySpendingLabel.textContent = `$${prevMonthlySpending}`;
	
}
function statementsToCSV(statementsList) {
  const headers = ['id', 'startDate', 'closeDate', 'status'];
  const headerRow = headers.join(',');

  const rows = statementsList.map(function(statement) {
    return headers.map(function(key) {
		let value = String(statement[key]);
		if(value.includes('"')){
			value = value.replace(/"/g, '""');
		}
		if(value.includes('"') || value.includes(',')){
			return `"${value}"`;
		}
		return value;
      
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
}
function loadCategoryTotals(){
	const currentMonth = getDate("current");
	categoryTotals = {};
	transactions.forEach(function(transaction){
		if (!transaction.date.startsWith(currentMonth)) {
			return;
		}
		if(!categoryTotals[transaction.category]){
			categoryTotals[transaction.category] = 0;
		}
		categoryTotals[transaction.category] += transaction.amount;
	});

	const includedEntries = Object.entries(categoryTotals).filter(function(entry){
		const category = categories.find(function(c){
			return c.name === entry[0];
		});
		return !category || !category.excludeFromTop;
	});

	if (includedEntries.length === 0) {
		document.getElementById('top-category-value').textContent = "—";
		document.getElementById('top-category-name').textContent = "—";
		return;
	}

	const topCategoryEntry = includedEntries.reduce(function(highest, current){
		return Math.abs(current[1]) > Math.abs(highest[1]) ? current : highest;
	});

	const topCategoryName = topCategoryEntry[0];
	const topCategoryAmount = Math.abs(topCategoryEntry[1]);

	document.getElementById('top-category-value').textContent = `$${topCategoryAmount.toFixed(2)}`;
	document.getElementById('top-category-name').textContent = topCategoryName;

	const matchingCategory = categories.find(function(category){
		return category.name === topCategoryName;
	});
	document.getElementById('top-category-name').style.color = matchingCategory ? matchingCategory.color : '';
}

function categoriesToCSV(categoryList){
	const headers = ['id','name','color','limit','excludeFromTop'];
	const headerRow = headers.join(',');
	
	const rows = categoryList.map(function(category){
		return headers.map(function(key){
			let value = String(category[key]);
			if(value.includes('"')){
				value = value.replace(/"/g, '""');
			}
			if(value.includes('"') || value.includes(',')){
				return `"${value}"`;
			}
			return value;
		}).join(',');
	});
	return [headerRow, ...rows].join('\n');
}
function syncTopCategoryFilterAll(){
	const allIncluded = categories.every(function(category){
		return !category.excludeFromTop;
	});
	document.getElementById('top-category-filter-all').checked = allIncluded;
}


function transactionsToCSV(transactionList) {
  const headers = ['id', 'date', 'description', 'category', 'amount', 'paymentMethod','statementId'];
  const headerRow = headers.join(',');

  const rows = transactionList.map(function(transaction) {
    return headers.map(function(key) {
		let value = String(transaction[key]);
		if(value.includes('"')){
			value = value.replace(/"/g, '""');
		}
		if(value.includes('"') || value.includes(',')){
			return `"${value}"`;
		}
		return value;
      
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
}

async function saveStatements(){
	const csvText = statementsToCSV(statements);
	
	await fetch('api/statements', {
		method: 'POST',
		headers: {'Content-Type': 'text/plain' },
		body: csvText
	});
}
async function saveCategories(){
	const csvText = categoriesToCSV(categories);
	
	await fetch('api/categories', {
		method: 'POST',
		headers: {'Content-Type': 'text/plain'},
		body: csvText
	});
}
async function loadTransactions(){
	const response = await fetch('/api/transactions');
	const text = await response.text();
	const result = Papa.parse(text, {header: true, dynamicTyping: true});
	transactions = result.data;
	loadCashBalance();
}

async function loadStatements(){
	const response = await fetch('/api/statements');
	const text = await response.text();
	const result = Papa.parse(text, {header: true, dynamicTyping: true});
	statements = result.data;
	
}

async function loadCategories(){
	const response = await fetch('/api/categories');
	const text = await response.text();
	const result = Papa.parse(text, {header: true, dynamicTyping: true});
	categories = result.data;
}

async function saveTransactions(){
	const csvText = transactionsToCSV(transactions);
	
	await fetch('api/transactions', {
		method: 'POST',
		headers: {'Content-Type': 'text/plain' },
		body: csvText
	});
}

async function init(){
	await loadCategories();
	await loadTransactions();
	await loadStatements();
	updateCreditAccrued()
	monthlySpending();
	loadCategoryTotals();
	populateTopCategoryFilterOptions(categories);
	const allIncluded = categories.every(function(category){
	return !category.excludeFromTop;
	});
	document.getElementById('top-category-filter-all').checked = allIncluded;
	syncTopCategoryFilterAll();
	const openStatement = statements.find(function(statement){
		return statement.status === "open";
	});
	if (openStatement) {
		document.getElementById('start-statement-date').value = openStatement.startDate;
	} else {
		document.getElementById('start-statement-date').value = getNextStartDefault();
	}
}


init();