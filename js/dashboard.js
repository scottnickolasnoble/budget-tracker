let categories = [];
let transactions = [];
let widgets = [];
let isEditMode = false;
let currentlyEditingWidget = null;
let categoryChart = null;

document.getElementById('edit-layout-btn').addEventListener('click', function(event){
	isEditMode = !isEditMode;
	this.textContent = isEditMode ? 'Done editing' : 'Edit widgets';
	renderAllWidgets(widgets, isEditMode);
});

document.getElementById('add-transaction-btn').addEventListener('click',function(event){
	window.location.href = 'transactions.html';
});
document.getElementById('add-widget-close').addEventListener('click', function() {
  document.getElementById('add-widget-modal').style.display = 'none';
});

document.getElementById('add-widget-modal').addEventListener('click', async function(event) {
  const clickedPickerCard = event.target.closest('.widget-picker-card');
  if (!clickedPickerCard) {
    return;
  }

  const selectedType = clickedPickerCard.dataset.widgetType;

  await fetch('/api/widgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: selectedType,
      position: widgets.length,
      span: widgetCatalog[selectedType].defaultSpan,
      config: {}
    })
  });

  document.getElementById('add-widget-modal').style.display = 'none';
  await loadWidgets();
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
	
	if (event.target.id === 'add-widget-card') {
		document.getElementById('add-widget-modal').style.display = 'flex';
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
function renderCategoryLimits() {
  const currDate = getDate('current');
  const limitedCategories = categories.filter(function(category) {
    return category.limit !== null && category.limit !== '';
  });

  const list = document.getElementById('category-limits-list');
  const emptyMessage = document.getElementById('category-limits-empty');

  if (limitedCategories.length === 0) {
    list.innerHTML = '';
    emptyMessage.style.display = 'block';
    return;
  }

  emptyMessage.style.display = 'none';

  list.innerHTML = limitedCategories.map(function(category) {
    const spentTotal = transactions
      .filter(function(transaction) {
        return transaction.category_id === category.id &&
               transaction.date.startsWith(currDate) &&
               transaction.amount < 0;
      })
      .reduce(function(sum, transaction) {
        return sum + Math.abs(Number(transaction.amount));
      }, 0);

    const limitValue = Number(category.limit);
    const percentage = Math.min((spentTotal / limitValue) * 100, 100);

    return `
      <div class="limit-row">
        <div class="flex-between mb-2">
          <span class="tag" style="background:${category.color};">${category.name}</span>
          <span class="text-soft" style="font-size:0.875rem;">
            <span class="figure">$${spentTotal.toFixed(2)}</span> of
            <span class="figure">$${limitValue.toFixed(2)}</span>
          </span>
        </div>
        <div class="limit-bar">
          <div class="limit-bar-fill" style="width: ${percentage}%;"></div>
        </div>
      </div>
    `;
  }).join('');
} 

function renderCategoryChart() {
  const currDate = getDate('current');

  const spendingByCategory = transactions
    .filter(function(transaction) {
      return transaction.date.startsWith(currDate) && transaction.amount < 0;
    })
    .reduce(function(sum, transaction) {
      if (sum[transaction.category_id] === undefined) {
        sum[transaction.category_id] = 0;
      }
      sum[transaction.category_id] += Math.abs(Number(transaction.amount));
      return sum;
    }, {});

  const labels = [];
  const values = [];
  const colors = [];

  Object.entries(spendingByCategory).forEach(function(entry) {
    const category = categories.find(function(c) { return c.id === Number(entry[0]); });
    labels.push(category?.name ?? 'Uncategorized');
    values.push(entry[1]);
    colors.push(category?.color ?? '#B4B2A9');
  });

  const ctx = document.getElementById('category-chart');

  if (categoryChart) {
    categoryChart.destroy();
  }

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { size: 12 }, color: getComputedStyle(document.body).getPropertyValue('--ink') }
        }
      }
    }
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
	renderCategoryLimits();
	renderCategoryChart();
}


init();