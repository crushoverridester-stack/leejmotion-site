/* leejmotion.com — menu, copy button, position-control dial */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  /* ---------------------------------------------------------- menu */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  /* ---------------------------------------------------------- copy address */
  function copyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    var status = btn.parentNode.querySelector('.copy-status');
    var timer = 0;
    function report(ok) {
      if (!status) return;
      status.textContent = btn.getAttribute(ok ? 'data-done' : 'data-fail');
      clearTimeout(timer);
      timer = setTimeout(function () { status.textContent = ''; }, 4000);
    }
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { report(true); },
          function () { report(copyFallback(text)); });
      } else {
        report(copyFallback(text));
      }
    });
  });

  /* ---------------------------------------------------------- dial */
  var dial = document.querySelector('[data-dial]');
  if (!dial) return;

  var needle = dial.querySelector('.d-needle');
  var tgt = dial.querySelector('.d-target');
  var trace = document.querySelector('[data-trace]');
  var resp = trace ? trace.querySelector('.t-resp') : null;
  var ro = {
    target: document.querySelector('[data-ro="target"]'),
    angle: document.querySelector('[data-ro="angle"]'),
    error: document.querySelector('[data-ro="error"]')
  };
  var unit = dial.getAttribute('data-unit') || '';
  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // closed loop: theta'' = wn^2 (ref - theta) - 2 zeta wn theta'
  var WN = 10, ZETA = 0.7;
  var X0 = 44, X1 = 392, Y0 = 108, Y1 = 32, TWIN = 1.0;

  var theta = 135, omega = 0, ref = 135, theta0 = 135, span = 0, tStep = 0;
  var pts = [], raf = 0, last = 0;

  function wrap360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function shortest(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  function one(v) { var s = (Math.round(v * 10) / 10).toFixed(1); return s === '-0.0' ? '0.0' : s; }

  function render() {
    var a = wrap360(theta);
    if (a >= 359.95) a = 0;
    needle.setAttribute('transform', 'rotate(' + a.toFixed(2) + ' 200 200)');
    ro.angle.textContent = one(a);
    var e = ref - theta;
    ro.error.textContent = Math.abs(e) < 0.05 ? '0.0' : (e > 0 ? '+' : '−') + one(Math.abs(e));
  }

  function toXY(t, v) {
    if (v < -0.3) v = -0.3;
    if (v > 1.35) v = 1.35;
    return (X0 + (X1 - X0) * t / TWIN).toFixed(1) + ',' + (Y0 - v * (Y0 - Y1)).toFixed(1);
  }
  function drawPts() {
    if (!resp) return;
    resp.setAttribute('d', pts.length ? 'M' + pts.join(' L') : 'M' + X0 + ',' + Y0);
  }
  function analytic() {
    var wd = WN * Math.sqrt(1 - ZETA * ZETA), k = ZETA / Math.sqrt(1 - ZETA * ZETA);
    pts = [];
    for (var i = 0; i <= 174; i++) {
      var t = TWIN * i / 174;
      pts.push(toXY(t, 1 - Math.exp(-ZETA * WN * t) * (Math.cos(wd * t) + k * Math.sin(wd * t))));
    }
    drawPts();
  }

  function tick(ts) {
    if (!last) last = ts;
    var dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    var n = Math.max(1, Math.round(dt / 0.001)), h = dt / n;
    for (var i = 0; i < n; i++) {
      var acc = WN * WN * (ref - theta) - 2 * ZETA * WN * omega;
      omega += acc * h;
      theta += omega * h;
      tStep += h;
    }
    if (Math.abs(span) >= 1 && tStep <= TWIN + 0.02) {
      pts.push(toXY(Math.min(tStep, TWIN), (theta - theta0) / span));
      drawPts();
    }
    render();
    if (tStep > TWIN && Math.abs(ref - theta) < 0.02 && Math.abs(omega) < 0.05) {
      theta = ref; omega = 0; render();
      raf = 0; last = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function setTarget(deg, animate) {
    deg = wrap360(Math.round(deg));
    var d = shortest(deg - wrap360(theta));
    ref = theta + d;
    theta0 = theta;
    span = d;
    tStep = 0;
    tgt.setAttribute('transform', 'rotate(' + deg + ' 200 200)');
    dial.setAttribute('aria-valuenow', String(deg));
    dial.setAttribute('aria-valuetext', deg + unit);
    ro.target.textContent = one(deg);
    if (!animate || reduce.matches) {
      if (Math.abs(d) >= 1) analytic();
      theta = ref; omega = 0; render();
      return;
    }
    if (Math.abs(d) >= 1) { pts = [toXY(0, 0)]; drawPts(); }
    if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  }

  dial.addEventListener('pointerdown', function (e) {
    var r = dial.getBoundingClientRect();
    var x = e.clientX - (r.left + r.width / 2);
    var y = e.clientY - (r.top + r.height / 2);
    if (x * x + y * y < Math.pow(r.width * 0.05, 2)) return;
    setTarget(Math.atan2(x, -y) * 180 / Math.PI, true);
  });
  dial.addEventListener('keydown', function (e) {
    var cur = parseInt(dial.getAttribute('aria-valuenow'), 10) || 0;
    var stepSize = e.shiftKey ? 1 : 5, next = null;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': next = cur + stepSize; break;
      case 'ArrowLeft': case 'ArrowDown': next = cur - stepSize; break;
      case 'PageUp': next = cur + 45; break;
      case 'PageDown': next = cur - 45; break;
      case 'Home': next = 0; break;
      case 'End': next = 359; break;
    }
    if (next !== null) { e.preventDefault(); setTarget(next, true); }
  });

  // One demonstration when the bench first comes into view: 0 deg -> 135 deg.
  if (!reduce.matches && 'IntersectionObserver' in window) {
    theta = 0; ref = 0; theta0 = 0; omega = 0;
    tgt.setAttribute('transform', 'rotate(0 200 200)');
    dial.setAttribute('aria-valuenow', '0');
    dial.setAttribute('aria-valuetext', '0' + unit);
    ro.target.textContent = '0.0';
    render();
    if (resp) resp.setAttribute('d', 'M' + X0 + ',' + Y0);
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        setTimeout(function () { setTarget(135, true); }, 450);
      }
    }, { threshold: 0.5 });
    io.observe(dial);
  }
})();
