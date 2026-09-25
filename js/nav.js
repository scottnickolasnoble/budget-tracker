function showMessage(element, text, type) {
  const icon = type === 'error' ? 'ti-alert-circle' : 'ti-circle-check';
  element.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i><span></span>`;
  element.querySelector('span').textContent = text;
  element.classList.remove('is-error', 'is-success');
  void element.offsetWidth;
  element.classList.add(type === 'error' ? 'is-error' : 'is-success');
}

function clearMessage(element) {
  element.classList.remove('is-error', 'is-success');
  element.innerHTML = '';
}

document.querySelectorAll('.logout-btn').forEach(function(button) {
  button.addEventListener('click', async function() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'index.html';
  });
});

async function checkSession() {
  const response = await fetch('/api/auth/me');
  if (response.status === 401) {
    window.location.href = 'index.html';
  }
}

checkSession();