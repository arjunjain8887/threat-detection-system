var currentIP = '192.168.1.105';

function drawGauge(score) {
  var c = document.getElementById('gaugeCanvas');
  if (!c) return;
  var ctx = c.getContext('2d');
  var cx = 80, cy = 90, r = 62;
  ctx.clearRect(0, 0, 160, 100);

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.stroke();

  var end = Math.PI + (score / 100) * Math.PI;
  var g = ctx.createLinearGradient(0, 0, 160, 0);
  if (score < 40) {
    g.addColorStop(0, '#68d391');
    g.addColorStop(1, '#68d391');
  } else if (score < 70) {
    g.addColorStop(0, '#ecc94b');
    g.addColorStop(1, '#ecc94b');
  } else {
    g.addColorStop(0, '#68d391');
    g.addColorStop(.5, '#ecc94b');
    g.addColorStop(1, '#f56565');
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, end);
  ctx.strokeStyle = g;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.stroke();

  var nx = cx + r * Math.cos(end), ny = cy + r * Math.sin(end);
  ctx.beginPath();
  ctx.arc(nx, ny, 6, 0, 2 * Math.PI);
  ctx.fillStyle = score >= 70 ? '#f56565' : (score >= 40 ? '#ecc94b' : '#68d391');
  ctx.shadowBlur = 10;
  ctx.shadowColor = ctx.fillStyle;
  ctx.fill();
  ctx.shadowBlur = 0;
}

async function analyzeIP() {
  var ip = document.getElementById('ipInput').value.trim() || '192.168.1.105';
  currentIP = ip;

  document.getElementById('dispIP').textContent = ip;
  document.getElementById('gaugeVal').innerHTML = '...<span>/100</span>';
  document.getElementById('reputationBadge').textContent = 'Analyzing...';
  document.getElementById('riskBadge').textContent = '...';

  try {
    var res = await fetch('/api/analyze-ip/' + encodeURIComponent(ip));
    if (!res.ok) throw new Error('Failed to analyze IP');
    var data = await res.json();

    document.getElementById('dispIP').textContent = data.ip;

    var score = data.score;
    document.getElementById('gaugeVal').innerHTML = score + '<span>/100</span>';
    drawGauge(score);

    var badge = document.getElementById('reputationBadge');
    badge.textContent = data.reputation;
    badge.className = 'sbadge ' + data.badge;

    var risk = document.getElementById('riskBadge');
    risk.textContent = data.risk;
    risk.style.color = score >= 70 ? '#f56565' : (score >= 40 ? '#ecc94b' : '#68d391');

    document.getElementById('metaCountry').textContent = 'Local Network';
    document.getElementById('metaISP').textContent = 'Internal';
    document.getElementById('metaLastSeen').textContent = data.last_seen;
    document.getElementById('metaThreats').textContent = data.total_threats;
    document.getElementById('metaReputation').textContent = data.reputation;
    document.getElementById('metaReputation').style.color = score >= 70 ? '#f56565' : (score >= 40 ? '#ecc94b' : '#68d391');

    var activityList = document.getElementById('activityList');
    activityList.innerHTML = '';
    if (data.activity && data.activity.length > 0) {
      data.activity.forEach(function(act) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="dot-r"></span>' + act;
        activityList.appendChild(li);
      });
    } else {
      activityList.innerHTML = '<li><span class="dot-r"></span>No recent activity</li>';
    }

    var riskList = document.getElementById('riskList');
    riskList.innerHTML = '';
    if (data.risk_factors && data.risk_factors.length > 0) {
      data.risk_factors.forEach(function(factor) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="dot-r"></span>' + factor;
        riskList.appendChild(li);
      });
    } else {
      riskList.innerHTML = '<li><span class="dot-r"></span>No risk factors detected</li>';
    }

    if (data.is_blocked) {
      var blockedDiv = document.getElementById('blockedStatus');
      if (blockedDiv) {
        blockedDiv.style.display = 'block';
        blockedDiv.textContent = 'Blocked: ' + (data.blocked_reason || 'Manual block');
      }
    } else {
      var blockedDiv = document.getElementById('blockedStatus');
      if (blockedDiv) blockedDiv.style.display = 'none';
    }

  } catch (e) {
    console.error('IP Analysis error:', e);
    document.getElementById('gaugeVal').innerHTML = 'ERR<span>/100</span>';
    document.getElementById('reputationBadge').textContent = 'Error';
    document.getElementById('riskBadge').textContent = 'Failed';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  analyzeIP();
});