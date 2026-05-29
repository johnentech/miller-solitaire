'use strict';

/* ─── Card element builder ─────────────────────────────────────── */
function buildCardEl(card) {
  const container = document.createElement('div');
  container.className = 'card-container';
  container.dataset.id = card.id;

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const back = document.createElement('div');
  back.className = 'card-back';

  const SUIT_NAME = { '♠': 'spades', '♣': 'clubs', '♥': 'hearts', '♦': 'diamonds' };
  const face = document.createElement('div');
  face.className = 'card-face';
  const img = document.createElement('img');
  img.src = `assets/cards/${SUIT_NAME[card.suit]}_${card.rank}.png`;
  img.alt = `${card.rank} of ${SUIT_NAME[card.suit]}`;
  img.className = 'card-img';
  img.draggable = false;
  face.appendChild(img);

  inner.appendChild(back);
  inner.appendChild(face);
  container.appendChild(inner);

  container.style.display = card.faceUp ? '' : '';
  inner.style.transform = card.faceUp ? 'rotateY(0deg)' : 'rotateY(180deg)';
  // When face-down, back is showing (no transform); when face-up rotate to show face
  // Actually: back is front, face has backface-visibility:hidden
  // So default (0deg) shows back; 180deg shows face
  // Wait—let's be explicit: face-up => rotateY(180deg) so card-face is visible
  // card-back: backface-visibility hidden, shown at 0deg
  // card-face: backface-visibility hidden, shown at 180deg
  // But we built them without that — let me keep it simple: hide/show via display
  inner.style.transform = '';
  if (!card.faceUp) {
    face.style.display = 'none';
  } else {
    back.style.display = 'none';
  }

  return container;
}

/* ─── Sound engine ─────────────────────────────────────────────── */
class SoundEngine {
  constructor() {
    this.ctx = null;
  }

  _getCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (mobile browsers require gesture)
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _play(fn) {
    try { fn(this._getCtx()); } catch(e) { /* audio not available */ }
  }

  flip() {
    this._play(ctx => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.3;
      }
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2000;
      filter.Q.value = 1.5;
      src.buffer = buf;
      src.connect(filter);
      filter.connect(ctx.destination);
      src.start();
    });
  }

  place() {
    this._play(ctx => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.4;
      }
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      src.buffer = buf;
      src.connect(filter);
      filter.connect(ctx.destination);
      src.start();
    });
  }

  shuffle() {
    this._play(ctx => {
      const duration = 0.45;
      const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const envelope = Math.sin(Math.PI * t / duration);
        data[i] = (Math.random() * 2 - 1) * envelope * 0.25;
      }
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 0.8;
      src.buffer = buf;
      src.connect(filter);
      filter.connect(ctx.destination);
      src.start();
    });
  }

  win() {
    this._play(ctx => {
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.8);
      });
    });
  }
}

/* ─── UI Controller ─────────────────────────────────────────────── */
class SolitaireUI {
  constructor(game) {
    this.game = game;
    this.sound = new SoundEngine();
    this.dragState = null;
    this.selected = null; // { type, colIndex, cardIndex } for tap-to-move
    this._animating = false;
    this._lastTap   = null; // { cardId, time } for double-tap detection

    game.onStateChange = (event) => this.onStateChange(event);
    game.onSound = (name) => {
      const fn = this.sound[name];
      if (fn) fn.call(this.sound);
    };

    this._buildDOM();
    this._attachEvents();
    this.render(true);
  }

