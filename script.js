// ============================================================
//  MAPA POLÍTICO — script.js
//  Sin template literals, ES5-compatible + zoom/pan + filtro
// ============================================================

var DB_URL = 'database.json';
var PROG_LABELS = {
  economia:     '💰 Economía',
  social:       '🤝 Social',
  territorial:  '🗺️ Territorial',
  exterior:     '🌐 Exterior',
  medioambiente:'🌿 Medioambiente'
};

// State
var db = null;
var activePin = null;
var currentRegion = 'esp';
var filterMode = 'all'; // 'all' | 'seats' | 'estatales' | 'actuales'

var ESTATALES_IDS = ['pp', 'psoe', 'vox', 'podemos', 'sumar', 'erc', 'pnv', 'bildu', 'junts'];
var REP2_IDS = [
  'ceda_esp', 'ceda',
  're_esp', 're',
  'ct_30s_esp', 'ct_30s', 'ctc_30s', 'ctc_30s_esp',
  'fe_jons_30s', 'fe_jons_esp',
  'dlr_esp', 'dlr',
  'prr_esp', 'prr',
  'ir_esp', 'ir',
  'ur_esp', 'ur',
  'psoe_30s',
  'pce_30s',
  'poum_30s', 'poum',
  'cnt_fai', 'cnt'
];

var HIST_IDS = [
  // Transición y Democracia
  'ucd_esp', 'ucd',
  'ap_esp', 'ap',
  'pxc_esp', 'pxc',
  'csd_esp', 'csd',
  'pr_esp', 'pr', 'prplus', 'prplus_esp',
  'cdc_esp', 'cdc',
  'fa_esp', 'fa',
  'ctc_esp', 'ctc',
  'ph_esp', 'ph',
  'anticap_esp', 'anticapitalistas', 'anticap',
  'pln_esp', 'pln',
  'mes_esp', 'mes', 'mes_mallorca',
  'pce_trans', 'pce_trans_esp',
  'upyd_esp', 'upyd',
  'pdecat_esp', 'pdecat',
  // II República
  'ceda_esp', 'ceda',
  're_esp', 're',
  'ct_30s_esp', 'ct_30s', 'ctc_30s', 'ctc_30s_esp',
  'fe_jons_30s', 'fe_jons_esp',
  'dlr_esp', 'dlr',
  'prr_esp', 'prr',
  'ir_esp', 'ir',
  'ur_esp', 'ur',
  'psoe_30s',
  'pce_30s',
  'poum_30s', 'poum',
  'cnt_fai', 'cnt',
  // Otros extintos (por si acaso)
  'cj_esp', 'cj'
];

// ── Zoom / Pan state ──
var zoomLevel = 1;
var panX = 0;
var panY = 0;
var isDragging = false;
var didDrag = false;
var dragStartX = 0;
var dragStartY = 0;
var dragStartPanX = 0;
var dragStartPanY = 0;

function normalizePartyKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getPartyLogoUrl(partyKey) {
  if (!partyKey) return '';
  if (/^https?:\/\//i.test(partyKey)) return partyKey;
  if (!db || !db.parties) return '';

  var wanted = normalizePartyKey(partyKey);
  for (var i = 0; i < db.parties.length; i++) {
    var party = db.parties[i];
    if (
      normalizePartyKey(party.id) === wanted ||
      normalizePartyKey(party.acronym) === wanted ||
      normalizePartyKey(party.name) === wanted
    ) {
      return party.logo_url || '';
    }
  }
  return '';
}

function getChartPartyLogoUrl(party) {
  if (!party) return '';
  return getPartyLogoUrl(party.logo || party.id || party.acronym || party.name);
}

function getHostFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  var clean = String(url).replace(/^https?:\/\//i, '');
  return clean.split('/')[0].toLowerCase();
}

function getLogoProxyUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return url || '';
  var noScheme = String(url).replace(/^https?:\/\//i, '');
  return 'https://images.weserv.nl/?url=' + encodeURIComponent(noScheme);
}

function shouldUseLogoProxy(url) {
  var host = getHostFromUrl(url);
  if (!host) return false;

  if (host.indexOf('scontent-') === 0 || host.indexOf('fbcdn.net') !== -1) return true;
  if (host.indexOf('wixstatic.com') !== -1) return true;
  if (host.indexOf('wp.com') !== -1 || host.indexOf('wordpress.com') !== -1) return true;

  // These hosts often block hotlinking from local file origins.
  var blockedHosts = [
    'pacma.es',
    'www.pacma.es',
    'frenteobrero.es',
    'www.frenteobrero.es',
    'teruelexiste.info',
    'voltespana.org',
    'www.voltespana.org',
    'aberrieguna.eaj-pnv.eus',
    'democrats.eu',
    'www.democrats.eu',
    'lafranceinsoumise.fr',
    'www.lafranceinsoumise.fr',
    's3-eu-west-2.amazonaws.com',
    'wplondon.org.uk',
    'www.wplondon.org.uk',
    'europa2024.pirates.cat',
    'forwardparty.com',
    'www.forwardparty.com',
    'instituciones.sld.cu',
    'cir-integracion-racial-cuba.org',
    'somosmascuba.com',
    'www.somosmascuba.com',
    'mcliberacion.org',
    'calleochonews.com',
    'm.media-amazon.com',
    'i.ytimg.com',
    'd3n8a8pro7vhmx.cloudfront.net',
    'static.wixstatic.com'
  ];

  return blockedHosts.indexOf(host) !== -1;
}

function getSafeImageUrl(url, forceProxy) {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;
  if (forceProxy) return getLogoProxyUrl(url);
  return shouldUseLogoProxy(url) ? getLogoProxyUrl(url) : url;
}

function getSafeLogoUrl(url) {
  return getSafeImageUrl(url, false);
}

function setLogoImage(img, url, failCallback) {
  if (!img) return;
  var originalUrl = url || '';
  if (!originalUrl) {
    if (typeof failCallback === 'function') failCallback();
    return;
  }

  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.dataset.originalLogoUrl = originalUrl;
  img.dataset.logoProxyTried = '0';

  img.onerror = function() {
    if (img.dataset.logoProxyTried !== '1') {
      img.dataset.logoProxyTried = '1';
      img.src = getLogoProxyUrl(originalUrl);
      return;
    }
    if (typeof failCallback === 'function') failCallback();
  };

  img.src = getSafeLogoUrl(originalUrl);
}

function getChartEligibleParties() {
  if (!currentChartHistory || !currentChartHistory.parties) return [];
  return currentChartHistory.parties.filter(function(p) {
    return !!getChartPartyLogoUrl(p);
  });
}

function getVisibleChartParties() {
  return getChartEligibleParties().filter(function(p) {
    return p.visible && getChartPartyLogoUrl(p);
  });
}

// ============================================================
//  BOOTSTRAP
// ============================================================
function loadData() {
  fetch(DB_URL)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      db = data;
      setupRegionSwitcher();
      buildGrid();
      initZoom();
      initSearch();
      buildPins();
      var btnAll = document.getElementById('btnAll');
      var btnSeats = document.getElementById('btnSeats');
      var btnEst = document.getElementById('btnEstatales');
      
      if (btnAll) btnAll.classList.add('active');
      if (btnSeats) btnSeats.style.display = 'flex';
      if (btnEst) btnEst.style.display = 'flex';
      if (btnSeats) btnSeats.classList.remove('active');
      if (btnEst) btnEst.classList.remove('active');

      // Show chart btn for esp (default)
      var btnChart = document.getElementById('btnChart');
      if (btnChart) btnChart.style.display = 'flex';

      var btnParl = document.getElementById('btnParliament');
      if (btnParl) btnParl.style.display = regionHasSeats(currentRegion) ? 'flex' : 'none';
    })
    .catch(function(e) {
      console.warn('Error cargando database.json:', e);
      db = { parties: [] };
      setupRegionSwitcher();
      buildGrid();
      initZoom();
      initSearch();
      buildPins();
    });
}

function regionHasSeats(region) {
  if (!db || !db.parties) return false;
  for (var i = 0; i < db.parties.length; i++) {
    var p = db.parties[i];
    var inReg = Array.isArray(p.region)
      ? p.region.indexOf(region) !== -1
      : p.region === region;
    if (inReg && p.seats_congress > 0 && HIST_IDS.indexOf(p.id) === -1) {
      return true;
    }
  }
  return false;
}

