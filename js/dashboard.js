let categories = [];
let transactions = [];
let widgets = [];
let isEditMode = false;
let currentlyEditingWidget = null;

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
		return;
	}
	const clickedCard = event.target.closest('.widget-card');
	if(clickedCard && isEditMode){
		const widgetId = clickedCard.dataset.widgetId;
		currentlyEditingWidget = widgets.find(function(widget){
			return widget.id === Number(widgetId);
		});
		document.getElementById('widget-config-type').value = currentlyEditingWidget.type;
		document.getElementById('widget-config-modal').style.display = 'flex';
	}
});
 document.getElementById('widget-config-save').addEventListener('click', async function(){
	 const newType = document.getElementById('widget-config-type').value;
	 
	 await fetch(`/api/widgets/${currentlyEditingWidgit.id}`, {
		 method: 'PATCH',
		 headers: {'Content-Type': 'application/json'},
		 body: JSON.stringify({
			 type: newType,
			 position: currentlyEditingWidget.position,
			 span: currentlyEditingWidget.span,
			 config: {}
		 })
	 });
	 document.getElementById('widget-config-modal').style.display = 'none';
	 await loadWidgets();
	 renderAllWidgets(widgets, isEditMode);
 });
function populateWidgetTypeOptions(){
	const select = document.getElementById(''widget-config-type');
	select.innerHTML = Object.keys(widgetCatalog).map(function(type){
		return `<option value="${type}">${widgetCatalog[type].label}</option> `
	}).join('');
}



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
	populateWidgetTypeOptions()
}


init();