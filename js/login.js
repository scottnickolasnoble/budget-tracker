/////FORM ELEMENT/////////
const form = document.getElementById('login-form');
const registerModal = document.getElementById('register-modal');
const openRegisterLink = document.getElementById('open-register-link');
const registerCancelBtn = document.getElementById('register-cancel');
const registerForm = document.getElementById('register-form');

const forgotModal = document.getElementById('forgot-modal');
const forgotMessage = document.getElementById('forgot-message');

function resetForgotModal() {
  document.getElementById('forgot-step-email').style.display = 'block';
  document.getElementById('forgot-step-reset').style.display = 'none';
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-answer').value = '';
  document.getElementById('forgot-new-password').value = '';
  forgotMessage.textContent = '';
}

document.getElementById('open-forgot-link').addEventListener('click', function(event) {
  event.preventDefault();
  resetForgotModal();
  forgotModal.style.display = 'flex';
});

document.getElementById('forgot-cancel').addEventListener('click', function() {
  forgotModal.style.display = 'none';
});

document.getElementById('forgot-continue').addEventListener('click', async function() {
  const email = document.getElementById('forgot-email').value.trim();
  forgotMessage.textContent = '';

  if (email === '') {
    forgotMessage.textContent = 'Enter your email';
    return;
  }

  const response = await fetch('/api/auth/forgot/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const result = await response.json();

  if (!response.ok) {
    forgotMessage.textContent = result.error;
    return;
  }

  document.getElementById('forgot-question').textContent = result.question;
  document.getElementById('forgot-step-email').style.display = 'none';
  document.getElementById('forgot-step-reset').style.display = 'block';
});

document.getElementById('forgot-submit').addEventListener('click', async function() {
  const email = document.getElementById('forgot-email').value.trim();
  const answer = document.getElementById('forgot-answer').value;
  const newPassword = document.getElementById('forgot-new-password').value;
  forgotMessage.textContent = '';

  if (answer.trim() === '' || newPassword.length < 8) {
    forgotMessage.textContent = 'Enter your answer and a new password of at least 8 characters';
    return;
  }

  const response = await fetch('/api/auth/forgot/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, answer, newPassword })
  });
  const result = await response.json();

  if (!response.ok) {
    forgotMessage.textContent = result.error;
    return;
  }

  forgotModal.style.display = 'none';
  showMessage(document.getElementById('login-message'), 'Password updated. Log in with your new password.', 'success');
});

openRegisterLink.addEventListener('click', function(event){
	event.preventDefault();
	registerModal.style.display = 'flex';
});

registerCancelBtn.addEventListener('click', function(event){
	registerModal.style.display = 'none';
});

registerForm.addEventListener('submit', async function(event){
	event.preventDefault();
	const securityQuestion = document.getElementById('register-question').value;
	const securityAnswer = document.getElementById('register-answer').value;
	const questionField = document.getElementById('register-question-field');
	const answerField = document.getElementById('register-answer-field');

questionField.classList.remove('has-error');
answerField.classList.remove('has-error');
	const email = document.getElementById('register-email').value;
	const password = document.getElementById('register-password').value;
	const emailField = document.getElementById('register-email-field');
	const passwordField = document.getElementById('register-message');
	const registerMessage = document.getElementById('register-message');
	
	emailField.classList.remove('has-error');
	passwordField.classList.remove('has-error');
	registerMessage.TextContent = '';
	
	let isValid = true;
	
	if (email === ''){
		emailField.classList.add('has-error');
		isValid = false;
	}
	
	if (password.length < 8){
		passwordField.classList.add('has-error');
		isValid = false;
	}
	
	if (!isValid){
		return;
	}
	if (securityQuestion === '') {
		questionField.classList.add('has-error');
		isValid = false;
	}

	if (securityAnswer.trim() === '') {
	answerField.classList.add('has-error');
	isValid = false;
	}
	const response = await fetch('/api/auth/register', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({email,password,securityQuestion,securityAnswer})
	});
	
	if (response.ok){
		registerModal.style.display = 'none';
		registerMessage.TextContent = 'Account created - login below.';
	} else {
		const result = await response.json();
		registerMessage.TextContent = result.error;
	}
	
	
})
/////SUBMIT PRESSED////////////
form.addEventListener('submit', async function(event) {
	//////////PREVENTS PAGE FROM CONSTANTLY RELOADING
	
	event.preventDefault();
	clearMessage(loginMessage);
	const email = document.getElementById('email').value;
	const password = document.getElementById('password').value;
	const emailField = document.getElementById('email-field');
	const passwordField = document.getElementById('password-field');
	const loginMessage = document.getElementById('login-message');
	
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
		showMessage(loginMessage, result.error, 'error');
	}
	
});

