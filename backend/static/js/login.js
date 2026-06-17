var togglePwd = document.getElementById('togglePwd');
var pwdInput = document.getElementById('password');
var eyeIcon = document.getElementById('eyeIcon');
var loginBtn = document.getElementById('loginBtn');
var registerBtn = document.getElementById('registerBtn');

registerBtn.addEventListener('click', function() {
  window.location.href = '/register';
});

togglePwd.addEventListener('click', function() {
  var show = pwdInput.type === 'password';
  pwdInput.type = show ? 'text' : 'password';
  if (show) {
    eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
});

var canvas = document.getElementById('bg');
var ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

var NODES = 38;
var nodes = Array.from({ length: NODES }, function() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - .5) * .4,
    vy: (Math.random() - .5) * .4,
    r: Math.random() * 2 + 1.5,
    pulse: Math.random() * Math.PI * 2
  };
});

var t = 0;
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  t += .012;

  nodes.forEach(function(n) {
    n.x += n.vx; n.y += n.vy;
    if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
    if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
    n.pulse += .025;
  });

  for (var i = 0; i < NODES; i++) {
    for (var j = i + 1; j < NODES; j++) {
      var dx = nodes[i].x - nodes[j].x;
      var dy = nodes[i].y - nodes[j].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 160) {
        var alpha = (1 - d / 160) * .55;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(26,107,255,' + alpha + ')';
        ctx.lineWidth = .8;
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }

  nodes.forEach(function(n) {
    var glow = (Math.sin(n.pulse) + 1) / 2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r + glow * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(61,139,255,' + (.55 + glow * .45) + ')';
    ctx.shadowColor = '#1a6bff';
    ctx.shadowBlur = 8 + glow * 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  requestAnimationFrame(draw);
}
draw();