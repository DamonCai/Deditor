document.getElementById('status').textContent = 'Local script loaded: 42';
document.getElementById('run').onclick = () => { document.getElementById('status').textContent = 'Button works: 43'; };
document.getElementById('form').onsubmit = event => { event.preventDefault(); document.getElementById('result').textContent = 'Form: ' + new FormData(event.target).get('value'); };
try { parent.document.body.dataset.changed = 'bad'; document.getElementById('isolation').textContent='FAILED'; }
catch { document.getElementById('isolation').textContent = 'Editor origin isolated'; }