  _buildDOM() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div id="hud">
        <h1>Cottage Solitaire</h1>
        <div class="hud-stat">Score<span id="score-val">0</span></div>
        <div class="hud-stat">Moves<span id="moves-val">0</span></div>
        <div class="hud-stat" id="hud-time">Time<span id="time-val">0:00</span></div>
        <button id="btn-auto">Auto-Complete</button>
        <button id="btn-undo" disabled>↩ Undo</button>
        <button id="btn-new-game">New Game</button>
      </div>
      <div id="play-area">
        <div id="top-row">
          <div id="stock" class="slot" title="Click to draw"></div>
          <div id="waste" class="slot"></div>
          <div class="gap"></div>
          <div id="foundations"></div>
        </div>
        <div id="tableau-row"></div>
      </div>
      <div id="win-overlay">
        <div id="win-rain"></div>
        <div id="win-box">
          <div class="win-top-bar"></div>
          <h2>Congratulations!</h2>
          <p class="win-subtitle">✦ &nbsp; You Won &nbsp; ✦</p>
          <div id="win-stats">
            <div class="win-stat"><span class="win-stat-val" id="win-score">0</span><span class="win-stat-label">Score</span></div>
            <div class="win-stat"><span class="win-stat-val" id="win-moves">0</span><span class="win-stat-label">Moves</span></div>
            <div class="win-stat"><span class="win-stat-val" id="win-time">0:00</span><span class="win-stat-label">Time</span></div>
          </div>
          <button id="btn-play-again">Play Again</button>
        </div>
      </div>
    `;

    // Foundations
    const foundationsEl = document.getElementById('foundations');
    foundationsEl.style.cssText = 'display:flex;gap:8px;';
    const suits = ['♠', '♥', '♦', '♣'];
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot foundation-slot';
      slot.id = `foundation-${i}`;
      slot.dataset.suit = suits[i];
      slot.dataset.foundationIndex = i;
      foundationsEl.appendChild(slot);
    }

    // Tableau
    const tableauRow = document.getElementById('tableau-row');
    for (let i = 0; i < 7; i++) {
      const col = document.createElement('div');
      col.className = 'tableau-col';
      col.id = `tableau-${i}`;
      col.dataset.colIndex = i;
      tableauRow.appendChild(col);
    }

  }

  _attachEvents() {
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this.clearSelection();
      this.game.deal();
      this.render(true);
    });

    document.getElementById('btn-play-again').addEventListener('click', () => {
      document.getElementById('win-overlay').classList.remove('visible');
      document.getElementById('win-rain').innerHTML = '';
      this.clearSelection();
      this.game.deal();
      this.render(true);
    });

    document.getElementById('btn-auto').addEventListener('click', () => {
      if (this.game.canAutoComplete()) {
        this._runAutoComplete();
      }
    });

    document.getElementById('btn-undo').addEventListener('click', () => {
      if (this._animating) return;
      this.clearSelection();
      this.game.undo();
    });

    document.getElementById('stock').addEventListener('click', () => {
      if (this._animating) return;
      this.clearSelection();
      const state = this.game.getState();
      if (state.stock.length === 0 && state.waste.length === 0) return;
      if (state.stock.length === 0) {
        this._animateRecycle();
      } else {
        this._animateDraw();
      }
    });

    // Foundation clicks (tap-to-move from waste)
    for (let i = 0; i < 4; i++) {
      document.getElementById(`foundation-${i}`).addEventListener('click', (e) => {
        this._onFoundationClick(i, e);
      });
    }

    // Global pointer events for drag
    document.addEventListener('mousedown', (e) => this._onPointerDown(e));
    document.addEventListener('touchstart', (e) => this._onPointerDown(e), { passive: false });
    document.addEventListener('mousemove', (e) => this._onPointerMove(e));
    document.addEventListener('touchmove', (e) => this._onPointerMove(e), { passive: false });
    document.addEventListener('mouseup', (e) => this._onPointerUp(e));
    document.addEventListener('touchend', (e) => this._onPointerUp(e));
  }

  // ── Rendering ──────────────────────────────────────────────────

  render(animate) {
    const state = this.game.getState();
    this._renderHUD(state);
    this._renderStock(state);
    this._renderWaste(state);
    this._renderFoundations(state);
    this._renderTableau(state, animate);
    this._updateAutoBtn(state);
    // If a drag is in progress the DOM was just rebuilt — re-hide source cards
    // immediately so the player never sees them reappear mid-drag.
    if (this.dragState && this.dragState.moved) {
      this.dragState.hiddenEls = this._hideDraggedCards(this.dragState);
    }
  }

  _renderHUD(state) {
    document.getElementById('score-val').textContent = state.score;
    document.getElementById('moves-val').textContent = state.moves;
    const m = Math.floor(state.elapsed / 60);
    const s = state.elapsed % 60;
    document.getElementById('time-val').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  _renderStock(state) {
    const el = document.getElementById('stock');
    el.innerHTML = '';
    if (state.stock.length > 0) {
      const card = { suit: '♠', rank: 'A', faceUp: false, id: '__stock__' };
      const cardEl = buildCardEl(card);
      el.appendChild(cardEl);
    } else {
      el.innerHTML = '<span style="color:rgba(255,255,255,.4);font-size:1.6rem;line-height:calc(var(--card-h));display:block;text-align:center;">↺</span>';
    }
  }

  _renderWaste(state) {
    const el = document.getElementById('waste');
    el.innerHTML = '';
    if (state.waste.length > 0) {
      const card = state.waste[state.waste.length - 1];
      const cardEl = buildCardEl(card);
      cardEl.dataset.source = 'waste';
      el.appendChild(cardEl);
    }
  }

  _renderFoundations(state) {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`foundation-${i}`);
      const pile = state.foundation[i];
      // Keep the suit symbol for empty slot via CSS ::after
      // Remove old card if any
      const existing = el.querySelector('.card-container');
      if (existing) existing.remove();
      if (pile.length > 0) {
        const card = pile[pile.length - 1];
        const cardEl = buildCardEl(card);
        cardEl.dataset.source = 'foundation';
        cardEl.dataset.foundationIndex = i;
        el.appendChild(cardEl);
      }
    }
  }

  _renderTableau(state, animate) {
    for (let col = 0; col < 7; col++) {
      const colEl = document.getElementById(`tableau-${col}`);
      colEl.innerHTML = '';

      const pile = state.tableau[col];
      let top = 0;

      if (pile.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'slot tableau-placeholder';
        colEl.appendChild(placeholder);
      }

      pile.forEach((card, idx) => {
        const cardEl = buildCardEl(card);
        cardEl.dataset.source = 'tableau';
        cardEl.dataset.colIndex = col;
        cardEl.dataset.cardIndex = idx;

        cardEl.style.position = 'absolute';
        cardEl.style.top = `${top}px`;
        cardEl.style.left = '0';
        cardEl.style.zIndex = idx;

        if (animate) {
          const delay = (col * 2 + idx) * 60;
          cardEl.style.animationDelay = `${delay}ms`;
          cardEl.classList.add('dealing');
        }

        colEl.appendChild(cardEl);

        if (!card.faceUp) {
          top += parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--tableau-overlap')) || 28;
        } else {
          top += parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--tableau-fan')) || 22;
        }
      });

      // Set column height so the column div is tall enough
      const cardH = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--card-h')) || 126;
      colEl.style.minHeight = `${top + cardH}px`;
    }
  }

  _updateAutoBtn(state) {
    document.getElementById('btn-auto').disabled = !this.game.canAutoComplete();
    document.getElementById('btn-undo').disabled = !this.game.canUndo();
  }

  onStateChange(event) {
    if (event === 'deal') {
      this.render(true);
      return;
    }
    if (event === 'win') {
      this.render(false);
      const state = this.game.getState();
      const m = Math.floor(state.elapsed / 60);
      const s = state.elapsed % 60;
      document.getElementById('win-score').textContent = state.score;
      document.getElementById('win-moves').textContent = state.moves;
      document.getElementById('win-time').textContent  = `${m}:${s.toString().padStart(2,'0')}`;
      document.getElementById('win-overlay').classList.add('visible');
      this._startCardRain();
      return;
    }
    if (event === 'tick') {
      // Timer tick only needs the HUD updated — rebuilding the whole board would
      // destroy any visibility:hidden set on cards currently being dragged.
      this._renderHUD(this.game.getState());
      return;
    }
    this.render(false);
  }

  // ── Tap-to-move / click logic ────────────────────────────────────

  _onFoundationClick(foundIndex) {
    if (this.dragState) return;
    // If something is selected in tableau, try to move it
    if (this.selected) {
      const sel = this.selected;
      if (sel.type === 'waste') {
        this.game.playWasteCard('foundation', foundIndex);
      } else if (sel.type === 'tableau') {
        this.game.moveTableauToFoundation(sel.colIndex, foundIndex);
      }
      this.clearSelection();
      return;
    }
    // Otherwise try auto-move waste to foundation
    if (this.game.waste.length > 0) {
      this.game.playWasteCard('foundation', foundIndex);
    }
  }

  _handleCardTap(cardEl) {
    const source = cardEl.dataset.source;

    if (source === 'waste') {
      // Single tap selects for tap-to-move; double-tap animates to foundation
      this._setSelected({ type: 'waste' }, cardEl);
      return;
    }

    if (source === 'tableau') {
      const col = parseInt(cardEl.dataset.colIndex);
      const idx = parseInt(cardEl.dataset.cardIndex);
      const pile = this.game.tableau[col];
      const card = pile[idx];

      if (!card.faceUp) {
        // Face-down card: flip if it's the top card
        if (idx === pile.length - 1) {
          card.faceUp = true;
          this.game.score += 5;
          this.game.onSound && this.game.onSound('flip');
          this.game.onStateChange && this.game.onStateChange('move');
        }
        return;
      }

      // Face-up: if something already selected, try to move onto this
      if (this.selected) {
        const sel = this.selected;
        let moved = false;
        if (sel.type === 'waste') {
          moved = this.game.playWasteCard('tableau', col);
        } else if (sel.type === 'tableau' && sel.colIndex !== col) {
          moved = this.game.moveTableauStack(sel.colIndex, sel.cardIndex, col);
        }
        this.clearSelection();
        if (!moved) {
          // select this card instead
          this._setSelected({ type: 'tableau', colIndex: col, cardIndex: idx }, cardEl);
        }
        return;
      }

      // Single tap selects card/stack; double-tap animates top card to foundation
      this._setSelected({ type: 'tableau', colIndex: col, cardIndex: idx }, cardEl);
      return;
    }

    if (source === 'foundation') {
      this.clearSelection();
    }
  }

  _setSelected(info, el) {
    this.clearSelection();
    this.selected = info;
    el.classList.add('selected');
  }

  clearSelection() {
    this.selected = null;
    document.querySelectorAll('.card-container.selected').forEach(el => {
      el.classList.remove('selected');
    });
  }

  // ── Double-tap: animated fly to foundation ───────────────────────

  _handleDoubleTap(cardEl) {
    if (this._animating) return;
    const source = cardEl.dataset.source;
    let card, sourceType, sourceCol;

    if (source === 'waste') {
      if (!this.game.waste.length) return;
      card       = this.game.waste[this.game.waste.length - 1];
      sourceType = 'waste';
      sourceCol  = -1;
    } else if (source === 'tableau') {
      const col  = parseInt(cardEl.dataset.colIndex);
      const idx  = parseInt(cardEl.dataset.cardIndex);
      const pile = this.game.tableau[col];
      card = pile[idx];
      if (!card || !card.faceUp || idx !== pile.length - 1) return;
      sourceType = 'tableau';
      sourceCol  = col;
    } else return;

    const foundIdx = this._findFoundationFor(card);
    if (foundIdx === -1) return;          // no valid foundation yet

    this.clearSelection();
    this._animateCardToFoundation(cardEl, card, sourceType, sourceCol, foundIdx);
  }

  _findFoundationFor(card) {
    for (let i = 0; i < 4; i++) {
      if (window.canPlaceOnFoundation(card, this.game.foundation[i])) return i;
    }
    return -1;
  }

  _animateCardToFoundation(cardEl, card, sourceType, sourceCol, foundIdx) {
    this._animating = true;

    const cardRect  = cardEl.getBoundingClientRect();
    const foundEl   = document.getElementById(`foundation-${foundIdx}`);
    const foundRect = foundEl.getBoundingClientRect();
    const dx        = foundRect.left - cardRect.left;
    const dy        = foundRect.top  - cardRect.top;
    const DURATION  = 300;

    // Ghost card flies from its current position to the foundation slot
    const flyCard = buildCardEl({ ...card, faceUp: true });
    flyCard.querySelector('.card-inner').style.transition = 'none';
    flyCard.style.position      = 'fixed';
    flyCard.style.left          = `${cardRect.left}px`;
    flyCard.style.top           = `${cardRect.top}px`;
    flyCard.style.zIndex        = '9999';
    flyCard.style.pointerEvents = 'none';
    flyCard.style.margin        = '0';
    document.body.appendChild(flyCard);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      flyCard.style.transition = `transform ${DURATION}ms ease-in-out`;
      flyCard.style.transform  = `translate(${dx}px, ${dy}px) scale(0.9)`;
    }));

    // At landing: remove ghost, commit state (which fires 'place' sound + re-render)
    setTimeout(() => {
      flyCard.remove();
      if (sourceType === 'waste') {
        this.game.playWasteCard('foundation', foundIdx);
      } else {
        this.game.moveTableauToFoundation(sourceCol, foundIdx);
      }
      this._animating = false;
    }, DURATION + 50);
  }

  // ── Drag & drop ──────────────────────────────────────────────────

  _getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  _onPointerDown(e) {
    const { x, y } = this._getEventCoords(e);
    const target = document.elementFromPoint(x, y);
    if (!target) return;

    const cardEl = target.closest('.card-container');
    if (!cardEl) return;

    // Ignore cards in foundation slots as drag sources
    if (cardEl.dataset.source === 'foundation') return;

    const source = cardEl.dataset.source;
    if (!source) return;

    // Face-down in tableau — don't drag
    if (source === 'tableau') {
      const col = parseInt(cardEl.dataset.colIndex);
      const idx = parseInt(cardEl.dataset.cardIndex);
      if (!this.game.tableau[col][idx].faceUp) return;
    }

    if (e.type === 'touchstart') e.preventDefault();

    const rect = cardEl.getBoundingClientRect();
    this.dragState = {
      cardEl,
      source,
      colIndex: parseInt(cardEl.dataset.colIndex ?? -1),
      cardIndex: parseInt(cardEl.dataset.cardIndex ?? -1),
      startX: x,
      startY: y,
      offsetX: x - rect.left,
      offsetY: y - rect.top,
      moved: false,
      clone: null,
      hiddenEls: [],
      originalRect: rect,
    };
  }

  _onPointerMove(e) {
    if (!this.dragState) return;
    const { x, y } = this._getEventCoords(e);
    const ds = this.dragState;

    const dx = x - ds.startX;
    const dy = y - ds.startY;
    if (!ds.moved && Math.sqrt(dx*dx + dy*dy) < 6) return;

    if (e.type === 'touchmove') e.preventDefault();

    if (!ds.moved) {
      ds.moved = true;
      this.clearSelection();
      // Hide originals before the clone appears so there is no flash of duplication
      ds.clone = this._buildDragClone(ds);
      ds.hiddenEls = this._hideDraggedCards(ds);
      document.body.appendChild(ds.clone);
    }

    if (ds.clone) {
      ds.clone.style.left = `${x - ds.offsetX}px`;
      ds.clone.style.top  = `${y - ds.offsetY}px`;
    }

    // Highlight drop targets
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    const target = this._getDropTarget(x, y, ds.clone);
    if (target) target.classList.add('drop-target');
  }

  _onPointerUp(e) {
    if (!this.dragState) return;
    const { x, y } = this._getEventCoords(e);
    const ds = this.dragState;
    this.dragState = null;

    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

    if (!ds.moved) {
      // Tap — no clone was ever created
      const now      = Date.now();
      const cardId   = ds.cardEl.dataset.id;
      const isDouble = this._lastTap &&
                       this._lastTap.cardId === cardId &&
                       now - this._lastTap.time < 350;
      this._lastTap  = isDouble ? null : { cardId, time: now };
      if (ds.cardEl.isConnected) {
        if (isDouble) this._handleDoubleTap(ds.cardEl);
        else          this._handleCardTap(ds.cardEl);
      }
      return;
    }

    // Drag completed — find a valid drop target
    const target = this._getDropTarget(x, y, null);
    if (!target) {
      this._animateReturnDrag(ds);
      return;
    }

    const targetType  = target.dataset.foundationIndex !== undefined ? 'foundation' : 'tableau';
    const targetIndex = parseInt(target.dataset.foundationIndex ?? target.dataset.colIndex ?? -1);
    if (targetIndex === -1) {
      this._animateReturnDrag(ds);
      return;
    }

    // Try to commit the move (clone is still in DOM until we know it succeeded)
    let moved = false;
    if (ds.source === 'waste') {
      moved = this.game.playWasteCard(targetType, targetIndex);
    } else if (ds.source === 'tableau') {
      if (targetType === 'foundation') {
        moved = this.game.moveTableauToFoundation(ds.colIndex, targetIndex);
      } else {
        moved = this.game.moveTableauStack(ds.colIndex, ds.cardIndex, targetIndex);
      }
    }

    if (moved) {
      // Success — remove clone; board was already re-rendered by onStateChange
      if (ds.clone) { ds.clone.remove(); ds.clone = null; }
    } else {
      // Game rejected the move — fly the clone back
      this._animateReturnDrag(ds);
    }
  }

  _buildDragClone(ds) {
    const { source, colIndex, cardIndex } = ds;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      display: flex; flex-direction: column; gap: 0;
      transform: scale(1.05); transform-origin: top center;
    `;

