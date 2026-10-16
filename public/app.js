const socket = io();

let myPlayerNum = 0;
let currentPlayer = 1;
let selectedHexId = null;
let boardState = [];
let gameActive = false;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyStatus = document.getElementById('lobby-status');
const activeRoomDisplay = document.getElementById('active-room-display');

const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const chainToggle = document.getElementById('chain-toggle');
const lockingToggle = document.getElementById('locking-toggle');
const timerSelect = document.getElementById('timer-select');
const hexGrid = document.getElementById('hex-grid');
const selectedDisplay = document.getElementById('selected-criteria-display');
const champInput = document.getElementById('champ-input');
const submitBtn = document.getElementById('submit-btn');
const systemMsg = document.getElementById('system-msg');
const turnAnnounce = document.getElementById('turn-announcement');
const p1Score = document.getElementById('p1-score');
const p2Score = document.getElementById('p2-score');
const timerProgress = document.getElementById('timer-progress');
const autocompleteList = document.getElementById('autocomplete-list');

let championPool = [];
let usedChampions = [];
let currentSuggestions = [];
let activeSuggestionIndex = -1;

const HEX_RADIUS = 41;
function hexToPixel(q, r) {
  const x = HEX_RADIUS * Math.sqrt(3) * (q + r / 2);
  const y = HEX_RADIUS * (3 / 2) * r;
  return { x, y };
}

