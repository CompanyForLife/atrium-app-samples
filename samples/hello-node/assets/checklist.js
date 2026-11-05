// The saved order stays on screen until the server accepts the move.
(function () {
  var list = document.getElementById('checklist');
  var error = document.getElementById('order-error');
  var status = document.getElementById('order-status');
  var saving = false;

  function updateControls() {
    Array.from(list.children).forEach(function (row, index, rows) {
      row.querySelector('[data-move="-1"]').disabled = saving || index === 0;
      row.querySelector('[data-move="1"]').disabled = saving || index === rows.length - 1;
    });
  }

  list.addEventListener('click', async function (event) {
    var button = event.target.closest('button[data-move]');
    if (!button || saving || button.disabled) return;
    var row = button.closest('[data-id]');
    var rows = Array.from(list.children);
    var index = rows.indexOf(row);
    var nextIndex = index + Number(button.dataset.move);
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
    var nextRows = rows.slice();
    nextRows.splice(index, 1);
    nextRows.splice(nextIndex, 0, row);
    saving = true;
    error.hidden = true;
    status.textContent = 'Saving order...';
    list.setAttribute('aria-busy', 'true');
    updateControls();
    try {
      var response = await fetch('/steps/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionReference: checklist.connectionReference, token: checklist.token, order: nextRows.map(function (item) { return item.dataset.id; }) })
      });
      if (!response.ok) throw new Error('Save failed');
      nextRows.forEach(function (item) { list.appendChild(item); });
      status.textContent = 'Order saved';
    } catch {
      error.hidden = false;
      status.textContent = '';
    } finally {
      saving = false;
      list.removeAttribute('aria-busy');
      updateControls();
      // At a new boundary the pressed control is disabled. Focus its enabled peer.
      var focusTarget = button.disabled ? row.querySelector('button:not(:disabled)') : button;
      if (focusTarget) focusTarget.focus();
    }
  });
  updateControls();
}());
