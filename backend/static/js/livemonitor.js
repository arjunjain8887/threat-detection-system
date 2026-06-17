Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(79,209,197,0.08)';
Chart.defaults.font.family = "'Exo 2',sans-serif";
Chart.defaults.font.size = 10;

var minis = [];
var liveChart = null;
var currentTalkerTab = 'source';
var hasData = false;

function initCharts() {
  var miniCfg = function(id, color) {
    var c = document.getElementById(id);
    if (!c) return null;
    return new Chart(c.getContext('2d'), {
      type: 'line',
      data: { 
        labels: Array(20).fill(''), 
        datasets: [{ 
          data: Array(20).fill(0), 
          borderColor: color, 
          borderWidth: 1.5, 
          fill: true, 
          backgroundColor: color + '22', 
          tension: .4, 
          pointRadius: 0 
        }] 
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false }, tooltip: { enabled: false } }, 
        scales: { x: { display: false }, y: { display: false } }, 
        animation: { duration: 0 } 
      }
    });
  };

  minis = [
    miniCfg('m1', '#4fd1c5'), 
    miniCfg('m2', '#63b3ed'),
    miniCfg('m3', '#b794f4'), 
    miniCfg('m4', '#68d391'), 
    miniCfg('m5', '#f6ad55')
  ];

  var labels = [];
  var now = new Date();
  for (var i = 29; i >= 0; i--) { 
    var t = new Date(now - i * 2000); 
    labels.push(t.toTimeString().slice(0, 8)); 
  }

  liveChart = new Chart(document.getElementById('liveChart').getContext('2d'), {
    type: 'line',
    data: { 
      labels: labels, 
      datasets: [{ 
        label: 'Threat Level', 
        data: Array(30).fill(0), 
        borderColor: '#4fd1c5', 
        borderWidth: 2, 
        fill: true, 
        backgroundColor: 'rgba(79,209,197,0.06)', 
        tension: .4, 
        pointRadius: 0 
      }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { display: false }, 
        tooltip: { mode: 'index', intersect: false } 
      }, 
      scales: { 
        x: { ticks: { maxTicksLimit: 5 } }, 
        y: { beginAtZero: true } 
      } 
    }
  });

  window.protoChart = new Chart(document.getElementById('protoChart').getContext('2d'), {
    type: 'doughnut',
    data: { 
      labels: ['TCP', 'UDP', 'ICMP', 'Others'], 
      datasets: [{ 
        data: [0, 0, 0, 0], 
        backgroundColor: ['#63b3ed', '#f6ad55', '#b794f4', '#68d391'], 
        borderWidth: 0, 
        hoverOffset: 5 
      }] 
    },
    options: { 
      responsive: false, 
      cutout: '70%', 
      plugins: { 
        legend: { display: false }, 
        tooltip: { callbacks: { label: function(c) { return ' ' + c.label + ': ' + c.raw + '%'; } } } 
      } 
    }
  });
}

