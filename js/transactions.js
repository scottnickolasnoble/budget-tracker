const tbody = document.getElementById('transactions-body');
const transactionBtn = document.getElementById('add-transaction-btn');
const transactionModal = document.getElementById('transaction-modal');
const cancel = document.getElementById("transaction-cancel-btn");
const transactionForm = document.getElementById('transaction-form');
const categoryForm = document.getElementById('transaction-category');
const filterMonth = document.getElementById('filter-month');
const filterType = document.getElementById('filter-type');
const filterCategory = document.getElementById('filter-category');
const filterDescription = document.getElementById('filter-search');
const filterCategoryBtn = document.getElementById('category-filter-btn');
const filterCategoryLabel = document.getElementById('category-filter-label');
const filterCategoryForm = document.getElementById('category-filter-panel');
const filterPayment = document.getElementById('filter-payment');
let searchTimer;
const filterReset = document.getElementById('filter-reset-btn');
let transactions = [];
let categories = [];
document.getElementById("month-label").innerHTML = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });


document.addEventListener('click', function(event){
	const clickedInsideButton = event.target.closest('#category-filter-btn');
	const clickedInsidePanel = event.target.closest('#category-filter-panel');
	
	if (!clickedInsideButton && !clickedInsidePanel) {
		filterCategoryForm.style.display = 'none';
	}
});
filterReset.addEventListener('click',function(event){
	renderTransactions(transactions);
	resetFilters();
});
filterMonth.addEventListener('change',function(event){
	applyFilters();
	
});
//filterCategory.addEventListener('change',function(event){
	//applyFilters();
//});
filterType.addEventListener('change',function(event){
	applyFilters();
});
filterPayment.addEventListener('change', function(event){
	applyFilters();
});
filterCategoryBtn.addEventListener('click',function(event){
	console.log("test");
	if(filterCategoryForm.style.display === "none"){
		filterCategoryForm.style.display = "flex";
	} else {
		filterCategoryForm.style.display = "none";
	}
	
})
transactionBtn.addEventListener('click',function(event){
	transactionModal.style.display = 'flex';
	document.getElementById('transaction-id').value = "";
});
cancel.addEventListener('click',function(event){
		transactionModal.style.display = 'none';
});
filterDescription.addEventListener('input',function(event){
	clearTimeout(searchTimer);
	searchTimer = setTimeout(function(){
		applyFilters();
	}, 300);
});

filterCategoryForm.addEventListener('change', function(event){
	const allCheckbox = document.getElementById('category-filter-all');
	const categoryCheckboxes = Array.from(document.querySelectorAll('#category-filter-options input[type="checkbox"]'));

	if (event.target === allCheckbox) {
		// "All" was clicked directly — set every category checkbox to match it
		categoryCheckboxes.forEach(function(checkbox){
			checkbox.checked = allCheckbox.checked;
		});
	} else {
		// An individual category checkbox was clicked
		if (!event.target.checked) {
			// unchecking one always unchecks "All", regardless of the others
			allCheckbox.checked = false;
		} else {
			// this one was just checked — if literally every category box is now checked, re-check "All"
			const allNowChecked = categoryCheckboxes.every(function(checkbox){
				return checkbox.checked;
			});
			allCheckbox.checked = allNowChecked;
		}
	}

	applyFilters();
});
transactionForm.addEventListener('submit', async function(event) {
	event.preventDefault();
	//populateCategoryOptions(categories);
	const transactionId = document.getElementById('transaction-id').value;
	const transactionDate = document.getElementById('transaction-date').value;
	const transactionDescription = document.getElementById('transaction-description').value;
	const transactionCategory = document.getElementById('transaction-category').value;
	const transactionAmount = Number(document.getElementById('transaction-amount').value);
	const transactionType = document.getElementById('transaction-type').value;
	const transactionPaymentMethod = document.getElementById('transaction-payment-method').value;

	const signedAmount = transactionType === 'income' ? transactionAmount : transactionAmount * -1;

	if (transactionId === '') {
		const newTransaction = {
			date: transactionDate,
			description: transactionDescription,
			category_id: transactionCategory,
			amount: signedAmount,
			paymentmethod: transactionPaymentMethod
		};
		await fetch('/api/transactions', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(newTransaction)
		});
	} else {
		const updatedTransaction = {
			date: transactionDate,
			description: transactionDescription,
			category_id: transactionCategory,
			amount: signedAmount,
			paymentmethod: transactionPaymentMethod
			};
		
		await fetch(`/api/transactions/${transactionId}`, {
			method: 'PATCH',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(updatedTransaction)
		});
	}

	await loadTransactions();
	transactionForm.reset();
	transactionModal.style.display = 'none';
	
});

tbody.addEventListener('click',async function(event){
	//populateCategoryOptions(categories);
	
	const row = event.target.closest('tr');
	if(event.target.dataset.action === 'delete'){
		const idToDelete = Number(row.dataset.id);
		await fetch(`/api/transactions/${idToDelete}`, {
			method: 'DELETE'
	});
	
	
	applyFilters();
	await loadTransactions();
	} else if(event.target.dataset.action === 'edit'){
		const idToEdit = Number(row.dataset.id);
		const transactionToEdit = transactions.find(function(transaction){
			return transaction.id === idToEdit
		})
		
		transactionModal.style.display = 'flex';
		document.getElementById('transaction-id').value = transactionToEdit.id;
		document.getElementById('transaction-date').value = transactionToEdit.date;
		document.getElementById('transaction-description').value = transactionToEdit.description;
		document.getElementById('transaction-category').value = transactionToEdit.category;
		document.getElementById('transaction-amount').value = Math.abs(transactionToEdit.amount);
		document.getElementById('transaction-type').value = transactionToEdit.amount < 0 ? 'expense' : 'income';
		document.getElementById('transaction-payment-method').value = transactionToEdit.paymentMethod;
	}
		
	
	
	});
