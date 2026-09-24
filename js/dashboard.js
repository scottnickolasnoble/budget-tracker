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
		updateConfigSection();
		document.getElementById('widget-config-modal').style.display = 'flex';
	}
});
 document.getElementById('widget-config-save').addEventListener('click', async function(){
	 const newType = document.getElementById('widget-config-type').value;
	 
	 await fetch(`/api/widgets/${currentlyEditingWidget.id}`, {
		 method: 'PATCH',
		 headers: {'Content-Type': 'application/json'},
		 body: JSON.stringify({
			 type: newType,
			 position: currentlyEditingWidget.position,
			 span: currentlyEditingWidget.span,
			 config: collectConfig(newType)
		 })
	 });
	 document.getElementById('widget-config-modal').style.display = 'none';
	 await loadWidgets();
	 renderAllWidgets(widgets, isEditMode);
 });
 
 document.getElementById('widget-config-cancel').addEventListener('click', async function(){
	 document.getElementById('widget-config-modal').style.display = 'none';
	 await loadWidgets();
	 renderAllWidgets(widgets, isEditMode);
 });
 document.getElementById('widget-config-type').addEventListener('change', updateConfigSection);
function populateWidgetTypeOptions(){
	const select = document.getElementById('widget-config-type');
	select.innerHTML = Object.keys(widgetCatalog).map(function(type){
		return `<option value="${type}">${widgetCatalog[type].label}</option> `
	}).join('');
}
function populateWidgetPicker() {
  document.querySelectorAll('.widget-picker-grid').forEach(function(grid) {
    grid.innerHTML = '';
  });

  Object.keys(widgetCatalog).forEach(function(type) {
    const entry = widgetCatalog[type];
    const grid = document.querySelector('.widget-picker-grid[data-section="' + entry.section + '"]');

    const card = document.createElement('div');
    card.className = 'card widget-picker-card';
    card.dataset.widgetType = type;
    card.innerHTML = `
      <p style="font-weight:500; margin:0 0 4px;">${entry.label}</p>
      <p class="text-soft" style="font-size:0.875rem; margin:0;">${entry.description}</p>
    `;

    grid.appendChild(card);
  });
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

function collectConfig(selectedType){
	const catalogEntry = widgetCatalog[selectedType];
	if(!catalogEntry.renderConfig){
		return {};
	}
	
	if (selectedType === 'topCategory'){
		const checkboxes = document.querySelectorAll('#widget-config-typespecific input[type="checkbox"]');
		const excludedCategoryIds = [];
		
		checkboxes.forEach(function(checkbox){
			if(!checkbox.checked){
				excludedCategoryIds.push(Number(checkbox.dataset.categoryId));
			}
		});
		return { excludedCategoryIds };
	}
	
	return {};
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
	populateWidgetPicker();
}


init();