// ============================================================
//  REGION SWITCHER
// ============================================================
function setupRegionSwitcher() {
  var buttons = document.querySelectorAll('.region-btn');
  var lastTouchTime = 0;

  function activateRegion(btn) {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.remove('active');
    }
    btn.classList.add('active');
    currentRegion = btn.dataset.region;

    var sub = document.getElementById('headerSubtitle');
    var labels = {
      esp: 'España - Posicionamiento ideológico - 2024-2026',
      gal: 'Galicia - Posicionamiento ideológico - 2024-2026',
      ue:  'Unión Europea - Posicionamiento ideológico - 2024-2026',
      usa: 'Estados Unidos - Posicionamiento ideológico - 2024-2026',
      arg: 'Argentina - Posicionamiento ideológico - 2024-2026',
      fra: 'Francia - Posicionamiento ideológico - 2024-2026',
      ger: 'Alemania - Posicionamiento ideológico - 2024-2026',
      uk:  'Reino Unido - Posicionamiento ideológico - 2024-2026',
      ita: 'Italia - Posicionamiento ideológico - 2024-2026',
      chi: 'Chile - Posicionamiento ideológico - 2024-2026',
      per: 'Perú - Posicionamiento ideológico - 2024-2026',
      cub: 'Cuba - Posicionamiento ideológico - 2024-2026'
    };
    var tabTitles = {
      esp: 'Mapa de política de España',
      gal: 'Mapa de política de Galicia',
      ue:  'Mapa de política de la Unión Europea',
      usa: 'Mapa de política de EEUU',
      arg: 'Mapa de política de Argentina',
      fra: 'Mapa de política de Francia',
      ger: 'Mapa de política de Alemania',
      uk:  'Mapa de política de Reino Unido',
      ita: 'Mapa de política de Italia',
      chi: 'Mapa de política de Chile',
      per: 'Mapa de política de Perú',
      cub: 'Mapa de política de Cuba'
    };
    if (sub) sub.textContent = labels[currentRegion] || '';
    document.title = tabTitles[currentRegion] || 'MAPA POLÍTICO';

    filterMode = 'all';
    var btnAll = document.getElementById('btnAll');
    var btnSeats = document.getElementById('btnSeats');
    var btnEst = document.getElementById('btnEstatales');
    var btnActuales = document.getElementById('btnActuales');
    var btnRep2 = document.getElementById('btnRep2');
    var btnHist = document.getElementById('btnHist');
    
    if (btnAll) {
      btnAll.style.display = (currentRegion === 'esp' || currentRegion === 'gal') ? 'flex' : 'none';
      btnAll.classList.toggle('active', filterMode === 'all');
    }
    if (btnSeats) {
      btnSeats.style.display = (currentRegion === 'esp' || currentRegion === 'gal') ? 'flex' : 'none';
      btnSeats.classList.remove('active');
    }
    if (btnEst) {
      btnEst.style.display = (currentRegion === 'esp') ? 'flex' : 'none';
      btnEst.classList.remove('active');
    }
    if (btnActuales) {
      btnActuales.style.display = (currentRegion === 'esp') ? 'flex' : 'none';
      btnActuales.classList.toggle('active', filterMode === 'actuales');
    }
    if (btnRep2) {
      btnRep2.style.display = (currentRegion === 'esp') ? 'flex' : 'none';
      btnRep2.classList.remove('active');
    }
    if (btnHist) {
      btnHist.style.display = (currentRegion === 'esp') ? 'flex' : 'none';
      btnHist.classList.remove('active');
    }

    // Chart button: ONLY esp and usa
    var btnChart = document.getElementById('btnChart');
    var showChart = (currentRegion === 'esp' || currentRegion === 'usa');
    if (btnChart) btnChart.style.display = showChart ? 'flex' : 'none';

    // Parliament button: show only if region has parties with seats
    var btnParl = document.getElementById('btnParliament');
    if (btnParl) btnParl.style.display = regionHasSeats(currentRegion) ? 'flex' : 'none';

    // Reset canvas so hover events re-bind with correct data
    var canvas = document.getElementById('chartCanvas');
    if (canvas) canvas.dataset.inited = '';

    resetZoom();
    deselectAll();
    buildPins();
  }

  function onTouchEnd(e, btn) {
    lastTouchTime = Date.now();
    activateRegion(btn);
  }

  function onClick(e, btn) {
    if (Date.now() - lastTouchTime < 400) return;
    activateRegion(btn);
  }

  for (var i = 0; i < buttons.length; i++) {
    (function(btn) {
      btn.addEventListener('touchend', function(e) { onTouchEnd(e, btn); }, { passive: true });
      btn.addEventListener('click', function(e) { onClick(e, btn); });
    })(buttons[i]);
  }
}


// ============================================================
//  FILTER
// ============================================================
function setFilter(mode) {
  filterMode = mode;
  var btnAll = document.getElementById('btnAll');
  var btnSeats = document.getElementById('btnSeats');
  var btnEst = document.getElementById('btnEstatales');
  var btnActuales = document.getElementById('btnActuales');
  var btnRep2 = document.getElementById('btnRep2');
  var btnHist = document.getElementById('btnHist');
  
  if (btnAll) btnAll.classList.toggle('active', mode === 'all');
  if (btnSeats) btnSeats.classList.toggle('active', mode === 'seats');
  if (btnEst) btnEst.classList.toggle('active', mode === 'estatales');
  if (btnActuales) btnActuales.classList.toggle('active', mode === 'actuales');
  if (btnRep2) btnRep2.classList.toggle('active', mode === 'rep2');
  if (btnHist) btnHist.classList.toggle('active', mode === 'hist');
  
  deselectAll();
  buildPins();
}

// ============================================================
//  GRID
// ============================================================
function buildGrid() {
  var container = document.getElementById('gridLines');
  if (!container) return;
  var steps = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875];
  steps.forEach(function(t) {
    var h = document.createElement('div');
    h.className = 'grid-line-h';
    h.style.top = (t * 100) + '%';
    container.appendChild(h);
    var v = document.createElement('div');
    v.className = 'grid-line-v';
    v.style.left = (t * 100) + '%';
    container.appendChild(v);
  });
}

// ============================================================
//  PINS
// ============================================================
function buildPins() {
  var inner = document.getElementById('compassInner');
  if (!inner) return;

  // Remove only party pins (not the static quadrant/axis elements)
  var oldPins = inner.querySelectorAll('.party-pin');
  oldPins.forEach(function(p) { p.remove(); });

  if (!db || !db.parties) return;

  var filtered = db.parties.filter(function(p) {
    var inRegion = Array.isArray(p.region)
      ? p.region.indexOf(currentRegion) !== -1
      : p.region === currentRegion;
    if (!inRegion) return false;

    if (filterMode === 'seats' && (currentRegion === 'esp' || currentRegion === 'gal')) {
      return p.seats_congress > 0;
    }
    if (filterMode === 'estatales' && currentRegion === 'esp') {
      return ESTATALES_IDS.indexOf(p.id) !== -1;
    }
    if (filterMode === 'actuales' && currentRegion === 'esp') {
      return HIST_IDS.indexOf(p.id) === -1;
    }
    if (filterMode === 'rep2' && currentRegion === 'esp') {
      return REP2_IDS.indexOf(p.id) !== -1;
    }
    if (filterMode === 'hist' && currentRegion === 'esp') {
      return HIST_IDS.indexOf(p.id) !== -1;
    }
    return true;
  });

  filtered.forEach(function(party) {
    var pin = document.createElement('div');
    pin.className = 'party-pin';
    pin.setAttribute('data-id', party.id);

    var xPct = ((party.position.x + 1) / 2) * 100;
    var yPct = ((1 - party.position.y) / 2) * 100;
    pin.style.left = xPct + '%';
    pin.style.top  = yPct + '%';

    var bubble = document.createElement('div');
    bubble.className = 'pin-bubble';
    bubble.style.borderColor = party.color + '88';

    var img = document.createElement('img');
    img.loading = 'eager';
    img.width = 32;
    img.height = 32;
    img.style.objectFit = 'contain';
    img.alt = party.acronym;
    setLogoImage(img, party.logo_url || '', function() {
      bubble.classList.add('no-logo');
      bubble.style.background = party.color + '33';
    });

    var acr = document.createElement('div');
    acr.className = 'pin-acronym';
    acr.textContent = party.acronym;
    acr.style.color = party.color_secondary || party.color;

    bubble.appendChild(img);
    bubble.appendChild(acr);

    var lbl = document.createElement('div');
    lbl.className = 'pin-label';
    lbl.textContent = party.acronym;

    pin.appendChild(bubble);
    pin.appendChild(lbl);

    (function(pid) {
      pin.addEventListener('click', function(e) {
        e.stopPropagation();
        selectParty(pid);
      });
    })(party.id);

    inner.appendChild(pin);
  });

  buildSideList(filtered);
}

function buildSideList(parties) {
  var scroll = document.getElementById('partyListScroll');
  var total = document.getElementById('partyListTotal');
  var regionName = document.getElementById('partyListRegionName');
  if (!scroll || !total || !regionName) return;

  var regionLabels = {
    esp: 'España',
    gal: 'Galicia',
    ue: 'Unión Europea',
    usa: 'EE.UU.',
    arg: 'Argentina',
    fra: 'Francia',
    ger: 'Alemania',
    uk: 'Reino Unido',
    ita: 'Italia',
    chi: 'Chile',
    per: 'Perú',
    cub: 'Cuba'
  };
  regionName.textContent = regionLabels[currentRegion] || 'Región';
  total.textContent = 'Total: ' + parties.length;

  scroll.innerHTML = '';
  parties.forEach(function(party) {
    var item = document.createElement('div');
    item.className = 'party-list-item';
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      selectParty(party.id);
    });

    var img = document.createElement('img');
    img.alt = party.acronym;
     setLogoImage(img, party.logo_url || '', function() {
       this.style.display = 'none';
     }.bind(img));

    var info = document.createElement('div');
    info.className = 'party-list-item-info';

    var name = document.createElement('div');
    name.className = 'party-list-item-name';
    name.textContent = party.name || party.acronym;

    var acronym = document.createElement('div');
    acronym.className = 'party-list-item-acronym';
    acronym.textContent = party.acronym || '';

    info.appendChild(name);
    if (party.acronym) info.appendChild(acronym);
    
    item.appendChild(img);
    item.appendChild(info);

    scroll.appendChild(item);
  });
}

// ============================================================
//  ZOOM / PAN  (clean, bug-free implementation)
// ============================================================
function applyTransform() {
  var inner = document.getElementById('compassInner');
  if (!inner) return;
  inner.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoomLevel + ')';

  // Update cursor
  var compassEl = document.getElementById('compass');
  if (compassEl) {
    compassEl.style.cursor = (zoomLevel > 1) ? 'grab' : 'default';
  }
}

function clampPan() {
  var compassEl = document.getElementById('compass');
  if (!compassEl) return;
  var w = compassEl.offsetWidth;
  var h = compassEl.offsetHeight;
  // Prevent panning beyond original edges
  panX = Math.min(0, Math.max(w - w * zoomLevel, panX));
  panY = Math.min(0, Math.max(h - h * zoomLevel, panY));
}

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  applyTransform();
}

function zoomAt(factor, centerX, centerY) {
  // centerX/centerY are coordinates relative to the compass element
  var newZoom = zoomLevel * factor;
  newZoom = Math.max(1, Math.min(6, newZoom));
  if (newZoom === zoomLevel) return;

  // Point in world space before zoom change
  var worldX = (centerX - panX) / zoomLevel;
  var worldY = (centerY - panY) / zoomLevel;

  zoomLevel = newZoom;

  // Adjust pan so the same world point stays under the cursor
  panX = centerX - worldX * zoomLevel;
  panY = centerY - worldY * zoomLevel;

  clampPan();
  applyTransform();
}

