var ALL_LOGS = [];

function loadLogs() {
    fetch('/api/logs')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            ALL_LOGS = data;
            renderLogs(ALL_LOGS);
        })
        .catch(function(error) { console.error(error); });
}

loadLogs();

setInterval(loadLogs, 5000);

fetch('/api/logs').then(function(response) { return response.json(); }).then(function(data) {
  renderLogs(data);
});

var SEV_CLASS = { Critical: 'critical', High: 'high', Medium: 'medium', Info: 'info' };

function renderLogs(logs) {
  var body = document.getElementById('logsBody');
  body.innerHTML = logs.map(function(l) {
    return '<tr>' +
      '<td class="mono">' + l.time + '</td>' +
      '<td>' + l.type + '</td>' +
      '<td>' + l.msg + '</td>' +
      '<td class="mono">' + l.src + '</td>' +
      '<td><span class="badge ' + (SEV_CLASS[l.sev] || '') + '">' + l.sev + '</span></td>' +
      '</tr>';
  }).join('');
  document.getElementById('rowCount').textContent = logs.length;
}

function filterLogs() {
  var type = document.getElementById('typeFilter').value;
  var sev = document.getElementById('sevFilter').value;
  var q = document.getElementById('searchInput').value.toLowerCase();
  var filtered = ALL_LOGS.filter(function(l) {
    return (!type || l.type === type) &&
      (!sev || l.sev === sev) &&
      (!q || l.msg.toLowerCase().includes(q) || l.src.toLowerCase().includes(q) || l.type.toLowerCase().includes(q));
  });
  renderLogs(filtered);
}

function setPage(btn) {
  document.querySelectorAll('.pbtn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}