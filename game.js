'use strict';

const SUITS = ['♠', '♣', '♥', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_NAMES = { '♠': 'spades', '♣': 'clubs', '♥': 'hearts', '♦': 'diamonds' };
const RED_SUITS = new Set(['♥', '♦']);

function rankIndex(rank) { return RANKS.indexOf(rank); }
function isRed(suit) { return RED_SUITS.has(suit); }

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, faceUp: false, id: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Returns true if card can be placed on a tableau pile
function canPlaceOnTableau(card, pile) {
  if (pile.length === 0) return card.rank === 'K';
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return isRed(card.suit) !== isRed(top.suit) &&
         rankIndex(card.rank) === rankIndex(top.rank) - 1;
}

// Returns true if card can be placed on a foundation pile
function canPlaceOnFoundation(card, foundation) {
  if (foundation.length === 0) return card.rank === 'A';
  const top = foundation[foundation.length - 1];
  return card.suit === top.suit && rankIndex(card.rank) === rankIndex(top.rank) + 1;
}

class SolitaireGame {
  constructor(drawMode) {
    this.score = 0;
    this.moves = 0;
    this.startTime = null;
    this.timerInterval = null;
    this.elapsed = 0;
    this.drawMode = drawMode || 'draw1';
    this.onStateChange = null; // callback for UI
    this.deal();
  }

  deal(drawMode) {
    clearInterval(this.timerInterval);
    this.score = 0;
    this.moves = 0;
    this.elapsed = 0;
    this.startTime = null;
    this.history = [];
    if (drawMode) this.drawMode = drawMode;

    const deck = shuffle(createDeck());
    this.tableau = Array.from({ length: 7 }, () => []);
    this.foundation = Array.from({ length: 4 }, () => []);
    this.stock = [];
    this.waste = [];

    // Deal tableau
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck[idx++];
        card.faceUp = (row === col);
        this.tableau[col].push(card);
      }
    }
    // Remaining cards go to stock
    while (idx < deck.length) {
      this.stock.push(deck[idx++]);
    }

    this._notify('deal');
  }

  startTimer() {
    if (this.startTime !== null) return;
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      this.elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this._notify('tick');
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  _addScore(delta) {
    this.score = Math.max(0, this.score + delta);
  }

  _notify(event) {
    if (this.onStateChange) this.onStateChange(event);
  }

  _saveHistory() {
    this.history.push({
      tableau:    this.tableau.map(col => col.map(c => ({ ...c }))),
      foundation: this.foundation.map(f   => f.map(c   => ({ ...c }))),
      stock:      this.stock.map(c => ({ ...c })),
      waste:      this.waste.map(c => ({ ...c })),
      score:      this.score,
      moves:      this.moves,
    });
    if (this.history.length > 3) this.history.shift();
  }

  canUndo() { return this.history.length > 0; }

  undo() {
    if (!this.canUndo()) return false;
    const snap = this.history.pop();
    this.tableau    = snap.tableau;
    this.foundation = snap.foundation;
    this.stock      = snap.stock;
    this.waste      = snap.waste;
    this.score      = Math.max(0, snap.score - 5);
    this.moves      = snap.moves;
    this._notify('undo');
    return true;
  }

  // Draw from stock to waste
  drawStock() {
    this.startTimer();
    if (this.stock.length === 0) {
      if (this.waste.length === 0) return false;
      // Recycle waste -> stock
      this._saveHistory();
      this._addScore(-20);
      this.stock = this.waste.reverse().map(c => ({ ...c, faceUp: false }));
      this.waste = [];
      this._notify('recycle');
      return true;
    }
    this._saveHistory();
    if (this.drawMode === 'draw3') {
      // Draw up to 3 cards; flip fewer when stock has less than 3 remaining
      const count = Math.min(3, this.stock.length);
      for (let i = 0; i < count; i++) {
        const card = this.stock.pop();
        card.faceUp = true;
        this.waste.push(card);
      }
    } else {
      const card = this.stock.pop();
      card.faceUp = true;
      this.waste.push(card);
    }
    this._notify('draw');
    return true;
  }

  // Move top waste card to tableau or foundation
  playWasteCard(targetType, targetIndex) {
    if (this.waste.length === 0) return false;
    const card = this.waste[this.waste.length - 1];

    if (targetType === 'foundation') {
      const found = this.foundation[targetIndex];
      if (!canPlaceOnFoundation(card, found)) return false;
      this._saveHistory();
      this.waste.pop();
      found.push(card);
      this._addScore(10);
      this.moves++;
      this._notify('move');
      this._checkWin();
      return true;
    }

    if (targetType === 'tableau') {
      const pile = this.tableau[targetIndex];
      if (!canPlaceOnTableau(card, pile)) return false;
      this._saveHistory();
      this.waste.pop();
      pile.push(card);
      this.moves++;
      this._notify('move');
      return true;
    }
    return false;
  }

  // Move a stack of cards from one tableau pile to another
  moveTableauStack(fromCol, cardIndex, toCol) {
    const fromPile = this.tableau[fromCol];
    const toPile = this.tableau[toCol];
    const stack = fromPile.slice(cardIndex);
    if (stack.length === 0 || !stack[0].faceUp) return false;
    if (!canPlaceOnTableau(stack[0], toPile)) return false;

    this._saveHistory();
    this.startTimer();
    fromPile.splice(cardIndex);
    toPile.push(...stack);

    // Auto-flip revealed card
    if (fromPile.length > 0 && !fromPile[fromPile.length - 1].faceUp) {
      const revealed = fromPile[fromPile.length - 1];
      revealed.faceUp   = true;
      revealed._reveal  = true;   // ui.js picks this up to play the flip animation
      this._addScore(5);
    }

    this.moves++;
    this._notify('move');
    return true;
  }

  // Move top card of tableau pile to foundation
  moveTableauToFoundation(fromCol, foundationIndex) {
    const pile = this.tableau[fromCol];
    if (pile.length === 0) return false;
    const card = pile[pile.length - 1];
    if (!card.faceUp) return false;
    const found = this.foundation[foundationIndex];
    if (!canPlaceOnFoundation(card, found)) return false;

    this._saveHistory();
    this.startTimer();
    pile.pop();
    found.push(card);
    this._addScore(10);

    if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
      const revealed = pile[pile.length - 1];
      revealed.faceUp  = true;
      revealed._reveal = true;    // ui.js picks this up to play the flip animation
      this._addScore(5);
    }

    this.moves++;
    this._notify('move');
    this._checkWin();
    return true;
  }

  // Try to auto-move a card to any valid foundation
  autoMoveToFoundation(card, sourceType, sourceIndex) {
    for (let i = 0; i < 4; i++) {
      if (canPlaceOnFoundation(card, this.foundation[i])) {
        if (sourceType === 'waste') {
          return this.playWasteCard('foundation', i);
        }
        if (sourceType === 'tableau') {
          return this.moveTableauToFoundation(sourceIndex, i);
        }
      }
    }
    return false;
  }

  // Auto-complete: move all remaining cards to foundations
  autoComplete() {
    let moved = true;
    while (moved) {
      moved = false;
      for (let col = 0; col < 7; col++) {
        const pile = this.tableau[col];
        if (pile.length === 0) continue;
        const card = pile[pile.length - 1];
        if (!card.faceUp) continue;
        if (this.autoMoveToFoundation(card, 'tableau', col)) {
          moved = true;
        }
      }
      if (!moved && this.waste.length > 0) {
        const card = this.waste[this.waste.length - 1];
        if (this.autoMoveToFoundation(card, 'waste', 0)) {
          moved = true;
        }
      }
    }
  }

  canAutoComplete() {
    // All tableau cards must be face-up and stock/waste empty or face-up
    for (const pile of this.tableau) {
      for (const card of pile) {
        if (!card.faceUp) return false;
      }
    }
    return true;
  }

  _checkWin() {
    const won = this.foundation.every(f => f.length === 13);
    if (won) {
      this.stopTimer();
      this._notify('win');
    }
  }

  isWon() {
    return this.foundation.every(f => f.length === 13);
  }

  getState() {
    return {
      tableau: this.tableau,
      foundation: this.foundation,
      stock: this.stock,
      waste: this.waste,
      score: this.score,
      moves: this.moves,
      elapsed: this.elapsed,
      drawMode: this.drawMode,
    };
  }
}

// Export for ES module or global
if (typeof module !== 'undefined') {
  module.exports = { SolitaireGame, canPlaceOnFoundation, canPlaceOnTableau };
} else {
  window.SolitaireGame = SolitaireGame;
  window.canPlaceOnFoundation = canPlaceOnFoundation;
  window.canPlaceOnTableau = canPlaceOnTableau;
}
