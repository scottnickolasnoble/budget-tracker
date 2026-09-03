let categories = [];
let transactions = [];
let widgets = [];
let isEditMode = false;

document.getElementById('edit-layout-btn').addEventListener('click', function(event){
	isEditMode = !isEditMode;
	this.textContent = isEditMode ? 'Done editing' : 'Edit widgets';
	renderAllWidgets(widgets, isEditMode);
});

document.getElementById('widgets-container').addEventListener('click', async function(event){
	if (event.target.classList.contains('widget-remove-btn')){
		const widgetId = event.target.dataset.widgetId;
		await fetch(`/api/widgets/${widgetId}`, {method: 'DELETE'});
		await loadWidgets();
		renderAllWidgets(widgets, isEditMode);
	}
});

async function loadTransactions(){
	const response = await fetch('/api/transactions');
	transactions = await response.json();
}


async function loadCategories(){
	const response = await fetch('/api/categories');
	categories = await response.json();
}

async function loadWidgets(){
	const response = await fetch('/api/widgets');
	widgets = await response.json();
	
	if(widgets.length === 0){
		const defaults = [
		{ type: 'cashBalance', position: 0, span: 1, config: {}},
		{ type: 'monthlySpending', position: 1, span: 1, config: {}},
		{ type: 'creditAccrued', position: 2, span: 1, config: {}},
		{ type: 'topCategory', position: 3, span: 1, config: {}}
		];
		
		for (const widget of defaults){
			await fetch('/api/widgets', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(widget)
			});
		}
		const refreshed = await fetch('/api/widgets');
		widgets = await refreshed.json();
	}
}
async function init(){
	await loadCategories();
	await loadTransactions();
	await loadWidgets();
	
	
	renderAllWidgets(widgets, isEditMode);
	
}


init();