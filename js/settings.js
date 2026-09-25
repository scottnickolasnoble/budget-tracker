async function loadAccount() {
  const response = await fetch('/api/auth/me');
  if (!response.ok) {
    return;
  }
  const user = await response.json();
  document.getElementById('settings-email').textContent = user.email;
  document.getElementById('settings-current-question').textContent = user.security_question ?? 'No security question set yet';
}

document.getElementById('password-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const message = document.getElementById('password-message');
  clearMessage(message);

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (currentPassword === '') {
    showMessage(message, 'Enter your current password', 'error');
    return;
  }
  if (newPassword.length < 8) {
    showMessage(message, 'Your new password must be at least 8 characters', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showMessage(message, "Your new passwords don't match", 'error');
    return;
  }

  const response = await fetch('/api/auth/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const result = await response.json();

  if (!response.ok) {
    showMessage(message, result.error, 'error');
    return;
  }

  event.target.reset();
  showMessage(message, 'Password updated', 'success');
});

document.getElementById('question-form').addEventListener('submit', async function(event) {
  event.preventDefault();
  const message = document.getElementById('question-message');
  clearMessage(message);

  const securityQuestion = document.getElementById('settings-question').value;
  const securityAnswer = document.getElementById('settings-answer').value;
  const currentPassword = document.getElementById('question-current-password').value;

  if (securityQuestion === '' || securityAnswer.trim() === '' || currentPassword === '') {
    showMessage(message, 'Choose a question, enter an answer, and enter your current password', 'error');
    return;
  }

  const response = await fetch('/api/auth/security-question', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, securityQuestion, securityAnswer })
  });
  const result = await response.json();

  if (!response.ok) {
    showMessage(message, result.error, 'error');
    return;
  }

  event.target.reset();
  showMessage(message, 'Security question updated', 'success');
  loadAccount();
});

loadAccount();