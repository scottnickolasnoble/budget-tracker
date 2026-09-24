/////FORM ELEMENT/////////
const form = document.getElementById('login-form');
const registerModal = document.getElementById('register-modal');
const openRegisterLink = document.getElementById('open-register-link');
const registerCancelBtn = document.getElementById('register-cancel');
const registerForm = document.getElementById('register-form');


openRegisterLink.addEventListener('click', function(event){
	event.preventDefault();
	registerModal.style.display = 'flex';
});

registerCancelBtn.addEventListener('click', function(event){
	registerModal.style.display = 'none';
});

/////SUBMIT PRESSED////////////
form.addEventListener('submit', async function(event) {
	//////////PREVENTS PAGE FROM CONSTANTLY RELOADING
	/*
	event.preventDefault();
	
	const email = document.getElementById('email').value;
	const password = document.getElementById('password').value;
	const emailField = document.getElementById('email-field');
	const passwordField = document.getElementById('password-field');
	
	emailField.classList.remove('has-error');
	passwordField.classList.remove('has-error');
	
	let isValid = true;
	
	if (email === ''){
		emailField.classList.add('has-error');
		isValid = false;
	}
	
	if (password.length < 8){
		passwordField.classList.add('has-error');
		isValid = false;
	}
	
	if(!isValid){
		return;
	}
	
const response = await fetch('/api/auth/login', {
	method: 'POST',
	headers: {'Content-Type' : 'application/json' },
	body: JSON.stringify({email,password})
});

	if(response.ok){
		window.location.href = 'dashboard.html';
	} else {
		const result = await response.json();
		loginMessage.textContent = result.error;
	}
	*/
});