function initZoom() {
  var compassEl = document.getElementById('compass');
  if (!compassEl) return;

  // ── Mouse wheel zoom ──
  compassEl.addEventListener('wheel', function(e) {
    e.preventDefault();
    var rect = compassEl.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var factor = e.deltaY < 0 ? 1.12 : 0.9;
    zoomAt(factor, mx, my);
  }, { passive: false });

  // ── Mouse drag (pan) ──
  compassEl.addEventListener('mousedown', function(e) {
    // Only drag on the compass background or inner (not on pins directly launching selection)
    if (e.button !== 0) return;
    isDragging = true;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panX;
    dragStartPanY = panY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
    if (!didDrag || zoomLevel <= 1) return;
    panX = dragStartPanX + dx;
    panY = dragStartPanY + dy;
    clampPan();
    applyTransform();
    compassEl.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      applyTransform(); // restore cursor
    }
  });

  // ── Double click: reset zoom ──
  compassEl.addEventListener('dblclick', function(e) {
    if (e.target.closest('.party-pin')) return;
    resetZoom();
  });

  // ── Click outside pins: deselect (only if not dragging) ──
  compassEl.addEventListener('click', function(e) {
    if (didDrag) { didDrag = false; return; }
    if (!e.target.closest('.party-pin')) {
      deselectAll();
    }
  });

  // ── Zoom buttons ──
  var btnIn = document.getElementById('btnZoomIn');
  var btnOut = document.getElementById('btnZoomOut');
  var btnReset = document.getElementById('btnZoomReset');
  if (btnIn) btnIn.addEventListener('click', function() {
    var rect = compassEl.getBoundingClientRect();
    zoomAt(1.25, rect.width / 2, rect.height / 2);
  });
  if (btnOut) btnOut.addEventListener('click', function() {
    var rect = compassEl.getBoundingClientRect();
    zoomAt(0.8, rect.width / 2, rect.height / 2);
  });
  if (btnReset) btnReset.addEventListener('click', resetZoom);

  // ── Touch support ──
  var lastTouchDist = null;
  var lastTouchMidX = 0;
  var lastTouchMidY = 0;
  var touchPanStartX = 0;
  var touchPanStartY = 0;

  compassEl.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      var t1 = e.touches[0], t2 = e.touches[1];
      lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      var rect = compassEl.getBoundingClientRect();
      lastTouchMidX = ((t1.clientX + t2.clientX) / 2) - rect.left;
      lastTouchMidY = ((t1.clientY + t2.clientY) / 2) - rect.top;
      e.preventDefault();
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      touchPanStartX = e.touches[0].clientX - panX;
      touchPanStartY = e.touches[0].clientY - panY;
      e.preventDefault();
    }
  }, { passive: false });

  compassEl.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      var t1 = e.touches[0], t2 = e.touches[1];
      var dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (lastTouchDist) {
        var factor = dist / lastTouchDist;
        zoomAt(factor, lastTouchMidX, lastTouchMidY);
      }
      lastTouchDist = dist;
      e.preventDefault();
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      panX = e.touches[0].clientX - touchPanStartX;
      panY = e.touches[0].clientY - touchPanStartY;
      clampPan();
      applyTransform();
      e.preventDefault();
    }
  }, { passive: false });

  compassEl.addEventListener('touchend', function() {
    lastTouchDist = null;
  });
}

// ============================================================
//  SELECT PARTY
// ============================================================
function selectParty(id) {
  if (!db) return;
  var party = null;
  for (var i = 0; i < db.parties.length; i++) {
    if (db.parties[i].id === id) { party = db.parties[i]; break; }
  }
  if (!party) return;

  // Deselect all others
  document.querySelectorAll('.party-pin').forEach(function(p) { p.classList.remove('active'); });
  var pin = document.querySelector('.party-pin[data-id="' + id + '"]');
  if (pin) pin.classList.add('active');
  activePin = id;

  // Populate panel
  document.getElementById('panelEmpty').style.display = 'none';
  document.getElementById('panelContent').classList.add('visible');

  var logoImg = document.getElementById('pLogo');
  setLogoImage(logoImg, party.logo_url || '', function() {
    logoImg.parentElement.classList.add('logo-err');
  });
  logoImg.alt = party.name;
  logoImg.parentElement.classList.remove('logo-err');

  document.getElementById('pAcronym').textContent = party.acronym;
  document.getElementById('pName').textContent = party.name;
  document.getElementById('pLeader').textContent = '\u21b3 ' + (party.leader || '');
  var leaderImgUrl = party.leader_img || '';
  var pLeaderImg = document.getElementById('pLeaderImg');
  if (pLeaderImg) {
    pLeaderImg.alt = party.leader || '';
    if (leaderImgUrl) {
      pLeaderImg.style.display = 'block';
      if (pLeaderImg.parentElement) pLeaderImg.parentElement.style.display = 'block';
      setLogoImage(pLeaderImg, leaderImgUrl, function() {
        pLeaderImg.style.display = 'none';
        if (pLeaderImg.parentElement) pLeaderImg.parentElement.style.display = 'none';
      });
    } else {
      pLeaderImg.style.display = 'none';
      if (pLeaderImg.parentElement) pLeaderImg.parentElement.style.display = 'none';
    }
  }

  document.getElementById('pSeats').textContent = party.seats_congress;
  document.getElementById('pFounded').textContent = party.founded;
  document.getElementById('pDesc').textContent = party.description || '';

  // Position bars
  var posDiv = document.getElementById('positionBars');
  posDiv.innerHTML = '';
  var xLbl = party.position.x < 0 ? 'Izquierda' : 'Derecha';
  var yLbl = party.position.y > 0 ? 'Comunitarista' : 'Individualista';
  posDiv.appendChild(makePosBar(xLbl, Math.abs(party.position.x), party.position.x >= 0 ? '#2980b9' : '#e74c3c'));
  posDiv.appendChild(makePosBar(yLbl, Math.abs(party.position.y), party.position.y >= 0 ? '#8e44ad' : '#e67e22'));

  // Ideology tags
  var tagsDiv = document.getElementById('ideologyTags');
  var tagsHtml = '';
  var rawTagColor = party.color_secondary || party.color || '#fff';
  
  // Ensure readable color for text
  var displayTagColor = rawTagColor;
  if (rawTagColor.indexOf('#') === 0) {
    var h = rawTagColor.slice(1);
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    var brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 70) displayTagColor = '#aaa'; // Lighten if too dark
  }

  var ideologies = party.ideology || [];
  for (var t = 0; t < ideologies.length; t++) {
    tagsHtml += '<span class="tag" style="border-color:' + rawTagColor + '44; color:' + displayTagColor + '; background: rgba(255,255,255,0.03);">' + ideologies[t] + '</span>';
  }
  tagsDiv.innerHTML = tagsHtml;

  // Programa accordion
  var progDiv = document.getElementById('programaItems');
  progDiv.innerHTML = '';
  if (party.programa) {
    var keys = Object.keys(party.programa);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = party.programa[key];
      var item = document.createElement('div');
      item.className = 'prog-item';
      var header = document.createElement('div');
      header.className = 'prog-header';
      var labelSpan = document.createElement('span');
      labelSpan.textContent = PROG_LABELS[key] || key;
      var chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.textContent = '\u203a';
      header.appendChild(labelSpan);
      header.appendChild(chevron);
      var body = document.createElement('div');
      body.className = 'prog-body';
      var para = document.createElement('p');
      para.textContent = val;
      body.appendChild(para);
      (function(it) {
        header.addEventListener('click', function() { it.classList.toggle('open'); });
      })(item);
      item.appendChild(header);
      item.appendChild(body);
      progDiv.appendChild(item);
    }
  }

  // Members section
  var memSection = document.getElementById('membersSection');
  var memList = document.getElementById('membersList');
  memList.innerHTML = '';
  var hasMembers = party.members && party.members.length > 0;
  var hasIntl = party.international_members && party.international_members.length > 0;

  if (hasMembers || hasIntl) {
    memSection.style.display = 'block';
    if (hasMembers) {
      for (var m = 0; m < party.members.length; m++) {
        var memberId = party.members[m];
        var member = null;
        for (var mm = 0; mm < db.parties.length; mm++) {
          if (db.parties[mm].id === memberId) { member = db.parties[mm]; break; }
        }
        if (!member) continue;
        var badge = document.createElement('div');
        badge.className = 'member-badge';
        badge.title = member.name;
        var mImg = document.createElement('img');
        mImg.alt = member.acronym;
        setLogoImage(mImg, member.logo_url || '', function() { mImg.style.display = 'none'; });
        var mSpan = document.createElement('span');
        mSpan.textContent = member.acronym;
        mSpan.style.color = member.color_secondary || member.color;
        badge.appendChild(mImg);
        badge.appendChild(mSpan);
        (function(mid, mreg) {
          badge.addEventListener('click', function(e) {
            e.stopPropagation();
            var tr = 'esp';
            if (Array.isArray(mreg)) {
              if (mreg.indexOf('esp') === -1) tr = mreg[0];
            } else { tr = mreg; }
            var btn = document.querySelector('.region-btn[data-region="' + tr + '"]');
            if (btn) btn.click();
            setTimeout(function() { selectParty(mid); }, 60);
          });
        })(memberId, member.region);
        memList.appendChild(badge);
      }
    }
    if (hasIntl) {
      for (var n = 0; n < party.international_members.length; n++) {
        var intlBadge = document.createElement('div');
        intlBadge.className = 'member-badge';
        intlBadge.style.cursor = 'default';
        var intlSpan = document.createElement('span');
        intlSpan.textContent = '\uD83C\uDF0D ' + party.international_members[n];
        intlBadge.appendChild(intlSpan);
        memList.appendChild(intlBadge);
      }
    }
  } else {
    memSection.style.display = 'none';
  }

  var link = document.getElementById('pWebsite');
  link.href = party.website || '#';
  link.style.display = party.website ? 'inline-flex' : 'none';

  // Evolution logic removed per user request
  closeEvolution();

  // Mobile scroll to info
  if (window.innerWidth <= 768) {
    setTimeout(function() {
      var panel = document.querySelector('.side-panel');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }
}

// ============================================================
//  HELPERS
// ============================================================
function makePosBar(label, intensity, color) {
  var row = document.createElement('div');
  row.className = 'pos-row';
  var lbl = document.createElement('div');
  lbl.className = 'pos-label';
  lbl.textContent = label;
  var track = document.createElement('div');
  track.className = 'pos-track';
  var fill = document.createElement('div');
  fill.className = 'pos-fill';
  fill.style.width = (intensity * 100) + '%';
  fill.style.background = 'linear-gradient(to right,' + color + '44,' + color + ')';
  var dot = document.createElement('div');
  dot.className = 'pos-dot';
  dot.style.left = (intensity * 100) + '%';
  dot.style.background = color;
  track.appendChild(fill);
  track.appendChild(dot);
  row.appendChild(lbl);
  row.appendChild(track);
  return row;
}

function deselectAll() {
  document.querySelectorAll('.party-pin').forEach(function(p) { p.classList.remove('active'); });
  activePin = null;
  document.getElementById('panelEmpty').style.display = '';
  document.getElementById('panelContent').classList.remove('visible');
  var btnEvo = document.getElementById('btnEvolution');
  if (btnEvo) btnEvo.style.display = 'none';
  closeEvolution();
}

// ============================================================
//  SEARCH
// ============================================================
function initSearch() {
  var input = document.getElementById('searchInput');
  var dropdown = document.getElementById('searchDropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', function() {
    var query = input.value.trim().toLowerCase();
    if (query.length < 2) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      return;
    }
    if (!db || !db.parties) return;

    var results = db.parties.filter(function(p) {
      return (
        p.name.toLowerCase().indexOf(query) !== -1 ||
        p.acronym.toLowerCase().indexOf(query) !== -1 ||
        (p.leader && p.leader.toLowerCase().indexOf(query) !== -1)
      );
    }).slice(0, 8);

    dropdown.innerHTML = '';
    if (results.length === 0) {
      var noRes = document.createElement('div');
      noRes.className = 'search-no-results';
      noRes.textContent = 'Sin resultados';
      dropdown.appendChild(noRes);
    } else {
      results.forEach(function(party) {
        var item = document.createElement('div');
        item.className = 'search-result';

        var logo = document.createElement('img');
        logo.className = 'search-result-logo';
        logo.alt = party.acronym;
        setLogoImage(logo, party.logo_url || '', function() {
          logo.style.background = party.color + '44';
          logo.src = '';
        });

        var info = document.createElement('div');
        info.className = 'search-result-info';

        var name = document.createElement('div');
        name.className = 'search-result-name';
        name.textContent = party.name;

        var leader = document.createElement('div');
        leader.className = 'search-result-leader';
        leader.textContent = party.leader || '';

        info.appendChild(name);
        info.appendChild(leader);
        item.appendChild(logo);
        item.appendChild(info);

        (function(p) {
          item.addEventListener('click', function() {
            // Switch to correct region first
            var targetRegion = Array.isArray(p.region) ? p.region[0] : p.region;
            var btn = document.querySelector('.region-btn[data-region="' + targetRegion + '"]');
            if (btn && targetRegion !== currentRegion) btn.click();
            setTimeout(function() {
              selectParty(p.id);
              // Highlight the pin
              var pin = document.querySelector('.party-pin[data-id="' + p.id + '"]');
              if (pin) {
                pin.scrollIntoView && pin.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 60);
            input.value = '';
            dropdown.classList.remove('open');
            dropdown.innerHTML = '';
          });
        })(party);

        dropdown.appendChild(item);
      });
    }
    dropdown.classList.add('open');
  });

  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Close on Escape
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      input.value = '';
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
    }
  });
}

