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

function syncTopCategoryFilterAll(){
	const allIncluded = categories.every(function(category){
		return !category.excludeFromTop;
	});
	document.getElementById('top-category-filter-all').checked = allIncluded;
}

async function loadTransactions(){
	const response = await fetch('/api/transactions');
	const text = await response.text();
	const result = Papa.parse(text, {header: true, dynamicTyping: true});
	transactions = result.data;
	loadCashBalance();
}


async function loadCategories(){
	const response = await fetch('/api/categories');
	const text = await response.text();
	const result = Papa.parse(text, {header: true, dynamicTyping: true});
	categories = result.data;
}


async function init(){
	await loadCategories();
	await loadTransactions();
	await loadStatements();
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