async function fetchLiveStats() {
  try {
    var res = await fetch('/api/live-stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    var data = await res.json();

    document.getElementById('pktVal').textContent = data.packets_per_sec.toLocaleString();
    document.getElementById('bytVal').textContent = data.bytes_per_sec + ' MB';
    document.getElementById('connVal').textContent = data.active_connections;
    document.getElementById('tcpVal').textContent = data.tcp_connections;
    document.getElementById('udpVal').textContent = data.udp_connections;

    hasData = data.packets_per_sec > 0 || data.active_connections > 0;
  } catch (e) {
    console.error('Stats fetch error:', e);
  }
}

async function fetchLiveTrafficGraph() {
  try {
    var res = await fetch('/api/live-traffic-graph');
    if (!res.ok) throw new Error('Failed to fetch graph');
    var data = await res.json();

    if (liveChart && data.labels && data.data) {
      var allZero = data.data.every(function(v) { return v === 0; });
      if (allZero) {
        liveChart.data.datasets[0].data = Array(30).fill(0);
      } else {
        liveChart.data.labels = data.labels;
        liveChart.data.datasets[0].data = data.data;
      }
      liveChart.update('none');
    }
  } catch (e) {
    console.error('Graph fetch error:', e);
  }
}

async function fetchLiveLogs() {
  try {
    var res = await fetch('/api/live-logs');
    if (!res.ok) throw new Error('Failed to fetch logs');
    var logs = await res.json();

    var body = document.getElementById('logBody');
    if (!body) return;

    body.innerHTML = '';

    if (!logs || logs.length === 0) {
      var row = document.createElement('tr');
      row.innerHTML = '<td colspan="6" style="text-align:center;color:#64748b;padding:20px;">No logs available. Send logs via /backend/logs endpoint.</td>';
      body.appendChild(row);
      return;
    }

    logs.forEach(function(log, idx) {
      var row = document.createElement('tr');
      row.innerHTML = '<td class="mono">' + log.time + '</td>' +
        '<td class="mono">' + log.source_ip + '</td>' +
        '<td class="mono">' + log.dest_ip + '</td>' +
        '<td>' + log.protocol + '</td>' +
        '<td>' + log.length + '</td>' +
        '<td>' + log.info + '</td>';
      if (idx === 0 && hasData) {
        row.style.background = 'rgba(79,209,197,0.05)';
        setTimeout(function() { row.style.background = ''; }, 500);
      }
      body.appendChild(row);
    });
  } catch (e) {
    console.error('Logs fetch error:', e);
  }
}

async function fetchTopTalkers() {
  try {
    var res = await fetch('/api/live-top-talkers');
    if (!res.ok) throw new Error('Failed to fetch talkers');
    var data = await res.json();

    var list = document.getElementById('talkerList');
    if (!list) return;

    var talkerData = currentTalkerTab === 'source' ? data.source : data.destination;

    var allEmpty = talkerData.every(function(item) { return item[1] === '0 MB' || item[1] === '0'; });
    if (allEmpty) {
      list.innerHTML = '<div style="text-align:center;color:#64748b;padding:15px;font-size:0.8rem;">No traffic data available</div>';
      return;
    }

    list.innerHTML = talkerData.map(function(item) {
      return '<div class="trow"><span class="mono">' + item[0] + '</span><span class="tval">' + item[1] + '</span></div>';
    }).join('');
  } catch (e) {
    console.error('Talkers fetch error:', e);
  }
}

async function fetchProtocols() {
  try {
    var res = await fetch('/api/live-protocols');
    if (!res.ok) throw new Error('Failed to fetch protocols');
    var data = await res.json();

    var total = data.tcp + data.udp + data.icmp + data.other;

    if (window.protoChart) {
      if (total === 0) {
        window.protoChart.data.datasets[0].data = [0, 0, 0, 0];
      } else {
        window.protoChart.data.datasets[0].data = [data.tcp, data.udp, data.icmp, data.other];
      }
      window.protoChart.update('none');
    }

    var legendItems = document.querySelectorAll('.leg-item strong');
    if (legendItems.length >= 4) {
      if (total === 0) {
        legendItems[0].textContent = '0%';
        legendItems[1].textContent = '0%';
        legendItems[2].textContent = '0%';
        legendItems[3].textContent = '0%';
      } else {
        legendItems[0].textContent = data.tcp + '%';
        legendItems[1].textContent = data.udp + '%';
        legendItems[2].textContent = data.icmp + '%';
        legendItems[3].textContent = data.other + '%';
      }
    }
  } catch (e) {
    console.error('Protocol fetch error:', e);
  }
}

async function fetchMiniCharts() {
  try {
    var res = await fetch('/api/live-severity-chart');
    if (!res.ok) throw new Error('Failed to fetch mini chart');
    var data = await res.json();

    var allZero = data.data.every(function(v) { return v === 0; });

    minis.forEach(function(m, idx) { 
      if (!m) return; 
      if (allZero) {
        m.data.datasets[0].data = Array(20).fill(0);
      } else {
        var val = data.data[idx % data.data.length] || 0;
        m.data.datasets[0].data.shift(); 
        m.data.datasets[0].data.push(val); 
      }
      m.update('none'); 
    });
  } catch (e) {
    console.error('Mini chart fetch error:', e);
  }
}

function switchTab(btn) {
  document.querySelectorAll('.ttab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  currentTalkerTab = btn.textContent.includes('Source') ? 'source' : 'destination';
  fetchTopTalkers();
}

function startLiveUpdates() {
  fetchLiveStats();
  fetchLiveTrafficGraph();
  fetchLiveLogs();
  fetchTopTalkers();
  fetchProtocols();
  fetchMiniCharts();

  setInterval(function() {
    fetchLiveStats();
    fetchMiniCharts();
  }, 1500);

  setInterval(function() {
    fetchLiveTrafficGraph();
    fetchProtocols();
  }, 3000);

  setInterval(function() {
    fetchLiveLogs();
    fetchTopTalkers();
  }, 2000);
}

document.addEventListener('DOMContentLoaded', function() {
  initCharts();
  startLiveUpdates();
});