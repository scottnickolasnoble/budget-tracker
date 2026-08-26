/////FORM ELEMENT/////////
const form = document.getElementById('login-form');


/////SUBMIT PRESSED////////////
form.addEventListener('submit', function(event) {
	//////////PREVENTS PAGE FROM CONSTANTLY RELOADING
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
	
	window.location.href = "dashboard.html";
  // this function runs every time the form is submitted
});