// ============================================================
//  HISTORICAL CHART — desde 1977
// ============================================================
var SEATS_HISTORY = {
  elections: ['1977','1979','1982','1986','1989','1993','1996','2000','2004','2008','2011','2015','2016','Abr 19','Nov 19','2023'],
  fullYears:  ['15 Jun 1977','1 Mar 1979','28 Oct 1982','22 Jun 1986','29 Oct 1989','6 Jun 1993','3 Mar 1996','12 Mar 2000','14 Mar 2004','9 Mar 2008','20 Nov 2011','20 Dic 2015','26 Jun 2016','28 Abr 2019','10 Nov 2019','23 Jul 2023'],
  presidents: ['Adolfo Suárez', 'Adolfo Suárez', 'Felipe González', 'Felipe González', 'Felipe González', 'Felipe González', 'José M. Aznar', 'José M. Aznar', 'J.L. Rodríguez Zapatero', 'J.L. Rodríguez Zapatero', 'Mariano Rajoy', 'Mariano Rajoy', 'Mariano Rajoy', 'Pedro Sánchez', 'Pedro Sánchez', 'Pedro Sánchez'],
  presidentLogos: [
    'ucd',
    'ucd',
    'psoe',
    'psoe',
    'psoe',
    'psoe',
    'pp',
    'pp',
    'psoe',
    'psoe',
    'pp',
    'pp',
    'pp',
    'psoe',
    'psoe',
    'psoe'
  ],
  parties: [
    { id:'pp',      name:'AP/PP',       color:'#4A90D9', logo:'pp', data:[16, 9,  107,105,107,141,156,183,148,154,186,123,137, 66, 88,137], visible:true  },
    { id:'psoe',    name:'PSOE',        color:'#E05555', logo:'psoe', data:[118,121,202,184,175,159,141,125,164,169,110, 90, 85,123,120,120], visible:true  },
    { id:'ciudadanos', name:'Ciudadanos', color:'#FF6D00', logo:'ciudadanos', data:[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 32, 57, 10, 0], visible:true  },
    { id:'ucd',     name:'UCD',         color:'#F5A623', logo:'ucd', data:[165,168, 11,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0], visible:true  },
    { id:'pce',     name:'PCE',         color:'#CC3333', logo:'pce', data:[ 20, 23,  4,  7, 17, 18, 21,  8,  5,  2, 11,  2,  2,  0,  0,  0], visible:true  },
    { id:'ciu',     name:'CiU',         color:'#E8A000', logo:'', data:[ 11,  8, 12, 18, 18, 17, 16, 15, 10, 10, 16,  8,  8,  0,  0,  0], visible:false },
    { id:'vox',     name:'VOX',         color:'#5CB85C', logo:'vox', data:[  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 24, 52, 33], visible:true  },
    { id:'podemos', name:'Podemos/UP',  color:'#9B6ED4', logo:'podemos', data:[  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 69, 71, 42, 35,  0], visible:true  },
    { id:'sumar',   name:'Sumar',       color:'#E4003A', logo:'sumar', data:[  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 31], visible:true  },
    { id:'erc',     name:'ERC',         color:'#FFCC00', logo:'erc', data:[  1,  1,  1,  2,  2,  4,  4,  1,  8,  3,  3,  9,  9, 15, 13,  7], visible:false },
    { id:'pnv',     name:'PNV',         color:'#27AE60', logo:'pnv', data:[  8,  7,  8,  6,  5,  5,  5,  7,  7,  6,  5,  6,  5,  6,  6,  5], visible:false },
    { id:'bildu',   name:'EH Bildu',    color:'#AACC00', logo:'bildu', data:[  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  7,  2,  2,  4,  5,  6], visible:false },
    { id:'junts',   name:'Junts/JxCat', color:'#00BCD4', logo:'junts', data:[  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  7,  8,  7], visible:false }
  ]
};

var chartHoverIdx = -1;
var chartTooltipEl = null;
var currentChartHistory = null;

// USA House of Representatives by election year (1856-2024)
var USA_SEATS_HISTORY = {
  elections: ['1856','1860','1864','1868','1872','1876','1880','1884','1888','1892','1896','1900','1904','1908','1912','1916','1920','1924','1928','1932','1936','1940','1944','1948','1952','1956','1960','1964','1968','1972','1976','1980','1984','1988','1992','1996','2000','2004','2008','2012','2016','2020','2024'],
  fullYears:  ['Nov 1856','Nov 1860','Nov 1864','Nov 1868','Nov 1872','Nov 1876','Nov 1880','Nov 1884','Nov 1888','Nov 1892','Nov 1896','Nov 1900','Nov 1904','Nov 1908','Nov 1912','Nov 1916','Nov 1920','Nov 1924','Nov 1928','Nov 1932','Nov 1936','Nov 1940','Nov 1944','Nov 1948','Nov 1952','Nov 1956','Nov 1960','Nov 1964','Nov 1968','Nov 1972','Nov 1976','Nov 1980','Nov 1984','Nov 1988','Nov 1992','Nov 1996','Nov 2000','Nov 2004','Nov 2008','Nov 2012','Nov 2016','Nov 2020','Nov 2024'],
  presidents: ['James Buchanan', 'Abraham Lincoln', 'Abraham Lincoln', 'Ulysses S. Grant', 'Ulysses S. Grant', 'Rutherford B. Hayes', 'James A. Garfield', 'Grover Cleveland', 'Benjamin Harrison', 'Grover Cleveland', 'William McKinley', 'William McKinley', 'Theodore Roosevelt', 'William H. Taft', 'Woodrow Wilson', 'Woodrow Wilson', 'Warren G. Harding', 'Calvin Coolidge', 'Herbert Hoover', 'Franklin D. Roosevelt', 'Franklin D. Roosevelt', 'Franklin D. Roosevelt', 'Franklin D. Roosevelt', 'Harry S. Truman', 'Dwight D. Eisenhower', 'Dwight D. Eisenhower', 'John F. Kennedy', 'Lyndon B. Johnson', 'Richard Nixon', 'Richard Nixon', 'Jimmy Carter', 'Ronald Reagan', 'Ronald Reagan', 'George H.W. Bush', 'Bill Clinton', 'Bill Clinton', 'George W. Bush', 'George W. Bush', 'Barack Obama', 'Barack Obama', 'Donald Trump', 'Joe Biden', 'Donald Trump'],
  presidentLogos: [
    'dem_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'dem_us',
    'gop_us',
    'dem_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'dem_us',
    'dem_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'dem_us',
    'dem_us',
    'dem_us',
    'dem_us',
    'dem_us',
    'gop_us',
    'gop_us',
    'dem_us',
    'dem_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'gop_us',
    'dem_us',
    'dem_us',
    'gop_us',
    'gop_us',
    'dem_us',
    'dem_us',
    'gop_us',
    'dem_us',
    'gop_us'
  ],
  parties: [
    { id:'dem', name:'Partido Demócrata', color:'#4A90D9', logo:'dem_us', data:[133,44,43,67,88,155,128,183,152,218,134,151,136,172,291,214,131,183,163,313,334,267,242,262,213,234,262,295,243,242,292,242,253,260,258,206,212,202,257,201,194,222,215], visible:true },
    { id:'rep', name:'Partido Republicano', color:'#E05555', logo:'gop_us', data:[90,108,136,171,199,136,151,141,179,124,206,198,250,219,134,215,302,247,267,117,88,162,190,171,221,201,174,140,192,192,143,192,182,175,176,228,221,232,178,234,241,213,220], visible:true }
  ]
};