function populateCategoryOptions(categories){
	const optionsHTML = categories.map(function(category) {
		return `<option value="${category.id}">${category.name}</option>`;
	});
	categoryForm.innerHTML = optionsHTML.join('');
}

function populateCategoryFilterOptions(categories){
	const optionsHTML = categories.map(function(category){
		return `<label style="display:flex; align-items:center; gap: var(--space-2);">
			<input type="checkbox" value="${category.name}" checked style="width:auto; padding:0; flex-shrink:0;" />
			<span>${category.name}</span>
		</label>`;
	});
	document.getElementById('category-filter-options').innerHTML = optionsHTML.join("");
}
function renderTransactions(transactionList) {
	transactionList.sort(function(a,b){
		if(a.date > b.date){
			return -1;
		} else if(a.date < b.date){
			return 1;
		} else {
			return a.id > b.id ? -1 : 1;
		}
	});
	tbody.innerHTML = ''; // clear whatever's there before we redraw
	
	transactionList.forEach(function(transaction) {
    const matchingCategory = categories.find(function(category) {
    return category.id === transaction.category_id;
	});
	const tagColor = matchingCategory ? matchingCategory.color : 'var(--accent)';
	const row = document.createElement('tr');
    row.dataset.id = transaction.id;

    const amountClass = transaction.amount < 0 ? 'negative' : 'positive';
    const amountSign = transaction.amount < 0 ? '-' : '+';
    const amountAbs = Math.abs(transaction.amount).toFixed(2);

    row.innerHTML = `
      <td>${transaction.date}</td>
      <td>${transaction.description}</td>
      <td><span class="tag" style="background:${tagColor};">${matchingCategory?.name ?? 'Uncategorized'}</span></td>
      <td class="figure ${amountClass}">${amountSign}$${amountAbs}</td>
	  <td>${transaction.paymentmethod.charAt(0).toUpperCase() + transaction.paymentmethod.slice(1)}</td>
      <td>
        <button class="btn btn-secondary" data-action="edit">Edit</button>
        <button class="btn btn-danger" data-action="delete">Delete</button>
      </td>
    `;

    tbody.appendChild(row);
  });
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

function downloadCSV(csvString, fileName){
	const blob = new Blob([csvString],{type:'text/csv'});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	
	URL.revokeObjectURL(url);
	
}

async function loadTransactions(){
	const response = await fetch('/api/transactions');
	transactions = await response.json();
	renderTransactions(transactions);
}

async function saveTransactions(){
	const csvText = transactionsToCSV(transactions);
	
	await fetch('api/transactions', {
		method: 'POST',
		headers: {'Content-Type': 'text/plain' },
		body: csvText
	});
}

async function loadCategories(){
	const response = await fetch('/api/categories');
	categories = await response.json();
	populateCategoryOptions(categories);
	populateCategoryFilterOptions(categories);
}
function resetFilters(){
	document.getElementById("filter-month").value = "";
	document.getElementById("filter-type").value = "all";
	document.getElementById("category-filter-all").checked = true;
	populateCategoryFilterOptions(categories);
	const checkedBoxes = Array.from(document.querySelectorAll('#category-filter-options input[type="checkbox"]:checked'));
	const selectedCategories = checkedBoxes.map(function(checkbox){
		return checkbox.value;
	});
	filterCategoryLabel.textContent = `Categories (${selectedCategories.length})`;
	document.getElementById("filter-payment").value = "all";
	document.getElementById("filter-search").value = ""
}
function applyFilters(){
	const allCheckbox = document.getElementById('category-filter-all');
	const date = document.getElementById('filter-month').value;
	//const category = document.getElementById('filter-category').value;
	const type = document.getElementById('filter-type').value;
	const description = document.getElementById('filter-search').value;
	const payment = document.getElementById('filter-payment').value;
	
	const checkedBoxes = Array.from(document.querySelectorAll('#category-filter-options input[type="checkbox"]:checked'));
	const selectedCategories = checkedBoxes.map(function(checkbox){
		return checkbox.value;
	});
	if(selectedCategories.length === 0){
		filterCategoryLabel.textContent = "All categories";
	} else {
		filterCategoryLabel.textContent = `Categories (${selectedCategories.length})`;
	}
	
	const newTransactions = transactions.filter(function(transaction){
		
		const dateMatches = date === "" || transaction.date.startsWith(date);
		const categoryMatches = allCheckbox.checked || selectedCategories.includes(transaction.category);
		const typeMatches = type === "all" || (type === "income" ? transaction.amount > 0 : transaction.amount < 0);
		const paymentMatches = payment === "all" || transaction.paymentMethod === payment;
		const searchMatch = description === "" || transaction.description.toLowerCase().includes(description.toLowerCase());
		return dateMatches && categoryMatches && typeMatches && searchMatch && paymentMatches;
	});
	
	
	
	renderTransactions(newTransactions);
}

async function init(){
	await loadCategories();
	await loadTransactions();
}

init();