function createHexPoints(radius) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(`${radius * Math.cos(angle)},${radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

function applyControlPermissions() {
  const isP2 = (myPlayerNum === 2);
  chainToggle.disabled = isP2;
  lockingToggle.disabled = isP2;
  timerSelect.disabled = isP2;

  document.querySelectorAll('.toggle-card').forEach(card => {
    if (isP2) {
      card.classList.add('readonly');
      card.setAttribute('title', 'Controlled by Player 1 (Host)');
    } else {
      card.classList.remove('readonly');
      card.removeAttribute('title');
    }
  });
}

function showGameScreen(roomCode) {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  if (activeRoomDisplay && roomCode) {
    activeRoomDisplay.innerText = roomCode.toUpperCase();
  }
}

// 1. Lobby Setup & Settings Listeners
function handleJoin() {
  const roomCode = roomInput.value.trim().toUpperCase();
  if (!roomCode) {
    if (lobbyStatus) {
      lobbyStatus.innerText = "Please enter a valid room code!";
      lobbyStatus.style.color = "#ef4444";
    }
    roomInput.focus();
    return;
  }

  if (lobbyStatus) {
    lobbyStatus.innerText = `Connecting to room ${roomCode}...`;
    lobbyStatus.style.color = "#38bdf8";
  }

  socket.emit('joinRoom', {
    roomCode,
    settings: {
      chainingEnabled: chainToggle.checked,
      championLocking: lockingToggle.checked,
      roundDuration: parseInt(timerSelect.value, 10)
    }
  });
  joinBtn.disabled = true;
  roomInput.disabled = true;
}

joinBtn.addEventListener('click', handleJoin);

roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    handleJoin();
  }
});

chainToggle.addEventListener('change', (e) => {
  socket.emit('toggleChaining', { enabled: e.target.checked });
});

lockingToggle.addEventListener('change', (e) => {
  socket.emit('toggleChampionLocking', { enabled: e.target.checked });
});

timerSelect.addEventListener('change', (e) => {
  socket.emit('setRoundDuration', { duration: e.target.value });
});

socket.on('settingsUpdated', ({ chainingEnabled, championLocking, roundDuration, message }) => {
  chainToggle.checked = chainingEnabled;
  lockingToggle.checked = championLocking;
  timerSelect.value = roundDuration;
  if (message) {
    systemMsg.innerText = message;
  } else if (gameActive) {
    const timerText = roundDuration === 0 ? 'Unlimited' : `${roundDuration}s`;
    systemMsg.innerText = `Settings updated! Mode: ${chainingEnabled ? 'Chain ON' : 'Chain OFF'} | Locking: ${championLocking ? 'ON' : 'OFF'} | Timer: ${timerText}`;
  }
});

// 2. Session Initialization & Transition to Game View
socket.on('initSession', (data) => {
  myPlayerNum = data.playerNum;
  currentPlayer = data.currentPlayer;
  boardState = data.board;
  chainToggle.checked = data.chainingEnabled;
  lockingToggle.checked = data.championLocking;
  timerSelect.value = data.roundDuration;
  championPool = data.championPool || [];
  usedChampions = data.usedChampions || [];

  applyControlPermissions();

  const code = roomInput.value.trim().toUpperCase();
  showGameScreen(code);

  const sideName = myPlayerNum === 1 ? 'Blue Side (Host)' : 'Red Side (Guest)';
  systemMsg.innerText = `Connected as ${sideName}. Waiting for opponent...`;
  renderBoard(boardState);
});

socket.on('gameStart', ({ currentPlayer: starter, chainingEnabled, championLocking, roundDuration }) => {
  gameActive = true;
  currentPlayer = starter;

  chainToggle.checked = chainingEnabled;
  lockingToggle.checked = championLocking;
  timerSelect.value = roundDuration;

  applyControlPermissions();
  updateTurnDisplay();
  
  const timerText = roundDuration === 0 ? 'Unlimited' : `${roundDuration}s`;
  systemMsg.innerText = `Match Started! Mode: ${chainingEnabled ? 'Chain ON' : 'Chain OFF'} | Locking: ${championLocking ? 'ON' : 'OFF'} | Timer: ${timerText}`;
});

// Timer Bar Handler
socket.on('timerUpdate', ({ timeLeft, totalDuration }) => {
  if (totalDuration === 0) {
    timerProgress.classList.add('unlimited');
  } else {
    timerProgress.classList.remove('unlimited');
    timerProgress.style.width = `${(timeLeft / totalDuration) * 100}%`;
  }
});

// 3. Board Rendering
function renderBoard(board) {
  hexGrid.innerHTML = '';
  const pointsStr = createHexPoints(HEX_RADIUS - 2);

  board.forEach(tile => {
    const { x, y } = hexToPixel(tile.q, tile.r);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `hex-tile owner-${tile.owner}`);
    g.setAttribute('id', tile.id);
    g.setAttribute('transform', `translate(${x}, ${y})`);

    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    inner.setAttribute('class', 'hex-inner');

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('class', 'hex-polygon');
    poly.setAttribute('points', pointsStr);

    inner.appendChild(poly);

    const cat = tile.criteriaObj.cat;
    const name = tile.criteriaObj.name;

    // Helper to generate SVG icon elements
    function createIconElement(type, size = 26) {
      const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      iconGroup.setAttribute('class', 'hex-icon-group');

      if (type === 'mana') {
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('href', 'assets/icons/mana.png');
        img.setAttribute('x', -size / 2);
        img.setAttribute('y', -size / 2);
        img.setAttribute('width', size);
        img.setAttribute('height', size);
        img.setAttribute('class', 'hex-icon-img hex-icon-screen');
        iconGroup.appendChild(img);
      } else if (type === 'manaless') {
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('href', 'assets/icons/mana.png');
        img.setAttribute('x', -size / 2);
        img.setAttribute('y', -size / 2);
        img.setAttribute('width', size);
        img.setAttribute('height', size);
        img.setAttribute('class', 'hex-icon-img hex-icon-screen manaless-dim');
        iconGroup.appendChild(img);

        // Red cross-out line indicating absence of mana
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', -size / 2 + 1);
        line.setAttribute('y1', size / 2 - 1);
        line.setAttribute('x2', size / 2 - 1);
        line.setAttribute('y2', -size / 2 + 1);
        line.setAttribute('stroke', '#ef4444');
        line.setAttribute('stroke-width', '2.8');
        line.setAttribute('stroke-linecap', 'round');
        iconGroup.appendChild(line);
      } else if (type === 'energy') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M2 -13 L-7 0 L-1 0 L-4 13 L8 -1 L1 -1 Z');
        path.setAttribute('fill', '#facc15');
        path.setAttribute('stroke', '#ca8a04');
        path.setAttribute('stroke-width', '1');
        iconGroup.appendChild(path);
      } else if (type.startsWith('role-')) {
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('href', `assets/icons/${type}.png`);
        img.setAttribute('x', -size / 2);
        img.setAttribute('y', -size / 2);
        img.setAttribute('width', size);
        img.setAttribute('height', size);
        img.setAttribute('class', 'hex-icon-img');
        iconGroup.appendChild(img);
      } else if (type === 'gender-male') {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', -2);
        circle.setAttribute('cy', 3);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#60a5fa');
        circle.setAttribute('stroke-width', '2');
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('d', 'M2 -1 L9 -8 M4 -8 L9 -8 L9 -3');
        arrow.setAttribute('fill', 'none');
        arrow.setAttribute('stroke', '#60a5fa');
        arrow.setAttribute('stroke-width', '2');
        arrow.setAttribute('stroke-linecap', 'round');
        arrow.setAttribute('stroke-linejoin', 'round');
        iconGroup.appendChild(circle);
        iconGroup.appendChild(arrow);
      } else if (type === 'gender-female') {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', 0);
        circle.setAttribute('cy', -4);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#f472b6');
        circle.setAttribute('stroke-width', '2');
        const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        cross.setAttribute('d', 'M0 2 L0 10 M-4 6 L4 6');
        cross.setAttribute('fill', 'none');
        cross.setAttribute('stroke', '#f472b6');
        cross.setAttribute('stroke-width', '2');
        cross.setAttribute('stroke-linecap', 'round');
        iconGroup.appendChild(circle);
        iconGroup.appendChild(cross);
      } else if (type === 'gender-indeterminate') {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', 0);
        circle.setAttribute('cy', 0);
        circle.setAttribute('r', 7);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#cbd5e1');
        circle.setAttribute('stroke-width', '2');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', 0);
        dot.setAttribute('cy', 0);
        dot.setAttribute('r', 2.5);
        dot.setAttribute('fill', '#cbd5e1');
        iconGroup.appendChild(circle);
        iconGroup.appendChild(dot);
      } else if (type === 'range-melee') {
        // Crossed swords icon for melee
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M-9 -9 L9 9 M9 -9 L-9 9 M-9 -5 L-5 -9 M9 -5 L5 -9 M-9 5 L-5 9 M9 5 L5 9');
        path.setAttribute('stroke', '#cbd5e1');
        path.setAttribute('stroke-width', '2.2');
        path.setAttribute('stroke-linecap', 'round');
        iconGroup.appendChild(path);
      } else if (type === 'range-ranged') {
        // Bow and arrow icon for ranged
        const bow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bow.setAttribute('d', 'M-7 -8 Q-1 0 -7 8 M-7 -8 L-7 8');
        bow.setAttribute('fill', 'none');
        bow.setAttribute('stroke', '#38bdf8');
        bow.setAttribute('stroke-width', '1.8');
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('d', 'M-8 0 L7 0 M3 -4 L7 0 L3 4');
        arrow.setAttribute('fill', 'none');
        arrow.setAttribute('stroke', '#38bdf8');
        arrow.setAttribute('stroke-width', '2');
        arrow.setAttribute('stroke-linecap', 'round');
        arrow.setAttribute('stroke-linejoin', 'round');
        iconGroup.appendChild(bow);
        iconGroup.appendChild(arrow);
      } else {
        // Generic game-asset image icon (species-* uses SVG, others use PNG)
        const ext = type.startsWith('species-') ? 'svg' : 'png';
        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('href', `assets/icons/${type}.${ext}`);
        img.setAttribute('x', -size / 2);
        img.setAttribute('y', -size / 2);
        img.setAttribute('width', size);
        img.setAttribute('height', size);
        img.setAttribute('class', 'hex-icon-img');
        iconGroup.appendChild(img);
      }

      return iconGroup;
    }

    if (cat === 'REGION') {
      const regionSlug = name.toLowerCase().replace(/\s+/g, '-');
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('class', 'hex-region-crest');
      img.setAttribute('href', `assets/regions/${regionSlug}.png`);
      img.setAttribute('x', -14);
      img.setAttribute('y', -24);
      img.setAttribute('width', 28);
      img.setAttribute('height', 28);
      inner.appendChild(img);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-region-name');
      textName.setAttribute('y', 14);
      textName.textContent = name;
      inner.appendChild(textName);
    } else if (cat === 'YEAR') {
      const parts = name.split(' ');
      const textLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textLine1.setAttribute('class', 'hex-text-year-line1');
      textLine1.setAttribute('y', -4);
      textLine1.textContent = parts[0] || 'Released';

      const textLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textLine2.setAttribute('class', 'hex-text-year-line2');
      textLine2.setAttribute('y', 12);
      textLine2.textContent = parts.slice(1).join(' ');

      inner.appendChild(textLine1);
      inner.appendChild(textLine2);
    } else if (cat === 'RESOURCE') {
      let iconType = 'mana';
      if (name === 'Manaless') iconType = 'manaless';
      else if (name === 'Energy') iconType = 'energy';

      const iconEl = createIconElement(iconType, 26);
      iconEl.setAttribute('transform', 'translate(0, -11)');
      inner.appendChild(iconEl);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-sub');
      textName.setAttribute('y', 15);
      textName.textContent = name;
      inner.appendChild(textName);
    } else if (cat === 'GENDER') {
      let iconType = 'gender-indeterminate';
      if (name === 'Male') iconType = 'gender-male';
      else if (name === 'Female') iconType = 'gender-female';

      const iconEl = createIconElement(iconType, 24);
      iconEl.setAttribute('transform', 'translate(0, -11)');
      inner.appendChild(iconEl);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-sub');
      textName.setAttribute('y', 15);
      textName.textContent = name;
      inner.appendChild(textName);
    } else if (cat === 'ROLE') {
      const roleSlug = name.toLowerCase();
      const iconEl = createIconElement(`role-${roleSlug}`, 26);
      iconEl.setAttribute('transform', 'translate(0, -11)');
      inner.appendChild(iconEl);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-sub');
      textName.setAttribute('y', 15);
      textName.textContent = name;
      inner.appendChild(textName);
    } else if (cat === 'RANGE') {
      const rangeType = name === 'Melee' ? 'range-melee' : 'range-ranged';
      const iconEl = createIconElement(rangeType, 24);
      iconEl.setAttribute('transform', 'translate(0, -11)');
      inner.appendChild(iconEl);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-sub');
      textName.setAttribute('y', 15);
      textName.textContent = name;
      inner.appendChild(textName);
    } else if (cat === 'MECH') {
      const mechSlugMap = {
        'Knockup': 'mech-knockup',
        'Stun': 'mech-stun',
        'Shield': 'mech-shield',
        'Dash': 'mech-dash',
        'Root': 'mech-root',
        'True Damage': 'mech-true-damage',
        'Stealth': 'mech-stealth',
        'Global Ult': 'mech-global-ult'
      };
      const iconType = mechSlugMap[name] || 'mech-knockup';
      const iconEl = createIconElement(iconType, 24);
      iconEl.setAttribute('transform', 'translate(0, -11)');
      inner.appendChild(iconEl);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-sub');
      textName.setAttribute('y', 15);
      textName.textContent = name;
      inner.appendChild(textName);
    } else if (cat === 'SPECIES') {
      const speciesIconMap = {
        'Human':           'species-human',
        'Monster/Beast':   'species-beast',
        'Aspect/Celestial':'species-celestial',
        'Undead/Spirit':   'species-undead',
        'Yordle':          'species-yordle',
        'Vastaya':         'species-vastaya',
        'Golem/Construct': 'species-golem',
        'Darkin':          'species-darkin'
      };
      const iconType = speciesIconMap[name] || 'species-human';
      const iconEl = createIconElement(iconType, 26);
      iconEl.setAttribute('transform', 'translate(0, -11)');
      inner.appendChild(iconEl);

      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-sub');
      textName.setAttribute('y', 15);
      textName.textContent = name;
      inner.appendChild(textName);
    } else {
      // Fallback for any other category
      const textName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textName.setAttribute('class', 'hex-text-name hex-text-centered');
      textName.setAttribute('y', 4);
      textName.textContent = name;
      inner.appendChild(textName);
    }

    g.appendChild(inner);

    g.addEventListener('click', () => onHexClick(tile));
    hexGrid.appendChild(g);
  });
}

function onHexClick(tile) {
  if (!gameActive) {
    systemMsg.innerText = "Match has not started yet. Waiting for both players...";
    return;
  }
  if (myPlayerNum !== currentPlayer) {
    systemMsg.innerText = "It is not your turn!";
    return;
  }
  if (tile.owner !== 0) {
    systemMsg.innerText = "This hex is already claimed!";
    return;
  }

  document.querySelectorAll('.hex-tile').forEach(el => el.classList.remove('selected'));
  const targetEl = document.getElementById(tile.id);
  if (targetEl) targetEl.classList.add('selected');

  selectedHexId = tile.id;
  selectedDisplay.innerHTML = `Selected: <strong>[${tile.criteriaObj.cat}] ${tile.criteriaObj.name}</strong>`;
  champInput.disabled = false;
  if (submitBtn) submitBtn.disabled = false;
  champInput.value = '';
  hideSuggestions();
  champInput.focus();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getResolvedChampionName(rawInput) {
  const query = (rawInput || '').trim();
  if (!query) return '';

  // 1. Exact match (case-insensitive) - always valid even if short
  const exact = championPool.find(c => c.toLowerCase() === query.toLowerCase());
  if (exact) return exact;

  // Do not resolve partial names until at least 3 characters are typed
  if (query.length < 3) return query;

  // 2. Starts with query
  const starts = championPool.filter(c => c.toLowerCase().startsWith(query.toLowerCase()));
  if (starts.length > 0) {
    if (lockingToggle.checked) {
      const unlocked = starts.find(c => !usedChampions.includes(c));
      if (unlocked) return unlocked;
    }
    return starts[0];
  }

  // 3. Contains query
  const contains = championPool.filter(c => c.toLowerCase().includes(query.toLowerCase()));
  if (contains.length > 0) {
    if (lockingToggle.checked) {
      const unlocked = contains.find(c => !usedChampions.includes(c));
      if (unlocked) return unlocked;
    }
    return contains[0];
  }

  return query;
}

function updateSuggestions() {
  const query = champInput.value.trim().toLowerCase();
  // Require at least 3 characters before displaying autocomplete suggestions
  if (!query || query.length < 3 || !gameActive || myPlayerNum !== currentPlayer) {
    hideSuggestions();
    return;
  }

  const starts = [];
  const contains = [];

  championPool.forEach(name => {
    const lower = name.toLowerCase();
    if (lower.startsWith(query)) {
      starts.push(name);
    } else if (lower.includes(query)) {
      contains.push(name);
    }
  });

  const isLocked = (name) => lockingToggle.checked && usedChampions.includes(name);

  starts.sort((a, b) => {
    const aLocked = isLocked(a);
    const bLocked = isLocked(b);
    if (aLocked !== bLocked) return aLocked ? 1 : -1;
    return a.localeCompare(b);
  });

  contains.sort((a, b) => {
    const aLocked = isLocked(a);
    const bLocked = isLocked(b);
    if (aLocked !== bLocked) return aLocked ? 1 : -1;
    return a.localeCompare(b);
  });

  currentSuggestions = [...starts, ...contains].slice(0, 8);
  activeSuggestionIndex = -1;

  if (currentSuggestions.length === 0) {
    hideSuggestions();
    return;
  }

  renderSuggestions(query);
}

function renderSuggestions(query) {
  autocompleteList.innerHTML = '';
  currentSuggestions.forEach((name) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    if (lockingToggle.checked && usedChampions.includes(name)) {
      item.classList.add('locked');
    }

    const nameSpan = document.createElement('span');
    const lower = name.toLowerCase();
    const matchIdx = lower.indexOf(query);
    if (matchIdx >= 0) {
      const before = name.substring(0, matchIdx);
      const match = name.substring(matchIdx, matchIdx + query.length);
      const after = name.substring(matchIdx + query.length);
      nameSpan.innerHTML = `${escapeHtml(before)}<strong class="match-highlight">${escapeHtml(match)}</strong>${escapeHtml(after)}`;
    } else {
      nameSpan.textContent = name;
    }

    item.appendChild(nameSpan);

    if (lockingToggle.checked && usedChampions.includes(name)) {
      const tag = document.createElement('span');
      tag.className = 'locked-tag';
      tag.textContent = 'Locked';
      item.appendChild(tag);
    }

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      champInput.value = name;
      hideSuggestions();
      sendMove();
    });

    autocompleteList.appendChild(item);
  });

  autocompleteList.classList.remove('hidden');
}

function hideSuggestions() {
  autocompleteList.classList.add('hidden');
  autocompleteList.innerHTML = '';
  currentSuggestions = [];
  activeSuggestionIndex = -1;
}

function moveActiveSuggestion(delta) {
  if (currentSuggestions.length === 0) return;
  activeSuggestionIndex += delta;
  if (activeSuggestionIndex < 0) activeSuggestionIndex = currentSuggestions.length - 1;
  if (activeSuggestionIndex >= currentSuggestions.length) activeSuggestionIndex = 0;

  const items = autocompleteList.querySelectorAll('.autocomplete-item');
  items.forEach((el, idx) => {
    if (idx === activeSuggestionIndex) {
      el.classList.add('active');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('active');
    }
  });
}

champInput.addEventListener('input', updateSuggestions);

champInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveActiveSuggestion(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveActiveSuggestion(-1);
  } else if (e.key === 'Tab') {
    if (currentSuggestions.length > 0) {
      e.preventDefault();
      const selected = activeSuggestionIndex >= 0 ? currentSuggestions[activeSuggestionIndex] : currentSuggestions[0];
      champInput.value = selected;
      hideSuggestions();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
      champInput.value = currentSuggestions[activeSuggestionIndex];
    } else {
      champInput.value = getResolvedChampionName(champInput.value);
    }
    hideSuggestions();
    sendMove();
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

champInput.addEventListener('blur', () => {
  setTimeout(() => {
    hideSuggestions();
  }, 150);
});

if (submitBtn) {
  submitBtn.addEventListener('click', () => {
    if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
      champInput.value = currentSuggestions[activeSuggestionIndex];
    } else {
      champInput.value = getResolvedChampionName(champInput.value);
    }
    hideSuggestions();
    sendMove();
  });
}

function sendMove() {
  const resolved = getResolvedChampionName(champInput.value);
  if (!selectedHexId || !resolved) return;
  champInput.value = resolved;
  socket.emit('submitMove', {
    hexId: selectedHexId,
    champName: resolved
  });
}

// 4. Move Success & Capture Cascade Animation
socket.on('moveSuccess', (data) => {
  if (data.champName && !usedChampions.includes(data.champName)) {
    usedChampions.push(data.champName);
  }
  hideSuggestions();
  champInput.value = '';
  champInput.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  selectedDisplay.innerHTML = 'Selected: <em>None</em>';
  selectedHexId = null;

  p1Score.innerText = data.p1Score;
  p2Score.innerText = data.p2Score;

  applyCaptureStyle(data.primaryHexId, data.playerNum, data.champName);

  if (data.stolenHexIds && data.stolenHexIds.length > 0) {
    data.stolenHexIds.forEach((hexId, index) => {
      setTimeout(() => {
        applyCaptureStyle(hexId, data.playerNum, data.champName);
      }, (index + 1) * 120);
    });
  }
});

function applyCaptureStyle(hexId, playerNum, champName) {
  const el = document.getElementById(hexId);
  if (!el) return;

  el.classList.remove('owner-0', 'owner-1', 'owner-2', 'selected');
  el.classList.add(`owner-${playerNum}`, 'anim-capture');

  // Update in boardState array
  const tileObj = boardState.find(t => t.id === hexId);
  if (tileObj) {
    tileObj.owner = playerNum;
    if (champName) tileObj.claimedBy = champName;
  }

  // Add brief floating champion name that disappears after animation
  const inner = el.querySelector('.hex-inner');
  if (inner && champName) {
    // Remove any previous temporary label if exists
    const existing = inner.querySelector('.hex-claimed-champ');
    if (existing) existing.remove();

    const champLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    champLabel.setAttribute('class', 'hex-claimed-champ');
    champLabel.setAttribute('y', 0);
    champLabel.textContent = champName;
    inner.appendChild(champLabel);

    // Remove element after fadeout completes (2200ms)
    setTimeout(() => {
      champLabel.remove();
    }, 2300);
  }

  setTimeout(() => {
    el.classList.remove('anim-capture');
  }, 500);
}

// 5. Hex Rejection Shake Animation
socket.on('hexVibrate', ({ hexId, reason, playerNum }) => {
  const el = document.getElementById(hexId);
  if (el) {
    el.classList.add('anim-vibrate');
    setTimeout(() => {
      el.classList.remove('anim-vibrate');
    }, 450);
  }

  if (myPlayerNum === playerNum) {
    hideSuggestions();
    champInput.classList.add('error-shake');
    setTimeout(() => {
      champInput.classList.remove('error-shake');
    }, 450);
  }

  systemMsg.innerText = reason;
});

// 6. Turn Lifecycle
socket.on('turnPass', ({ reason, currentPlayer: nextPlayer }) => {
  currentPlayer = nextPlayer;
  updateTurnDisplay();
  if (reason) systemMsg.innerText = reason;

  hideSuggestions();
  document.querySelectorAll('.hex-tile').forEach(el => el.classList.remove('selected'));
  selectedHexId = null;
  selectedDisplay.innerHTML = 'Selected: <em>None</em>';

  champInput.value = '';
  champInput.disabled = (myPlayerNum !== currentPlayer);
  if (submitBtn) submitBtn.disabled = (myPlayerNum !== currentPlayer);
});

function updateTurnDisplay() {
  const currentSide = (currentPlayer === 1) ? 'BLUE SIDE' : 'RED SIDE';
  if (myPlayerNum === currentPlayer) {
    turnAnnounce.innerText = `YOUR TURN (${currentSide})`;
    turnAnnounce.style.color = (myPlayerNum === 1) ? '#38bdf8' : '#f43f5e';
  } else {
    turnAnnounce.innerText = `${currentSide}'S TURN`;
    turnAnnounce.style.color = (currentPlayer === 1) ? '#60a5fa' : '#fb7185';
  }
}

socket.on('gameOver', ({ winner, p1Score: finalP1, p2Score: finalP2 }) => {
  gameActive = false;
  const winnerText = winner === 0 ? "GAME OVER: DRAW!" : (winner === 1 ? "BLUE SIDE WINS!" : "RED SIDE WINS!");
  turnAnnounce.innerText = winnerText;
  turnAnnounce.style.color = '#facc15';
  systemMsg.innerText = `Final Score: Blue Side [${finalP1}] - Red Side [${finalP2}]`;
  champInput.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
});

socket.on('playerDisconnected', () => {
  systemMsg.innerText = "Opponent disconnected.";
});

socket.on('errorMsg', (msg) => {
  if (lobbyStatus) {
    lobbyStatus.innerText = msg;
    lobbyStatus.style.color = "#ef4444";
  }
  joinBtn.disabled = false;
  roomInput.disabled = false;
  alert(msg);
});