    let cards = [];
    if (source === 'waste') {
      cards = [this.game.waste[this.game.waste.length - 1]];
    } else if (source === 'tableau') {
      cards = this.game.tableau[colIndex].slice(cardIndex);
    }

    const fan = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--tableau-fan')) || 22;

    cards.forEach((card, i) => {
      const cardEl = buildCardEl(card);
      cardEl.style.position = i === 0 ? 'relative' : 'absolute';
      cardEl.style.top = i === 0 ? '0' : `${i * fan}px`;
      cardEl.style.left = '0';
      cardEl.style.opacity = '0.85';
      cardEl.style.boxShadow = '0 6px 20px rgba(0,0,0,.5)';
      wrapper.appendChild(cardEl);
    });

    const wh = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--card-h')) || 126;
    wrapper.style.height = `${wh + (cards.length - 1) * fan}px`;

    return wrapper;
  }

  _getDropTarget(x, y, exclude) {
    const candidates = [
      ...document.querySelectorAll('.foundation-slot'),
      ...document.querySelectorAll('.tableau-col'),
    ];

    for (const el of candidates) {
      if (exclude && el.contains(exclude)) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return el;
      }
    }
    return null;
  }

  // ── Drag helper: hide/restore/return ────────────────────────────

  _hideDraggedCards(ds) {
    const hide = el => {
      el.style.opacity    = '0';
      el.style.visibility = 'hidden';
    };
    const els = [];
    if (ds.source === 'waste') {
      // Query the DOM fresh (same pattern as tableau) rather than relying on stored reference
      const wasteEl = document.getElementById('waste');
      if (wasteEl) {
        wasteEl.querySelectorAll('.card-container').forEach(el => {
          hide(el);
          els.push(el);
        });
      }
    } else if (ds.source === 'tableau') {
      const colEl = document.getElementById(`tableau-${ds.colIndex}`);
      if (colEl) {
        colEl.querySelectorAll('.card-container').forEach(el => {
          if (parseInt(el.dataset.cardIndex) >= ds.cardIndex) {
            hide(el);
            els.push(el);
          }
        });
      }
    }
    return els;
  }

  _restoreDraggedCards(ds) {
    if (ds.hiddenEls) {
      ds.hiddenEls.forEach(el => {
        if (el.isConnected) {
          el.style.opacity    = '';
          el.style.visibility = '';
        }
      });
    }
  }

  _animateReturnDrag(ds) {
    const clone = ds.clone;
    if (!clone) { this._restoreDraggedCards(ds); return; }

    clone.style.pointerEvents = 'none';
    // Snap the transition starting point to current painted position
    void clone.offsetWidth;
    clone.style.transition = 'left 300ms ease-in-out, top 300ms ease-in-out, transform 300ms ease-in-out';

    requestAnimationFrame(() => {
      clone.style.left      = `${ds.originalRect.left}px`;
      clone.style.top       = `${ds.originalRect.top}px`;
      clone.style.transform = 'scale(1)';
    });

    setTimeout(() => {
      clone.remove();
      ds.clone = null;
      this._restoreDraggedCards(ds);
    }, 330);
  }

  // ── Auto-complete animation ─────────────────────────────────────

  _runAutoComplete() {
    if (!this.game.canAutoComplete()) return;

    const step = () => {
      const state = this.game.getState();
      // Find a movable card
      for (let col = 0; col < 7; col++) {
        const pile = state.tableau[col];
        if (pile.length === 0) continue;
        const card = pile[pile.length - 1];
        if (!card.faceUp) continue;
        for (let fi = 0; fi < 4; fi++) {
          if (window.canPlaceOnFoundation
            ? window.canPlaceOnFoundation(card, state.foundation[fi])
            : true) {
            if (this.game.moveTableauToFoundation(col, fi)) {
              setTimeout(step, 120);
              return;
            }
          }
        }
      }
      // Check waste
      if (state.waste.length > 0) {
        const card = state.waste[state.waste.length - 1];
        for (let fi = 0; fi < 4; fi++) {
          if (this.game.playWasteCard('foundation', fi)) {
            setTimeout(step, 120);
            return;
          }
        }
      }
    };

    step();
  }

  // ── Card rain on win ────────────────────────────────────────────
  // Spawns 24 card-back divs with randomised positions, delays,
  // durations, and rotation angles. They fall once then stop.

  _startCardRain() {
    const rain = document.getElementById('win-rain');
    rain.innerHTML = '';
    const COUNT = 24;
    for (let i = 0; i < COUNT; i++) {
      const card = document.createElement('div');
      card.className = 'rain-card';
      const left   = (Math.random() * 112) - 6;        // −6 % … 106 %
      const delay  = (Math.random() * 2.8).toFixed(2);
      const dur    = (1.6 + Math.random() * 1.8).toFixed(2);
      const rotA   = ((Math.random() - 0.5) * 44).toFixed(1);
      const rotB   = (parseFloat(rotA) + (Math.random() - 0.5) * 70).toFixed(1);
      card.style.left = `${left.toFixed(1)}%`;
      card.style.animationDuration = `${dur}s`;
      card.style.animationDelay    = `${delay}s`;
      card.style.setProperty('--rain-rot-a', `${rotA}deg`);
      card.style.setProperty('--rain-rot-b', `${rotB}deg`);
      rain.appendChild(card);
    }
  }

  // ── Draw animation ──────────────────────────────────────────────
  // Creates a ghost card at the stock position, slides it to the
  // waste position, and flips it face-up mid-travel using CSS
  // transitions + a transitionend-triggered face swap.
  // State is only updated after the animation completes.

  _animateDraw() {
    this._animating = true;
    const stockEl = document.getElementById('stock');
    const wasteEl = document.getElementById('waste');
    stockEl.style.pointerEvents = 'none';
    wasteEl.style.pointerEvents = 'none';

    const stockRect = stockEl.getBoundingClientRect();
    const wasteRect = wasteEl.getBoundingClientRect();
    const card      = this.game.stock[this.game.stock.length - 1];

    const DURATION = 300;
    const HALF     = DURATION / 2;
    const dx = wasteRect.left - stockRect.left;
    const dy = wasteRect.top  - stockRect.top;

    const flyCard = buildCardEl({ ...card, faceUp: false });
    const inner   = flyCard.querySelector('.card-inner');
    const backEl  = flyCard.querySelector('.card-back');
    const faceEl  = flyCard.querySelector('.card-face');

    // Override the class-level transition on card-inner so it doesn't
    // interfere when we set our own transition below.
    inner.style.transition = 'none';

    flyCard.style.position      = 'fixed';
    flyCard.style.left          = `${stockRect.left}px`;
    flyCard.style.top           = `${stockRect.top}px`;
    flyCard.style.zIndex        = '9999';
    flyCard.style.pointerEvents = 'none';
    flyCard.style.margin        = '0';
    document.body.appendChild(flyCard);

    // Two rAFs ensure the browser paints the card at its start position
    // before we set the transition — otherwise it skips straight to the end.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      // ── Travel ──────────────────────────────────────────────
      flyCard.style.transition = `transform ${DURATION}ms ease-in-out`;
      flyCard.style.transform  = `translate(${dx}px, ${dy}px)`;

      // ── Flip phase 1: back rotates 0° → 90° (squishes to edge) ──
      inner.style.transition = `transform ${HALF}ms ease-in`;
      inner.style.transform  = 'rotateY(90deg)';

      // ── Flip phase 2: fires exactly when phase 1 ends ────────
      inner.addEventListener('transitionend', function onEdge() {
        inner.removeEventListener('transitionend', onEdge);
        // Swap to face side while card is invisible (edge-on at 90°)
        backEl.style.display = 'none';
        faceEl.style.display = '';
        // Jump instantly to −90° (still edge-on, now face side is "behind")
        inner.style.transition = 'none';
        inner.style.transform  = 'rotateY(-90deg)';
        void inner.offsetWidth;            // force reflow so jump commits
        // Transition from −90° → 0°: face fans out into view
        inner.style.transition = `transform ${HALF}ms ease-out`;
        inner.style.transform  = 'rotateY(0deg)';
      });
    }));

    // Remove ghost and commit state after full animation
    setTimeout(() => {
      flyCard.remove();
      this.game.drawStock();           // triggers re-render via onStateChange
      stockEl.style.pointerEvents = '';
      wasteEl.style.pointerEvents = '';
      this._animating = false;
    }, DURATION + 80);
  }

  // ── Recycle animation ────────────────────────────────────────────
  // Cascades up to 5 ghost cards from waste back to stock with 40ms
  // stagger. The visible top card flips face-down mid-travel.
  // Shuffle sound plays at animation start, not at state-commit time.

  _animateRecycle() {
    this._animating = true;
    const stockEl = document.getElementById('stock');
    const wasteEl = document.getElementById('waste');
    stockEl.style.pointerEvents = 'none';
    wasteEl.style.pointerEvents = 'none';

    const stockRect = stockEl.getBoundingClientRect();
    const wasteRect = wasteEl.getBoundingClientRect();

    const STAGGER  = 40;
    const PER_CARD = 280;
    const dx = stockRect.left - wasteRect.left;
    const dy = stockRect.top  - wasteRect.top;

    // Play shuffle now (visually in sync) and suppress the duplicate
    // that game.drawStock() fires when it commits the recycle.
    this.sound.shuffle();
    const origOnSound = this.game.onSound;
    this.game.onSound = (name) => { if (name !== 'shuffle') origOnSound(name); };

    const waste    = this.game.waste;
    const numCards = Math.min(waste.length, 5);

    for (let i = 0; i < numCards; i++) {
      const isTop    = i === 0;
      const cardData = isTop
        ? { ...waste[waste.length - 1], faceUp: true }
        : { suit: '♠', rank: 'A', faceUp: false, id: `__ghost${i}` };

      setTimeout(() => {
        const flyCard = buildCardEl(cardData);
        const inner   = flyCard.querySelector('.card-inner');

        inner.style.transition = 'none'; // suppress class-level transition

        flyCard.style.position      = 'fixed';
        flyCard.style.left          = `${wasteRect.left}px`;
        flyCard.style.top           = `${wasteRect.top}px`;
        flyCard.style.zIndex        = `${9999 - i}`;
        flyCard.style.pointerEvents = 'none';
        flyCard.style.margin        = '0';
        document.body.appendChild(flyCard);

        requestAnimationFrame(() => requestAnimationFrame(() => {
          // Travel: slide from waste to stock
          flyCard.style.transition = `transform ${PER_CARD}ms ease-in`;
          flyCard.style.transform  = `translate(${dx}px, ${dy}px)`;

          // Only the face-up top card needs to flip during travel
          if (isTop) {
            const faceEl = flyCard.querySelector('.card-face');
            const backEl = flyCard.querySelector('.card-back');
            const HALF   = Math.round(PER_CARD * 0.35);

            // Delay flip start to ~20% into the travel
            setTimeout(() => {
              inner.style.transition = `transform ${HALF}ms ease-in`;
              inner.style.transform  = 'rotateY(90deg)';

              inner.addEventListener('transitionend', function onEdge() {
                inner.removeEventListener('transitionend', onEdge);
                faceEl.style.display = 'none';
                backEl.style.display = '';
                inner.style.transition = 'none';
                inner.style.transform  = 'rotateY(-90deg)';
                void inner.offsetWidth;
                inner.style.transition = `transform ${HALF}ms ease-out`;
                inner.style.transform  = 'rotateY(0deg)';
              });
            }, PER_CARD * 0.2);
          }
        }));

        setTimeout(() => flyCard.remove(), PER_CARD + 60);
      }, i * STAGGER);
    }

    // After the last card lands: commit state, then bounce the stock pile
    const totalDuration = (numCards - 1) * STAGGER + PER_CARD;

    setTimeout(() => {
      this.game.drawStock();           // recycles waste→stock, fires re-render
      this.game.onSound = origOnSound;

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const stockCard = stockEl.querySelector('.card-container');
        if (stockCard) {
          stockCard.classList.add('card-settle');
          stockCard.addEventListener('animationend',
            () => stockCard.classList.remove('card-settle'), { once: true });
        }
        stockEl.style.pointerEvents = '';
        wasteEl.style.pointerEvents = '';
        this._animating = false;
      }));
    }, totalDuration + 80);
  }
}

window.SolitaireUI = SolitaireUI;
