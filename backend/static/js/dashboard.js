Chart.defaults.color = '#64748b';
Chart.defaults.font.family = "'Syne', sans-serif";
Chart.defaults.font.size = 11;

var trafficChart = null;
var donutChart = null;

function loadDashboardStats() {
  fetch('/api/dashboard-stats')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.querySelector('#traffic-val').innerHTML = data.total_traffic + ' <sub>Events</sub>';

      var threatsCard = document.querySelector('.stat-card.c-red .stat-value');
      if (threatsCard) threatsCard.textContent = data.threats;

      var alertsCard = document.querySelector('.stat-card.c-orange .stat-value');
      if (alertsCard) alertsCard.textContent = data.alerts;

      var blockedCard = document.querySelector('.stat-card.c-green .stat-value');
      if (blockedCard) blockedCard.textContent = data.blocked;
    })
    .catch(function(err) { console.log('Stats error:', err); });
}

function loadTrafficData() {
  fetch('/api/traffic-data')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var trafficData = data.data || [40,55,48,62,45,70,58,75,65,82,70,88];
      miniSparkline('c-traffic', trafficData, '#3b82f6');
    })
    .catch(function() {
      miniSparkline('c-traffic', [40,55,48,62,45,70,58,75,65,82,70,88], '#3b82f6');
    });
}

function miniSparkline(id, data, color) {
  var canvas = document.getElementById(id);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var grd = ctx.createLinearGradient(0, 0, 0, 46);
  grd.addColorStop(0, color + '55');
  grd.addColorStop(1, color + '00');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function(_, i) { return i; }),
      datasets: [{
        data: data,
        fill: true,
        backgroundColor: grd,
        borderColor: color,
        borderWidth: 1.8,
        pointRadius: 0,
        tension: 0.4
      }]
    },
    options: {
      responsive: false,
      animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

function loadThreatsData() {
  fetch('/api/threats-by-severity')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var donutData = [
        data.Critical || 0,
        data.High || 0,
        data.Medium || 0,
        data.Low || 0
      ];

      var total = donutData.reduce(function(a, b) { return a + b; }, 0);

      document.getElementById('donut-total').textContent = total;
      document.getElementById('crit-count').textContent = donutData[0];
      document.getElementById('high-count').textContent = donutData[1];
      document.getElementById('med-count').textContent = donutData[2];
      document.getElementById('low-count').textContent = donutData[3];

      var donutCtx = document.getElementById('c-donut');
      if (!donutCtx) return;

      if (donutChart) {
        donutChart.destroy();
      }

      donutChart = new Chart(donutCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Critical', 'High', 'Medium', 'Low'],
          datasets: [{
            data: donutData,
            backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e'],
            borderColor: '#0d1117',
            borderWidth: 3,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          animation: { animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1e293b',
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              titleColor: '#94a3b8',
              bodyColor: '#e2e8f0',
              padding: 10,
              callbacks: {
                label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.parsed + ' threats'; }
              }
            }
          }
        }
      });
    })
    .catch(function() {
      miniSparkline('c-threats', [12,18,15,22,19,28,20,30,25,32,28,35], '#ef4444');
      miniSparkline('c-alerts',  [2,4,3,5,4,6,4,7,5,7,6,8],             '#f97316');
      miniSparkline('c-blocked', [8,10,9,11,10,12,11,13,12,14,13,15],   '#22c55e');
    });
}

function loadRecentAlerts() {
  fetch('/api/recent-alerts')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var alertsContainer = document.getElementById('alerts-panel');
      if (!alertsContainer) return;

      var existing = alertsContainer.querySelectorAll('.alert-item');
      existing.forEach(function(el) { el.remove(); });

      data.forEach(function(alert) {
        var div = document.createElement('div');
        div.className = 'alert-item';
        var color = alert.severity === 'CRITICAL' ? '#ef4444' : '#f97316';
        div.innerHTML = '<div class="alert-dot pulse" style="background:' + color + '"></div>' +
          '<div><div class="alert-name">' + alert.message.substring(0, 30) + '</div><div class="alert-ip">' + alert.ip + '</div></div>' +
          '<div class="alert-time">Just now</div>';
        alertsContainer.appendChild(div);
      });
    })
    .catch(function(err) { console.log('Alerts error:', err); });
}

function loadTrafficOverview() {
  fetch('/api/traffic-data')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var rawData = data.data || [];
      var labels = [];
      var incoming = [];
      var outgoing = [];

      for (var i = 0; i < 24; i++) {
        var h = i < 10 ? '0' + i : '' + i;
        labels.push(h + ':00');
        var val = rawData[i] || 0;
        incoming.push(val * 12 + Math.random() * 20);
        outgoing.push(val * 8 + Math.random() * 15);
      }

      drawTrafficChart(labels, incoming, outgoing);
    })
    .catch(function() {
      var labels = [];
      for (var i = 0; i < 24; i++) {
        var h = i < 10 ? '0' + i : '' + i;
        labels.push(h + ':00');
      }
      var incoming = [42,55,48,62,50,72,58,78,65,82,58,74,66,80,70,85,72,88,75,90,80,85,78,92];
      var outgoing = [28,35,30,42,38,50,40,55,44,58,46,52,48,62,50,68,52,72,55,70,60,65,62,75];
      drawTrafficChart(labels, incoming, outgoing);
    });
}

function drawTrafficChart(labels, incoming, outgoing) {
  var canvas = document.getElementById('c-traffic-overview');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  if (trafficChart) {
    trafficChart.destroy();
  }

  var gBlue = ctx.createLinearGradient(0, 0, 0, 170);
  gBlue.addColorStop(0, 'rgba(59,130,246,0.28)');
  gBlue.addColorStop(1, 'rgba(59,130,246,0)');

  var gPurple = ctx.createLinearGradient(0, 0, 0, 170);
  gPurple.addColorStop(0, 'rgba(168,85,247,0.2)');
  gPurple.addColorStop(1, 'rgba(168,85,247,0)');

  trafficChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Incoming',
          data: incoming,
          fill: true,
          backgroundColor: gBlue,
          borderColor: '#3b82f6',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4
        },
        {
          label: 'Outgoing',
          data: outgoing,
          fill: true,
          backgroundColor: gPurple,
          borderColor: '#a855f7',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 1000, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          padding: 10,
          callbacks: {
            label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + Math.round(ctx.parsed.y) + ' Mbps'; }
          }
        }
      },
      scales: {
        x: { 
          display: true,
          grid: { display: false },
          ticks: {
            color: '#334155',
            font: { size: 9 },
            maxTicksLimit: 7
          }
        },
        y: {
          display: true,
          position: 'left',
          min: 0, max: 100,
          ticks: {
            stepSize: 25,
            color: '#334155',
            font: { family: "'Space Mono', monospace", size: 9 },
            callback: function(v) { return v; }
          },
          grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
          border: { display: false }
        }
      }
    }
  });
}

window.addEventListener('load', function() {
  loadDashboardStats();
  loadTrafficData();
  loadThreatsData();
  loadTrafficOverview();
  loadRecentAlerts();

  setInterval(loadDashboardStats, 10000);
  setInterval(loadRecentAlerts, 10000);
});