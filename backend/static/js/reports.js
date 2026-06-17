var reportData = {};

async function loadReports() {
  await fetchStats();
  await fetchThreatsOverTime();
  await fetchSeverityDistribution();
  await fetchThreatTypes();
  await fetchTopAttackers();
  await fetchDailySummary();
  await fetchInsights();
}

async function fetchStats() {
  try {
    var res = await fetch('/api/reports-stats');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.stats = data;

    document.getElementById('statTotalThreats').textContent = data.total_threats.toLocaleString();
    document.getElementById('statCritical').textContent = data.critical_threats.toLocaleString();
    document.getElementById('statBlocked').textContent = data.blocked_ips.toLocaleString();
    document.getElementById('statTotalLogs').textContent = data.total_logs.toLocaleString();
  } catch (e) {
    console.error('Stats error:', e);
  }
}

async function fetchThreatsOverTime() {
  try {
    var res = await fetch('/api/reports-threats-over-time');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.threatsOverTime = data;

    if (data.length === 0) {
      document.getElementById('lineChartArea').innerHTML = '<text x="300" y="80" fill="#64748b" text-anchor="middle" font-size="14">No data available</text>';
      document.getElementById('xLabels').innerHTML = '';
      return;
    }

    var maxVal = Math.max.apply(null, data.map(function(d) { return d.total; })) || 1;
    var width = 600;
    var height = 160;
    var padding = 10;

    var points = data.map(function(d, i) {
      var x = (i / (data.length - 1)) * width;
      var y = height - ((d.total / maxVal) * (height - padding * 2)) - padding;
      return x + ',' + y;
    }).join(' ');

    var areaPath = 'M0,' + height + ' L' + points.replace(/ /g, ' L') + ' L' + width + ',' + height + ' Z';

    var svg = '<defs>' +
      '<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#3b6fd4" stop-opacity="0.35" />' +
      '<stop offset="100%" stop-color="#3b6fd4" stop-opacity="0" />' +
      '</linearGradient>' +
      '</defs>';

    for (var i = 0; i <= 5; i++) {
      var y = (i / 5) * height;
      svg += '<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y + '" stroke="#1a2035" stroke-width="1" />';
    }

    svg += '<path d="' + areaPath + '" fill="url(#lg)" />';
    svg += '<polyline points="' + points + '" fill="none" stroke="#5b8ef0" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />';

    data.forEach(function(d, i) {
      var x = (i / (data.length - 1)) * width;
      var y = height - ((d.total / maxVal) * (height - padding * 2)) - padding;
      svg += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#5b8ef0" />';
    });

    document.getElementById('lineChartArea').innerHTML = svg;

    var xLabels = document.getElementById('xLabels');
    xLabels.innerHTML = '';
    data.forEach(function(d) {
      var span = document.createElement('span');
      var dateParts = d.date.split('-');
      span.textContent = dateParts[1] + '/' + dateParts[2];
      xLabels.appendChild(span);
    });

    var yLabels = document.getElementById('yLabels');
    yLabels.innerHTML = '';
    for (var i = 5; i >= 0; i--) {
      var span = document.createElement('span');
      span.textContent = Math.round((i / 5) * maxVal);
      yLabels.appendChild(span);
    }

  } catch (e) {
    console.error('Line chart error:', e);
  }
}