function openChart() {
  var modal = document.getElementById('chartModal');
  if (!modal) return;

  // Pick dataset and subtitle based on region
  if (currentRegion === 'usa') {
    currentChartHistory = USA_SEATS_HISTORY;
    var sub = modal.querySelector('.chart-subtitle');
    if (sub) sub.textContent = 'Camara de Representantes - EEUU';
    var h2 = modal.querySelector('h2');
    if (h2) h2.textContent = 'Evolucion historica de escanos';
  } else {
    currentChartHistory = SEATS_HISTORY;
    var sub2 = modal.querySelector('.chart-subtitle');
    if (sub2) sub2.textContent = 'Fuerzas estatales - Congreso de los Diputados';
    var h22 = modal.querySelector('h2');
    if (h22) h22.textContent = 'Evolucion historica de escanos';
  }

  if (currentChartHistory && currentChartHistory.parties) {
    currentChartHistory.parties.forEach(function(party) {
      if (party.logo && party.logo.indexOf('http') !== 0) {
        party.logo = getPartyLogoUrl(party.logo);
      }
    });
  }

  // Reset canvas inited so listeners reattach to new data
  var canvas = document.getElementById('chartCanvas');
  if (canvas) canvas.dataset.inited = '';

  modal.classList.add('open');
  buildChartToggles();
  setTimeout(function() { drawChart(-1); }, 60);
}

function closeChart() {
  var modal = document.getElementById('chartModal');
  if (modal) modal.classList.remove('open');
}

document.addEventListener('click', function(e) {
  var modal = document.getElementById('chartModal');
  if (modal && e.target === modal) closeChart();
});

function buildChartToggles() {
  var wrap = document.getElementById('chartToggles');
  if (!wrap || !currentChartHistory) return;
  wrap.innerHTML = '';
  getChartEligibleParties().forEach(function(party) {

    var btn = document.createElement('button');
    btn.className = 'chart-toggle-btn' + (party.visible ? ' on' : '');
    var logoUrl = getChartPartyLogoUrl(party);
    if (logoUrl) {
      var logo = document.createElement('img');
      logo.alt = party.name;
      logo.className = 'chart-toggle-logo';
      setLogoImage(logo, logoUrl);
      btn.appendChild(logo);
    }
    var label = document.createElement('span');
    label.className = 'chart-toggle-label';
    label.textContent = party.name;
    btn.appendChild(label);
    if (party.description) btn.title = party.description;
    btn.style.color = party.color;
    btn.style.borderColor = party.color + '88';
    btn.style.background = party.visible ? party.color + '22' : 'transparent';
    (function(p, b) {
      b.addEventListener('click', function() {
        p.visible = !p.visible;
        b.classList.toggle('on', p.visible);
        b.style.background = p.visible ? p.color + '22' : 'transparent';
        drawChart(chartHoverIdx);
      });
    })(party, btn);
    wrap.appendChild(btn);
  });
}

