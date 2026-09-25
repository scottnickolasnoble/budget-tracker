let categories = [];
const addCategory = document.getElementById("add-category-btn");
const categoryModal = document.getElementById("category-modal");
const cancelCategory = document.getElementById("category-cancel-btn");
const categoryForm = document.getElementById("category-form");
const categoriesGrid = document.getElementById("user-categories-grid");
const categoryEmpty = document.getElementById("user-categories-empty");
addCategory.addEventListener('click',function(event){
	categoryModal.style.display = "flex";
	document.getElementById('category-id').value = "";
});
cancelCategory.addEventListener('click',function(event){
		categoryModal.style.display = 'none';
});

categoryForm.addEventListener("submit", async function(event){
	event.preventDefault();
	const categoryId = document.getElementById("category-id").value;
	const categoryName = document.getElementById("category-name").value;
	const categoryColor = document.getElementById("category-color").value;
	const categoryLimit = document.getElementById("category-limit").value;
	const nameExists = categories.some(function(category){
		return category.name.toLowerCase() === categoryName.toLowerCase() && category.id !== Number(categoryId);
	})
	if (nameExists){
		alert("A category with that name already exists.");
		return;
	}
	
	if(categoryId === ""){
	const newCategory = {
		id: Date.now(),
		name: categoryName,
		color: categoryColor,
		limit: categoryLimit
		};
		await fetch('/api/categories', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(newCategory)
		});
	} else {
		const editCategory = {
		name: categoryName,
		color: categoryColor,
		limit: categoryLimit
	};
	await fetch(`/api/categories/${categoryId}`, {
			method: 'PATCH',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(editCategory)
		});
}
	await loadCategories();
	categoryForm.reset();
	categoryModal.style.display = 'none';
	
});

categoriesGrid.addEventListener('click', async function(event){
	const categoryDiv = event.target.closest('.category-card');
	if(event.target.dataset.action === 'delete'){
		const idToDelete = Number(categoryDiv.dataset.categoryId);
		await fetch(`/api/categories/${idToDelete}`, {
			method: 'DELETE'
	});
	
	await loadCategories();
	
	} else if(event.target.dataset.action === 'edit'){
		const idToEdit = Number(categoryDiv.dataset.categoryId);
		const categoryToEdit = categories.find(function(category){
			return category.id === idToEdit
		})
		
		categoryModal.style.display = 'flex';
		document.getElementById('category-id').value = categoryToEdit.id;
		document.getElementById('category-name').value = categoryToEdit.name;
		document.getElementById('category-color').value = categoryToEdit.color;
		document.getElementById('category-limit').value = categoryToEdit.limit;
	}
});


function renderCategories(categoryList) {
	const grid = document.getElementById('user-categories-grid');
	grid.innerHTML = "";
	if(categories.length === 0){
		categoryEmpty.style.display = "flex";
	} else {
		categoryEmpty.style.display = "none";
	}
	categoryList.forEach(function(category){
		const card = document.createElement('div');
		card.dataset.categoryId = category.id;
		card.dataset.editable = true;
		card.className = 'card category-card';
		const name = category.name;
		const color = category.color;
		const limitText = (category.limit === null || category.limit === '') ? 'No limit set' : `Limit: $${category.limit} / month`;
		card.innerHTML = `
			<div class="flex-between mb-2">
				<span class = "tag" style="background:${color};">${category.name}</span>
				<div class = "flex gap-2">
					<button class = "btn btn-secondary" data-action="edit">Edit</button>
					<button class = "btn btn-danger" data-action = "delete">Delete</button>
				</div>
			</div>
			<p class = "field-hint" style = "margin:0;">${limitText}</p>
		`;
		grid.appendChild(card);
	})
}

async function loadCategories(){
	const response = await fetch('/api/categories');
	categories = await response.json();
	renderCategories(categories);
}


loadCategories();