async function fetchSeverityDistribution() {
  try {
    var res = await fetch('/api/reports-severity-distribution');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.severityDistribution = data;

    if (data.total === 0) {
      document.getElementById('donutSvg').innerHTML = '';
      document.getElementById('donutCenter').innerHTML = '<div class="dc-num">0</div><div class="dc-lbl">Total</div>';
      document.getElementById('donutLegend').innerHTML = '<div style="color:#64748b;font-size:12px;">No threats</div>';
      return;
    }

    var total = data.total;
    var items = data.data;

    var radius = 55;
    var circumference = 2 * Math.PI * radius;
    var offset = 0;

    var svg = '';
    items.forEach(function(item) {
      if (item.count > 0) {
        var dash = (item.count / total) * circumference;
        var gap = circumference - dash;
        svg += '<circle cx="75" cy="75" r="' + radius + '" fill="none" stroke="' + item.color + '" stroke-width="22" ' +
          'stroke-dasharray="' + dash + ' ' + gap + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 75 75)" />';
        offset += dash;
      }
    });

    document.getElementById('donutSvg').innerHTML = svg;
    document.getElementById('donutCenter').innerHTML = '<div class="dc-num">' + total + '</div><div class="dc-lbl">Total</div>';

    var legend = document.getElementById('donutLegend');
    legend.innerHTML = '';
    items.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'dl-item';
      div.innerHTML = '<span class="dl-dot" style="background:' + item.color + '"></span>' +
        '<span class="dl-name">' + item.name + '</span>' +
        '<span style="color:#c9d1e0">' + item.count + '</span>' +
        '<span class="dl-pct">(' + item.pct + '%)</span>';
      legend.appendChild(div);
    });

  } catch (e) {
    console.error('Donut chart error:', e);
  }
}

async function fetchThreatTypes() {
  try {
    var res = await fetch('/api/reports-threat-types');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.threatTypes = data;

    var container = document.getElementById('threatTypes');
    container.innerHTML = '';

    if (data.length === 0 || data[0].count === 0) {
      container.innerHTML = '<div style="color:#64748b;font-size:12px;padding:20px;text-align:center;">No threat data</div>';
      return;
    }

    var maxCount = Math.max.apply(null, data.map(function(d) { return d.count; })) || 1;

    data.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'threat-bar-row';
      var width = (item.count / maxCount) * 100;
      row.innerHTML = '<span class="tbl-name">' + item.name + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%;background:' + item.color + ';"></div></div>' +
        '<span class="tbl-pct">' + item.count + ' (' + item.pct + '%)</span>';
      container.appendChild(row);
    });

  } catch (e) {
    console.error('Threat types error:', e);
  }
}

async function fetchTopAttackers() {
  try {
    var res = await fetch('/api/reports-top-attackers');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.topAttackers = data;

    var tbody = document.getElementById('attackerIps');
    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#64748b;padding:20px;">No attacker data</td></tr>';
      return;
    }

    data.forEach(function(item) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + item.ip + '</td><td>' + item.count + ' (' + item.pct + '%)</td>';
      tbody.appendChild(tr);
    });

  } catch (e) {
    console.error('Top attackers error:', e);
  }
}

async function fetchDailySummary() {
  try {
    var res = await fetch('/api/reports-daily-summary');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.dailySummary = data;

    var tbody = document.getElementById('dailySummary');
    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:20px;">No daily data</td></tr>';
      return;
    }

    data.forEach(function(item) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + item.date + '</td>' +
        '<td>' + item.total + '</td>' +
        '<td>' + item.critical + '</td>' +
        '<td>' + item.high + '</td>' +
        '<td>' + item.medium + '</td>' +
        '<td>' + item.low + '</td>';
      tbody.appendChild(tr);
    });

  } catch (e) {
    console.error('Daily summary error:', e);
  }
}

async function fetchInsights() {
  try {
    var res = await fetch('/api/reports-insights');
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    reportData.insights = data;

    var container = document.getElementById('insights');
    container.innerHTML = '';

    if (data.length === 0) {
      container.innerHTML = '<div style="color:#64748b;font-size:12px;padding:20px;">No insights available</div>';
      return;
    }

    data.forEach(function(text) {
      var div = document.createElement('div');
      div.className = 'insight-item';
      div.innerHTML = '<span class="insight-check">✔</span>' + text;
      container.appendChild(div);
    });

  } catch (e) {
    console.error('Insights error:', e);
  }
}

async function exportReport() {
  alert("Export feature coming soon!");
  return;
}

document.addEventListener('DOMContentLoaded', function() {
  loadReports();
  setInterval(loadReports, 30000);
});