function drawChart(hoverIdx) {
  chartHoverIdx = hoverIdx;
  var canvas = document.getElementById('chartCanvas');
  if (!canvas) return;

  var wrap = canvas.parentElement;
  var dpr = window.devicePixelRatio || 1;
  var W = wrap.offsetWidth;
  var H = Math.round(W * 0.44);

  if (canvas.dataset.inited !== '1') {
    canvas.dataset.inited = '1';
    // remove old tooltip
    var oldTip = wrap.querySelector('.chart-tooltip');
    if (oldTip) oldTip.parentNode.removeChild(oldTip);
    chartTooltipEl = document.createElement('div');
    chartTooltipEl.className = 'chart-tooltip';
    chartTooltipEl.style.display = 'none';
    wrap.appendChild(chartTooltipEl);

    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var PAD_L = 50, PAD_R = 30;
      var chartW = W - PAD_L - PAD_R;
      var nEl = currentChartHistory.elections.length;
      var step = chartW / (nEl - 1);
      var idx = Math.round((mx - PAD_L) / step);
      idx = Math.max(0, Math.min(nEl - 1, idx));
      drawChart(idx);
    });

    canvas.addEventListener('mouseleave', function() {
      drawChart(-1);
      if (chartTooltipEl) chartTooltipEl.style.display = 'none';
    });
  }

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var PAD_L = 50, PAD_R = 30, PAD_T = 20, PAD_B = 38;
  var chartW = W - PAD_L - PAD_R;
  var chartH = H - PAD_T - PAD_B;
  var nEl = currentChartHistory.elections.length;

  // Max seats from visible parties
  var maxSeats = 0;
  currentChartHistory.parties.forEach(function(p) {
    if (!p.visible) return;
    p.data.forEach(function(v) { if (v > maxSeats) maxSeats = v; });
  });
  maxSeats = Math.ceil((maxSeats + 20) / 40) * 40;
  if (maxSeats < 40) maxSeats = 40;

  function xPos(i) { return PAD_L + (i / (nEl - 1)) * chartW; }
  function yPos(v) { return PAD_T + chartH - (v / maxSeats) * chartH; }

  // Background
  ctx.fillStyle = '#0a0b12';
  ctx.fillRect(0, 0, W, H);

  // Horizontal grid + Y labels
  var nGrid = 6;
  for (var g = 0; g <= nGrid; g++) {
    var gv = (g / nGrid) * maxSeats;
    var gy = yPos(gv);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, gy);
    ctx.lineTo(PAD_L + chartW, gy);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(gv), PAD_L - 6, gy + 3);
  }

  // X axis labels (show every 2nd if crowded)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '9px IBM Plex Mono, monospace';
  ctx.textAlign = 'center';
  for (var xi = 0; xi < nEl; xi++) {
    if (xi % 2 !== 0 && nEl > 10) continue;
    ctx.fillText(currentChartHistory.elections[xi], xPos(xi), PAD_T + chartH + 18);
  }

  // Hover vertical line
  if (hoverIdx >= 0) {
    var hx = xPos(hoverIdx);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, PAD_T);
    ctx.lineTo(hx, PAD_T + chartH);
    ctx.stroke();
    ctx.setLineDash([]);
    // Date label above
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 10px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentChartHistory.fullYears[hoverIdx], hx, PAD_T - 6);
  }

  // Draw lines
  getVisibleChartParties().forEach(function(party) {
    if (!party.visible) return;
    var isHoverDimmed = false; // all lines same brightness

    ctx.beginPath();
    ctx.strokeStyle = party.color;
    ctx.lineWidth = hoverIdx >= 0 ? 1.5 : 2;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = hoverIdx >= 0 ? 0.5 : 1;
    for (var i = 0; i < party.data.length; i++) {
      if (i === 0) ctx.moveTo(xPos(i), yPos(party.data[i]));
      else ctx.lineTo(xPos(i), yPos(party.data[i]));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Dots
    for (var j = 0; j < party.data.length; j++) {
      var isHover = (j === hoverIdx);
      var r = isHover ? 5 : 3;
      ctx.beginPath();
      ctx.arc(xPos(j), yPos(party.data[j]), r, 0, Math.PI * 2);
      ctx.fillStyle = party.color;
      ctx.globalAlpha = isHover ? 1 : (hoverIdx >= 0 ? 0.4 : 0.9);
      ctx.fill();
      ctx.strokeStyle = '#0a0b12';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Last value label (only when no hover)
    if (hoverIdx < 0) {
      var lastVal = party.data[party.data.length - 1];
      if (lastVal > 0) {
        ctx.fillStyle = party.color;
        ctx.font = 'bold 9px IBM Plex Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(lastVal, xPos(nEl - 1) + 4, yPos(lastVal) + 3);
      }
    }
  });

  // Tooltip
  if (hoverIdx >= 0 && chartTooltipEl) {
    var rows = '';
    var visParties = getVisibleChartParties().filter(function(p) { return p.data[hoverIdx] > 0; });
    visParties.sort(function(a, b) { return b.data[hoverIdx] - a.data[hoverIdx]; });

    chartTooltipEl.innerHTML = '';
    var title = document.createElement('div');
    title.className = 'chart-tooltip-title';
    title.textContent = currentChartHistory.elections[hoverIdx];
    chartTooltipEl.appendChild(title);

    if (currentChartHistory.presidents) {
      var presRow = document.createElement('div');
      presRow.className = 'chart-tooltip-president';
      var presLogoHtml = '';
      if (currentChartHistory.presidentLogos && currentChartHistory.presidentLogos[hoverIdx]) {
        var presLogoUrl = getPartyLogoUrl(currentChartHistory.presidentLogos[hoverIdx]);
        if (presLogoUrl) {
          presLogoHtml = '<img src="' + getSafeImageUrl(presLogoUrl, false) + '" class="pres-logo" alt=""/> ';
        } else {
          presLogoHtml = '<span class="pres-icon">🏛</span> ';
        }
      } else {
        presLogoHtml = '<span class="pres-icon">🏛</span> ';
      }
      presRow.innerHTML = presLogoHtml + '<span class="pres-name">' + currentChartHistory.presidents[hoverIdx] + '</span>';
      chartTooltipEl.appendChild(presRow);
    }

    visParties.forEach(function(p) {
      var row = document.createElement('div');
      row.className = 'chart-tooltip-row';

      var nameWrap = document.createElement('div');
      nameWrap.className = 'chart-tooltip-namewrap';

      var dot = document.createElement('img');
      dot.className = 'chart-tooltip-logo';
      dot.alt = p.name;
      setLogoImage(dot, getChartPartyLogoUrl(p));

      var lbl = document.createElement('span');
      lbl.className = 'chart-tooltip-label';
      lbl.textContent = p.name;

      nameWrap.appendChild(dot);
      nameWrap.appendChild(lbl);

      var val = document.createElement('span');
      val.className = 'chart-tooltip-value';
      val.textContent = p.data[hoverIdx];
      row.appendChild(nameWrap);
      row.appendChild(val);
      chartTooltipEl.appendChild(row);
    });

    chartTooltipEl.style.display = 'block';
    var hxPx = (xPos(hoverIdx) / W) * 100;
    chartTooltipEl.style.left = (hxPx > 60 ? '' : xPos(hoverIdx) + 14) + 'px';
    chartTooltipEl.style.right = (hxPx > 60 ? (W - xPos(hoverIdx) + 14) + 'px' : '');
    chartTooltipEl.style.top = PAD_T + 'px';
  } else if (chartTooltipEl) {
    chartTooltipEl.style.display = 'none';
  }

  // Legend
  var legendEl = document.getElementById('chartLegend');
  if (legendEl) {
    legendEl.innerHTML = '';
    getVisibleChartParties().forEach(function(p) {
      var item = document.createElement('div');
      item.className = 'chart-legend-item';
      var dot;
      var logoUrl = getChartPartyLogoUrl(p);
      if (logoUrl) {
        dot = document.createElement('img');
        dot.className = 'chart-legend-logo';
        dot.alt = p.name;
        setLogoImage(dot, logoUrl);
        dot.style.width = '18px';
        dot.style.height = '18px';
        dot.style.objectFit = 'contain';
        dot.style.borderRadius = '3px';
        dot.style.background = '#fff';
        dot.style.padding = '2px';
      } else {
        dot = document.createElement('div');
        dot.className = 'chart-legend-dot';
        dot.style.background = p.color;
      }
      var label = document.createElement('div');
      label.style.display = 'flex';
      label.style.flexDirection = 'column';
      var name = document.createElement('span');
      name.textContent = p.name;
      label.appendChild(name);
      if (p.description) {
        var desc = document.createElement('span');
        desc.textContent = p.description;
        desc.style.fontSize = '11px';
        desc.style.lineHeight = '1.25';
        desc.style.opacity = '0.75';
        label.appendChild(desc);
      }
      item.appendChild(dot);
      item.appendChild(label);
      legendEl.appendChild(item);
    });
  }
}


function downloadMap() {
  if (typeof html2canvas === 'undefined') {
    alert("Cargando módulo de descarga... Por favor, inténtalo de nuevo en unos segundos.");
    return;
  }
  var compass = document.getElementById('compass');
  
  // Guardar estado original
  var origBg = compass.style.background;
  var origRadius = compass.style.borderRadius;
  var origBorder = compass.style.border;
  
  // Preparar para la captura (fondo negro para legibilidad)
  compass.style.background = '#0a0b12';
  compass.style.borderRadius = '0';
  compass.style.border = 'none';

  html2canvas(compass, {
    backgroundColor: '#0a0b12',
    scale: 2, // Mayor resolución
    useCORS: true
  }).then(function(canvas) {
    // Restaurar estilos
    compass.style.background = origBg;
    compass.style.borderRadius = origRadius;
    compass.style.border = origBorder;

    // Crear link de descarga
    var link = document.createElement('a');
    link.download = 'Mapa_Politico_' + currentRegion + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

// ============================================================
//  EVOLUTION TIMELINE
// ============================================================
var evolutionData = {
  "psoe": [
    { year: 1879, leader: "Fundación", x: -0.85, y: 0.70 },
    { year: 1977, leader: "Felipe González", x: -0.50, y: 0.40 },
    { year: 1982, leader: "Felipe González", x: -0.40, y: 0.20 },
    { year: 1996, leader: "Felipe González", x: -0.30, y: 0.15 },
    { year: 2004, leader: "J.L. Zapatero", x: -0.45, y: -0.05 },
    { year: 2011, leader: "A. Pérez Rubalcaba", x: -0.35, y: 0.10 },
    { year: 2019, leader: "Pedro Sánchez", x: -0.25, y: 0.05 },
    { year: 2023, leader: "Pedro Sánchez", x: -0.28, y: 0.10 }
  ],
  "pp": [
    { year: 1977, leader: "M. Fraga (AP)", x: 0.75, y: 0.60 },
    { year: 1989, leader: "José María Aznar", x: 0.65, y: 0.25 },
    { year: 1996, leader: "José María Aznar", x: 0.55, y: 0.15 },
    { year: 2004, leader: "Mariano Rajoy", x: 0.50, y: 0.20 },
    { year: 2011, leader: "Mariano Rajoy", x: 0.55, y: 0.25 },
    { year: 2019, leader: "Pablo Casado", x: 0.70, y: 0.40 },
    { year: 2023, leader: "A. Núñez Feijóo", x: 0.62, y: 0.30 }
  ],
  "vox": [
    { year: 2013, leader: "Fundación", x: 0.65, y: 0.30 },
    { year: 2015, leader: "Santiago Abascal", x: 0.75, y: 0.50 },
    { year: 2019, leader: "Santiago Abascal", x: 0.85, y: 0.70 },
    { year: 2023, leader: "Santiago Abascal", x: 0.88, y: 0.80 }
  ],
  "podemos": [
    { year: 2014, leader: "Fundación", x: -0.70, y: -0.10 },
    { year: 2015, leader: "Pablo Iglesias", x: -0.65, y: 0.10 },
    { year: 2019, leader: "P. Iglesias (UP)", x: -0.80, y: 0.40 },
    { year: 2023, leader: "Ione Belarra", x: -0.85, y: 0.60 }
  ],
  "erc": [
    { year: 1931, leader: "Fundación", x: -0.30, y: 0.30 },
    { year: 1977, leader: "Heribert Barrera", x: -0.20, y: 0.40 },
    { year: 2004, leader: "J.-Lluís Carod-Rovira", x: -0.45, y: 0.40 },
    { year: 2011, leader: "Oriol Junqueras", x: -0.40, y: 0.55 },
    { year: 2023, leader: "Oriol Junqueras", x: -0.40, y: 0.65 }
  ],
  "pnv": [
    { year: 1895, leader: "Fundación", x: 0.30, y: 0.80 },
    { year: 1977, leader: "Carlos Garaikoetxea", x: 0.15, y: 0.40 },
    { year: 1996, leader: "Xabier Arzalluz", x: 0.25, y: 0.60 },
    { year: 2011, leader: "Iñigo Urkullu", x: 0.10, y: 0.30 },
    { year: 2023, leader: "Andoni Ortuzar", x: 0.10, y: 0.50 }
  ],
  "ciudadanos": [
    { year: 2006, leader: "Fundación", x: 0.05, y: -0.40 },
    { year: 2015, leader: "Albert Rivera", x: 0.20, y: -0.30 },
    { year: 2019, leader: "Albert Rivera", x: 0.45, y: 0.10 },
    { year: 2023, leader: "Patricia Guasp", x: 0.30, y: -0.55 }
  ]
};

var evoGhostPin = null;

function toggleEvolution() {
  var bar = document.getElementById('evolutionBar');
  var btn = document.getElementById('btnEvolution');
  if (!bar) return;
  
  if (bar.style.display === 'none') {
    openEvolution();
    if (btn) btn.classList.add('active');
  } else {
    closeEvolution();
    if (btn) btn.classList.remove('active');
  }
}

function openEvolution() {
  if (!activePin || !evolutionData[activePin]) return;
  
  var party = null;
  for (var i = 0; i < db.parties.length; i++) {
    if (db.parties[i].id === activePin) { party = db.parties[i]; break; }
  }
  if (!party) return;
  
  var bar = document.getElementById('evolutionBar');
  bar.style.display = 'block';
  document.documentElement.style.setProperty('--evo-color', party.color);
  
  setLogoImage(document.getElementById('evoPartyLogo'), party.logo_url || '');
  document.getElementById('evoPartyName').textContent = party.name;
  
  var data = evolutionData[activePin];
  var slider = document.getElementById('evoSlider');
  slider.min = 0;
  slider.max = data.length - 1;
  slider.value = data.length - 1;
  
  document.getElementById('evoYearStart').textContent = data[0].year;
  document.getElementById('evoYearEnd').textContent = data[data.length - 1].year;
  
  // Render dots
  var dotsContainer = document.getElementById('evoTrackDots');
  dotsContainer.innerHTML = '';
  for (var j = 0; j < data.length; j++) {
    var dot = document.createElement('div');
    dot.className = 'evo-dot';
    if (j < data.length - 1) dot.classList.add('passed');
    if (j === data.length - 1) dot.classList.add('current');
    dotsContainer.appendChild(dot);
  }
  
  // Create Ghost Pin
  if (!evoGhostPin) {
    evoGhostPin = document.createElement('div');
    evoGhostPin.className = 'ghost-pin';
    evoGhostPin.innerHTML = '<div class="ghost-bubble"><img id="ghostImg" src=""/></div><div class="ghost-year" id="ghostYear"></div>';
    document.getElementById('compassInner').appendChild(evoGhostPin);
  }
  setLogoImage(document.getElementById('ghostImg'), party.logo_url || '');
  if (evoGhostPin) evoGhostPin.style.opacity = '1';
  
  var trailSvg = document.getElementById('evoTrailSvg');
  if (trailSvg) trailSvg.style.display = 'block';
  
  updateEvolutionFrame();
  
  slider.oninput = function() { updateEvolutionFrame(); };
  
  var closeBtn = document.getElementById('evoCloseBtn');
  if (closeBtn) closeBtn.onclick = closeEvolution;
}

function closeEvolution() {
  var bar = document.getElementById('evolutionBar');
  var btn = document.getElementById('btnEvolution');
  if (bar) bar.style.display = 'none';
  if (btn) btn.classList.remove('active');
  if (evoGhostPin) evoGhostPin.style.opacity = '0';
  
  var trailSvg = document.getElementById('evoTrailSvg');
  if (trailSvg) trailSvg.style.display = 'none';
}

function updateEvolutionFrame() {
  var data = evolutionData[activePin];
  if (!data) return;
  var slider = document.getElementById('evoSlider');
  var idx = parseInt(slider.value, 10);
  var frame = data[idx];
  
  document.getElementById('evoCurrentYear').textContent = frame.year;
  document.getElementById('evoCurrentPos').textContent = "Líder: " + frame.leader;
  
  // Update dots
  var dotsContainer = document.getElementById('evoTrackDots');
  var dots = dotsContainer.children;
  for (var i = 0; i < dots.length; i++) {
    dots[i].className = 'evo-dot';
    if (i < idx) dots[i].classList.add('passed');
    if (i === idx) dots[i].classList.add('current');
  }
  
  // Move Ghost Pin and Draw Trail
  if (evoGhostPin) {
    var xPct = ((frame.x + 1) / 2) * 100;
    var yPct = ((1 - frame.y) / 2) * 100;
    evoGhostPin.style.left = xPct + '%';
    evoGhostPin.style.top = yPct + '%';
    document.getElementById('ghostYear').textContent = frame.year;
    
    // Draw trail path
    var pathD = '';
    for (var j = 0; j <= idx; j++) {
      var pt = data[j];
      var px = ((pt.x + 1) / 2) * 100;
      var py = ((1 - pt.y) / 2) * 100;
      pathD += (j === 0 ? 'M ' : ' L ') + px + ' ' + py;
    }
    var trailPath = document.getElementById('evoTrailPath');
    if (trailPath) {
      trailPath.setAttribute('d', pathD);
      trailPath.style.stroke = document.documentElement.style.getPropertyValue('--evo-color') || '#64c8ff';
      trailPath.style.strokeWidth = "1.5";
      trailPath.style.strokeDasharray = "2 2";
      trailPath.style.filter = "drop-shadow(0px 0px 2px rgba(0,0,0,0.8))";
    }
  }
}

// ============================================================
//  NEW FEATURES: DOWNLOADS, PARLIAMENT, COMPARATOR
// ============================================================

function downloadMap() {
  var compassWrap = document.querySelector('.compass-wrap');
  var toolbar = document.getElementById('filterGroup');
  var dwnBtn = document.getElementById('btnDownloadMapContainer');
  if (toolbar) toolbar.style.visibility = 'hidden';
  if (dwnBtn) dwnBtn.style.visibility = 'hidden';
  
  html2canvas(compassWrap, {
    backgroundColor: '#0b0c10',
    scale: 2,
    useCORS: true,
    imageTimeout: 15000
  }).then(function(canvas) {
    if (toolbar) toolbar.style.visibility = 'visible';
    if (dwnBtn) dwnBtn.style.visibility = 'visible';
    var link = document.createElement('a');
    link.download = 'mapa_politico_' + currentRegion + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

function downloadPartyCard() {
  var p = db.parties.find(function(x) { return x.id === activePin; });
  if (!p) return;

  var clone = document.createElement('div');
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.width = '1200px';
  clone.style.background = '#0b0c10';
  clone.style.color = '#fff';
  clone.style.fontFamily = "'Inter', sans-serif";
  clone.style.display = 'flex';
  clone.style.padding = '40px';
  clone.style.boxSizing = 'border-box';
  clone.style.gap = '40px';

  var leftCol = document.createElement('div');
  leftCol.style.flex = '0 0 400px';
  leftCol.style.display = 'flex';
  leftCol.style.flexDirection = 'column';
  
  var leaderImgUrl = p.leader_img ? getSafeImageUrl(p.leader_img, true) : '';
  var leaderImgHtml = leaderImgUrl ?
    '<div style="width:100%; height:560px; border-radius:12px; overflow:hidden; background:#111; margin-bottom:20px;">' +
      '<img src="'+leaderImgUrl+'" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover; object-position:center 25%; display:block;">' +
    '</div>' : '';
  
  leftCol.innerHTML = leaderImgHtml +
    '<div style="display:flex; align-items:center; gap:20px; margin-bottom:20px;">' +
    '<img src="'+(getSafeLogoUrl(p.logo_url||''))+'" crossorigin="anonymous" referrerpolicy="no-referrer" style="width:80px; height:80px; object-fit:contain; background:rgba(255,255,255,0.05); border-radius:12px; padding:8px;">' +
    '<div><div style="font-family:\'Playfair Display\',serif; font-size:36px; font-weight:bold;">' + p.acronym + '</div>' +
    '<div style="font-size:16px; color:#8b8d98; margin-bottom: 4px;">' + (p.name || '') + '</div>' +
    '<div style="font-size:16px; color:#fff;">↳ ' + (p.leader || 'Sin líder asignado') + '</div>' +
    '</div></div>' +
    '<div style="display:flex; gap:20px; margin-bottom:20px;">' + 
    '<div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; flex:1;">' +
    '<div style="font-size:12px; color:#8b8d98; text-transform:uppercase;">Escaños</div>' +
    '<div style="font-size:28px; font-weight:bold;">' + (p.seats_congress !== undefined ? p.seats_congress : '-') + '</div></div>' +
    '<div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; flex:1;">' +
    '<div style="font-size:12px; color:#8b8d98; text-transform:uppercase;">Fundación</div>' +
    '<div style="font-size:28px; font-weight:bold;">' + (p.founded || '-') + '</div></div>' +
    '</div>';

  var tagsHtml = '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">';
  (p.ideology||[]).forEach(function(i) {
    tagsHtml += '<span style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); padding:6px 12px; border-radius:6px; font-size:14px;">' + i + '</span>';
  });
  tagsHtml += '</div>';
  leftCol.innerHTML += tagsHtml;

  if (p.description) {
      leftCol.innerHTML += '<div style="font-size:16px; color:rgba(255,255,255,0.8); line-height:1.6; margin-bottom:20px;">' + p.description + '</div>';
  }

  var rightCol = document.createElement('div');
  rightCol.style.flex = '1';
  rightCol.style.display = 'flex';
  rightCol.style.flexDirection = 'column';
  rightCol.style.gap = '15px';
  
  rightCol.innerHTML = '<h3 style="margin:0 0 10px 0; font-family:\'Playfair Display\',serif; font-size:28px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">Programa Político</h3>';

  if (p.programa && Object.keys(p.programa).length > 0) {
    Object.keys(p.programa).forEach(function(k) {
       rightCol.innerHTML += '<div style="background:rgba(255,255,255,0.03); padding:20px; border-radius:10px; border:1px solid rgba(255,255,255,0.05);">' +
               '<div style="font-size:14px; text-transform:uppercase; color:'+p.color+'; margin-bottom:8px; font-weight:bold; letter-spacing:1px;">' + (PROG_LABELS[k]||k) + '</div>' +
               '<div style="font-size:16px; line-height: 1.6; color:rgba(255,255,255,0.95);">' + p.programa[k] + '</div></div>';
    });
  } else {
      rightCol.innerHTML += '<div style="color:#8b8d98; font-size:16px;">No hay datos del programa.</div>';
  }

  clone.appendChild(leftCol);
  clone.appendChild(rightCol);
  document.body.appendChild(clone);
  
  html2canvas(clone, { backgroundColor: '#0b0c10', scale: 2, useCORS: true }).then(function(canvas) {
    document.body.removeChild(clone);
    var link = document.createElement('a');
    link.download = 'ficha_' + p.acronym + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

function openParliament() {
  document.getElementById('parliamentModal').style.display = 'flex';
  renderParliament();
}

function closeParliament() {
  document.getElementById('parliamentModal').style.display = 'none';
}

function renderParliament() {
  var svg = document.getElementById('parliamentSvg');
  var legend = document.getElementById('parliamentLegend');
  var totalEl = document.getElementById('parliamentTotalSeats');
  var modal = document.getElementById('parliamentModal');
  var tooltip = document.getElementById('parliamentTooltip');
  svg.innerHTML = '';
  legend.innerHTML = '';

  if (!tooltip && modal) {
    tooltip = document.createElement('div');
    tooltip.id = 'parliamentTooltip';
    tooltip.className = 'parliament-tooltip';
    modal.appendChild(tooltip);
  }
  if (tooltip) tooltip.style.display = 'none';
  
  var parties = db.parties.filter(function(p) {
    var inReg = Array.isArray(p.region)
      ? p.region.indexOf(currentRegion) !== -1
      : p.region === currentRegion;
    return inReg && p.seats_congress > 0 && HIST_IDS.indexOf(p.id) === -1;
  });
  
  parties.sort(function(a, b) { return a.position.x - b.position.x; });
  
  var totalSeats = parties.reduce(function(sum, p) { return sum + p.seats_congress; }, 0);
  totalEl.textContent = totalSeats;
  
  if (totalSeats === 0) return;

  var currentAngle = Math.PI;
  var radius = 100;
  var thickness = 45;
  var ns = 'http://www.w3.org/2000/svg';
  
  parties.forEach(function(p) {
    var angleSpan = (p.seats_congress / totalSeats) * Math.PI;
    var nextAngle = currentAngle - angleSpan;
    
    var x1 = Math.cos(currentAngle) * radius;
    var y1 = -Math.sin(currentAngle) * radius;
    var x2 = Math.cos(nextAngle) * radius;
    var y2 = -Math.sin(nextAngle) * radius;
    
    var ix1 = Math.cos(currentAngle) * (radius - thickness);
    var iy1 = -Math.sin(currentAngle) * (radius - thickness);
    var ix2 = Math.cos(nextAngle) * (radius - thickness);
    var iy2 = -Math.sin(nextAngle) * (radius - thickness);
    
    var largeArc = angleSpan > Math.PI ? 1 : 0;
    
    var pathData = [
      'M', x1, y1,
      'A', radius, radius, 0, largeArc, 1, x2, y2,
      'L', ix2, iy2,
      'A', radius - thickness, radius - thickness, 0, largeArc, 0, ix1, iy1,
      'Z'
    ].join(' ');
    
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', p.color);
    path.setAttribute('stroke', '#0a0b12');
    path.setAttribute('stroke-width', '1.5');
    path.style.cursor = 'pointer';
    var titleEl = document.createElementNS(ns, 'title');
    titleEl.textContent = p.acronym + ' (' + p.seats_congress + ' escaños)';
    path.appendChild(titleEl);
    svg.appendChild(path);

    var logoUrl = p.logo_url || getPartyLogoUrl(p.id || p.acronym || p.name);
    var minLogoAngle = 0.16;
    if (logoUrl && angleSpan >= minLogoAngle) {
      var midAngle = (currentAngle + nextAngle) / 2;
      var logoRadius = radius - (thickness * 0.5);
      var lx = Math.cos(midAngle) * logoRadius;
      var ly = -Math.sin(midAngle) * logoRadius;
      var size = Math.max(14, Math.min(22, angleSpan * 34));
      var logoW = Math.round(size * 1.35);
      var logoH = Math.round(size * 0.86);

      var logoBg = document.createElementNS(ns, 'rect');
      logoBg.setAttribute('x', lx - (logoW / 2));
      logoBg.setAttribute('y', ly - (logoH / 2));
      logoBg.setAttribute('width', logoW);
      logoBg.setAttribute('height', logoH);
      logoBg.setAttribute('rx', Math.max(2, Math.round(logoH * 0.2)));
      logoBg.setAttribute('fill', 'rgba(255,255,255,0.92)');
      logoBg.setAttribute('stroke', 'rgba(10,11,18,0.65)');
      logoBg.setAttribute('stroke-width', '0.8');
      logoBg.setAttribute('class', 'parliament-logo-bg');
      svg.appendChild(logoBg);

      var logo = document.createElementNS(ns, 'image');
      logo.setAttribute('href', getSafeLogoUrl(logoUrl));
      logo.setAttributeNS('http://www.w3.org/1999/xlink', 'href', getSafeLogoUrl(logoUrl));
      logo.setAttribute('x', lx - (logoW / 2) + 1);
      logo.setAttribute('y', ly - (logoH / 2) + 1);
      logo.setAttribute('width', logoW - 2);
      logo.setAttribute('height', logoH - 2);
      logo.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      logo.setAttribute('class', 'parliament-logo');
      svg.appendChild(logo);
    }

    (function(party, logo, total) {
      path.addEventListener('mousemove', function(e) {
        if (!tooltip) return;
        var percent = total > 0 ? ((party.seats_congress / total) * 100).toFixed(1) : '0.0';
        var titleText = party.name || party.acronym || 'Partido';
        var acronym = party.acronym ? ' · ' + party.acronym : '';
        var logoHtml = logo
          ? '<img class="parliament-tooltip-logo" src="' + logo + '" alt="" />'
          : '<span class="parliament-tooltip-dot" style="background:' + party.color + '"></span>';
        tooltip.innerHTML =
          '<div class="parliament-tooltip-title">' + titleText + acronym + '</div>' +
          '<div class="parliament-tooltip-row">' + logoHtml +
          '<span>' + party.seats_congress + ' escaños · ' + percent + '%</span></div>';
        tooltip.style.display = 'block';
        var x = e.clientX + 12;
        var y = e.clientY + 12;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
        var rect = tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth - 12) {
          tooltip.style.left = (window.innerWidth - rect.width - 12) + 'px';
        }
        if (rect.bottom > window.innerHeight - 12) {
          tooltip.style.top = (window.innerHeight - rect.height - 12) + 'px';
        }
      });
      path.addEventListener('mouseleave', function() {
        if (tooltip) tooltip.style.display = 'none';
      });
    })(p, logoUrl, totalSeats);
    
    var legItem = document.createElement('div');
    legItem.className = 'legend-item';
    legItem.style.marginRight = '12px';
    var dot;
    if (logoUrl) {
      dot = document.createElement('img');
      dot.className = 'parliament-legend-logo';
      dot.alt = p.acronym;
      setLogoImage(dot, logoUrl);
    } else {
      dot = document.createElement('div');
      dot.className = 'legend-dot';
      dot.style.background = p.color;
    }
    var text = document.createElement('span');
    text.textContent = p.acronym + ' (' + p.seats_congress + ')';
    text.style.display = 'inline';
    legItem.appendChild(dot);
    legItem.appendChild(text);
    legend.appendChild(legItem);
    
    currentAngle = nextAngle;
  });
}

var currentCompParty1 = null;
var comparatorCandidates = [];

function initComparatorSearch() {
  var wrap = document.getElementById('compSearchWrap');
  var input = document.getElementById('compSearchInput');
  var dropdown = document.getElementById('compSearchDropdown');
  if (!wrap || !input || !dropdown) return;
  if (input.dataset.inited === '1') return;
  input.dataset.inited = '1';

  input.addEventListener('input', function() {
    renderComparatorSearchResults(input.value || '');
  });

  input.addEventListener('focus', function() {
    renderComparatorSearchResults(input.value || '');
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  document.addEventListener('click', function(e) {
    if (!wrap.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
}

function renderComparatorSearchResults(query) {
  var dropdown = document.getElementById('compSearchDropdown');
  if (!dropdown) return;

  var q = String(query || '').trim().toLowerCase();
  var items = comparatorCandidates.filter(function(p) {
    if (!q) return true;
    return (
      (p.name && p.name.toLowerCase().indexOf(q) !== -1) ||
      (p.acronym && p.acronym.toLowerCase().indexOf(q) !== -1) ||
      (p.leader && p.leader.toLowerCase().indexOf(q) !== -1)
    );
  }).slice(0, 10);

  dropdown.innerHTML = '';
  if (items.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'comp-search-empty';
    empty.textContent = 'Sin resultados';
    dropdown.appendChild(empty);
    dropdown.classList.add('open');
    return;
  }

  items.forEach(function(p) {
    var item = document.createElement('div');
    item.className = 'comp-search-item';

    var logo = document.createElement('img');
    logo.className = 'comp-search-item-logo';
    logo.alt = p.acronym || p.name || '';
    setLogoImage(logo, p.logo_url || '', function() {
      logo.style.display = 'none';
    });

    var text = document.createElement('div');
    text.className = 'comp-search-item-text';
    text.textContent = (p.name || p.acronym || 'Partido') + (p.acronym ? ' (' + p.acronym + ')' : '');

    item.appendChild(logo);
    item.appendChild(text);

    item.addEventListener('click', function() {
      var input = document.getElementById('compSearchInput');
      if (input) input.value = (p.name || p.acronym || 'Partido') + (p.acronym ? ' (' + p.acronym + ')' : '');
      dropdown.classList.remove('open');
      selectCompParty(p.id);
    });

    dropdown.appendChild(item);
  });

  dropdown.classList.add('open');
}

function openComparator() {
  if (!activePin) return;
  currentCompParty1 = activePin;
  document.getElementById('comparatorModal').style.display = 'flex';

  comparatorCandidates = db.parties.filter(function(p) {
    return p.id !== currentCompParty1;
  });
  comparatorCandidates.sort(function(a, b) { return (a.name || a.acronym).localeCompare(b.name || b.acronym); });

  initComparatorSearch();
  var input = document.getElementById('compSearchInput');
  var dropdown = document.getElementById('compSearchDropdown');
  if (input) input.value = '';
  if (dropdown) {
    dropdown.innerHTML = '';
    dropdown.classList.remove('open');
  }
  
  document.getElementById('compParty2').style.display = 'none';
  var badge = document.getElementById('compDistanceBadge');
  if (badge) badge.style.display = 'none';
  renderCompParty(currentCompParty1, 'compParty1');
}

function closeComparator() {
  document.getElementById('comparatorModal').style.display = 'none';
  var dropdown = document.getElementById('compSearchDropdown');
  if (dropdown) dropdown.classList.remove('open');
}

function selectCompParty(id) {
  var comp2 = document.getElementById('compParty2');
  var badge = document.getElementById('compDistanceBadge');
  if (!id) {
    if (comp2) comp2.style.display = 'none';
    if (badge) badge.style.display = 'none';
    return;
  }

  if (comp2) {
    comp2.style.display = 'block';
    renderCompParty(id, 'compParty2');
  }

  if (currentCompParty1 && id) {
    var p1 = db.parties.find(function(x) { return x.id === currentCompParty1; });
    var p2 = db.parties.find(function(x) { return x.id === id; });
    if (p1 && p2) {
      var dx = p1.position.x - p2.position.x;
      var dy = p1.position.y - p2.position.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var maxDist = 2.828;
      var affinity = Math.max(0, 100 - (dist / maxDist) * 100).toFixed(1);
      if (badge) {
        badge.innerHTML = 'Afinidad: <span style="color:var(--primary);">' + affinity + '%</span>';
        badge.style.display = 'block';
      }
    }
  } else if (badge) {
    badge.style.display = 'none';
  }
}

function renderCompParty(id, containerId) {
  var p = db.parties.find(function(x) { return x.id === id; });
  if (!p) return;
  var cont = document.getElementById(containerId);
  
  var leaderImgHtml = '';
  var safeLeaderUrl = p.leader_img ? getSafeImageUrl(p.leader_img, true) : '';
  if (safeLeaderUrl) {
      leaderImgHtml = '<div class="comp-party-hero"><img src="' + safeLeaderUrl + '" crossorigin="anonymous" referrerpolicy="no-referrer" alt=""></div>';
  } else {
    leaderImgHtml = '<div class="comp-party-hero comp-party-hero-empty">Sin foto de líder</div>';
  }

  var html = leaderImgHtml + 
    '<div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">' +
    '<img class="comp-party-logo" src="" alt="' + (p.acronym || '') + '" style="width:60px; height:60px; object-fit:contain; background:rgba(255,255,255,0.05); border-radius:8px; padding:4px;">' +
    '<div><div style="font-family:\'Playfair Display\',serif; font-size:24px; font-weight:bold;">' + (p.name || p.acronym || '') + '</div>' +
    '<div style="font-size:12px; color:var(--muted); margin-bottom: 4px;">' + (p.acronym || '') + '</div>' +
    '<div style="font-size:12px; color:rgba(255,255,255,0.9);">↳ ' + (p.leader || 'Sin líder asignado') + '</div>' +
    '</div></div>';
  
  if (p.description) {
    html += '<div style="margin-bottom:20px; font-size:13px; color:rgba(255,255,255,0.8); line-height: 1.6;">' + p.description + '</div>';
  }
  
  html += '<div style="display:flex; gap:20px; margin-bottom:20px;">' + 
          '<div style="background:rgba(0,0,0,0.3); padding:10px 15px; border-radius:8px; flex:1;">' +
          '<div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Escaños</div>' +
          '<div style="font-size:20px; font-weight:bold;">' + (p.seats_congress !== undefined ? p.seats_congress : '-') + '</div></div>' +
          '<div style="background:rgba(0,0,0,0.3); padding:10px 15px; border-radius:8px; flex:1;">' +
          '<div style="font-size:10px; color:var(--muted); text-transform:uppercase;">Fundación</div>' +
          '<div style="font-size:20px; font-weight:bold;">' + (p.founded || '-') + '</div></div>' +
          '</div>';

  html += '<h4 style="margin-bottom:10px; font-size:12px; color:var(--muted); text-transform:uppercase;">Ideología</h4>';
  html += '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:20px;">';
  (p.ideology||[]).forEach(function(i) {
    html += '<span style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; font-size:11px;">' + i + '</span>';
  });
  html += '</div>';

  if (p.programa && Object.keys(p.programa).length > 0) {
    html += '<h4 style="margin-bottom:10px; font-size:12px; color:var(--muted); text-transform:uppercase;">Programa</h4>';
    html += '<div style="display:flex; flex-direction:column; gap:8px;">';
    Object.keys(p.programa).forEach(function(k) {
       html += '<div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">' +
               '<div style="font-size:10px; text-transform:uppercase; color:'+p.color+'; margin-bottom:6px; font-weight:bold;">' + (PROG_LABELS[k]||k) + '</div>' +
               '<div style="font-size:12px; line-height: 1.5; color:rgba(255,255,255,0.9);">' + p.programa[k] + '</div></div>';
    });
    html += '</div>';
  }
  
  cont.innerHTML = html;

  // Reuse the same resilient logo loading used on map pins/search.
  var logoEl = cont.querySelector('.comp-party-logo');
  if (logoEl) {
    setLogoImage(logoEl, p.logo_url || '', function() {
      logoEl.style.display = 'none';
    });
  }
}

loadData();
