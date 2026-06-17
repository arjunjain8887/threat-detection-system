var threats = [];
var currentThreatId = null;

async function fetchThreats() {
  try {
    var res = await fetch('/api/threats');
    if (!res.ok) throw new Error('Failed');
    threats = await res.json();

    document.getElementById('threatCount').textContent = threats.length;
    renderThreatsList();

    if (currentThreatId) {
      selectThreat(currentThreatId);
    } else if (threats.length > 0) {
      selectThreat(threats[0].id);
    }
  } catch (e) {
    console.error('Fetch threats error:', e);
    document.getElementById('threatsList').innerHTML = 
      '<div style="padding:20px;text-align:center;color:#64748b;">Failed to load threats</div>';
  }
}

function renderThreatsList() {
  var list = document.getElementById('threatsList');
  list.innerHTML = '';

  if (threats.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">No threats detected</div>';
    return;
  }

  threats.forEach(function(t) {
    var item = document.createElement('div');
    item.className = 'threat-item' + (t.is_blocked ? ' blocked' : '') + (t.id === currentThreatId ? ' active' : '');
    item.onclick = function() { selectThreat(t.id); };

    var sevClass = t.severity === 'CRITICAL' ? 'badge-critical' : 'badge-high';

    item.innerHTML = '<div class="t-ip">' + t.source_ip + '</div>' +
      '<div class="t-msg">' + t.message + '</div>' +
      '<div class="t-meta">' +
      '<span class="badge ' + sevClass + '">' + t.severity + '</span>' +
      '<span class="t-time">' + formatTime(t.timestamp) + '</span>' +
      '</div>';
    list.appendChild(item);
  });
}

async function selectThreat(id) {
  currentThreatId = id;

  document.querySelectorAll('.threat-item').forEach(function(el) { el.classList.remove('active'); });
  var idx = threats.findIndex(function(t) { return t.id === id; });
  var activeEl = document.querySelectorAll('.threat-item')[idx];
  if (activeEl) activeEl.classList.add('active');

  try {
    var res = await fetch('/api/threat/' + id);
    if (!res.ok) throw new Error('Failed');
    var t = await res.json();

    document.getElementById('tName').textContent = t.message || 'Unknown Threat';
    document.getElementById('tSrcIp').textContent = t.source_ip;
    document.getElementById('tDstIp').textContent = t.dest_ip;
    document.getElementById('tProto').textContent = t.protocol;
    document.getElementById('tPort').textContent = t.port;

    var sevBadge = t.severity === 'CRITICAL' 
      ? '<span class="badge badge-critical">Critical</span>'
      : '<span class="badge badge-high">High</span>';
    document.getElementById('tSeverity').innerHTML = sevBadge;

    var statusBadge = t.is_blocked 
      ? '<span class="badge badge-blocked">Blocked</span>'
      : '<span class="badge badge-new">Active</span>';
    document.getElementById('tStatus').innerHTML = statusBadge;

    document.getElementById('tTime').textContent = formatDate(t.timestamp);
    document.getElementById('tDesc').textContent = t.message;

    updateActionButtons(t.is_blocked, t.source_ip);

  } catch (e) {
    console.error('Load threat detail error:', e);
  }
}

function updateActionButtons(isBlocked, ip) {
  var blockBtn = document.getElementById('blockBtn');
  var unblockBtn = document.getElementById('unblockBtn');
  var status = document.getElementById('blockStatus');

  if (isBlocked) {
    blockBtn.style.display = 'none';
    unblockBtn.style.display = 'inline-block';
    unblockBtn.disabled = false;
    unblockBtn.textContent = 'UNBLOCK IP';
    status.textContent = 'IP is blocked';
    status.style.color = '#68d391';
  } else {
    blockBtn.style.display = 'inline-block';
    unblockBtn.style.display = 'none';
    blockBtn.disabled = false;
    blockBtn.textContent = 'BLOCK IP';
    blockBtn.classList.remove('blocked');
    status.textContent = '';
  }
}

async function blockCurrentIp() {
  if (!currentThreatId) return;

  var threat = threats.find(function(t) { return t.id === currentThreatId; });
  if (!threat || threat.is_blocked) return;

  var btn = document.getElementById('blockBtn');
  var status = document.getElementById('blockStatus');
  btn.disabled = true;
  btn.textContent = 'Blocking...';

  try {
    var res = await fetch('/api/block-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: threat.source_ip,
        threat_id: currentThreatId,
        reason: threat.message
      })
    });

    var result = await res.json();

    if (result.status === 'success' || result.status === 'exists') {
      threat.is_blocked = true;
      updateActionButtons(true, threat.source_ip);
      document.getElementById('tStatus').innerHTML = '<span class="badge badge-blocked">Blocked</span>';
      renderThreatsList();
    } else {
      btn.disabled = false;
      btn.textContent = 'BLOCK IP';
      status.textContent = (result.message || 'Failed');
      status.style.color = '#e8364a';
    }
  } catch (e) {
    console.error('Block IP error:', e);
    btn.disabled = false;
    btn.textContent = 'BLOCK IP';
    status.textContent = 'Network error';
    status.style.color = '#e8364a';
  }
}

async function unblockCurrentIp() {
  if (!currentThreatId) return;

  var threat = threats.find(function(t) { return t.id === currentThreatId; });
  if (!threat || !threat.is_blocked) return;

  var btn = document.getElementById('unblockBtn');
  var status = document.getElementById('blockStatus');
  btn.disabled = true;
  btn.textContent = 'Unblocking...';

  try {
    var res = await fetch('/api/unblock-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: threat.source_ip })
    });

    var result = await res.json();

    if (result.status === 'success') {
      threat.is_blocked = false;
      updateActionButtons(false, threat.source_ip);
      document.getElementById('tStatus').innerHTML = '<span class="badge badge-new">Active</span>';
      renderThreatsList();
    } else {
      btn.disabled = false;
      btn.textContent = 'UNBLOCK IP';
      status.textContent = (result.message || 'Failed');
      status.style.color = '#e8364a';
    }
  } catch (e) {
    console.error('Unblock IP error:', e);
    btn.disabled = false;
    btn.textContent = 'UNBLOCK IP';
    status.textContent = 'Network error';
    status.style.color = '#e8364a';
  }
}

function formatTime(ts) {
  if (!ts) return '-';
  if (ts.includes(' ')) return ts.split(' ')[1];
  return ts;
}

function formatDate(ts) {
  if (!ts) return '-';
  return ts;
}

document.addEventListener('DOMContentLoaded', function() {
  fetchThreats();
  setInterval(fetchThreats, 10000);
});