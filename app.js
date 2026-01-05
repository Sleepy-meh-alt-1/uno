// Mini UNO (very small ruleset):
// - Cards: 0-9 in 4 colors
// - You can play if color OR number matches top discard
// - Otherwise draw 1 (no stacking, no action cards yet)
// - Simple opponent: plays first valid card else draws
// - First to empty hand wins

const COLORS = ["red", "yellow", "green", "blue"];
const NUMBERS = [...Array(10)].map((_, i) => i);

const state = {
  deck: [],
  discard: null,
  player: [],
  opponent: [],
  turn: "player", // "player" | "opponent"
  message: "",
  gameOver: false,
};

function setMessage(text) {
  state.message = text;
  document.getElementById("message").textContent = text;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDeck() {
  const deck = [];
  for (const c of COLORS) {
    for (const n of NUMBERS) {
      deck.push({ color: c, value: n });
      // (optional) add duplicates for a slightly bigger deck
      if (n !== 0) deck.push({ color: c, value: n });
    }
  }
  return shuffle(deck);
}

function drawCard() {
  if (state.deck.length === 0) {
    // very simple reshuffle: keep top discard, reshuffle the rest
    // (we don't store discard pile history yet, so just remake deck)
    state.deck = makeDeck();
    setMessage("Deck was empty — reshuffled a new deck.");
  }
  return state.deck.pop();
}

function canPlay(card, top) {
  if (!top) return true;
  return card.color === top.color || card.value === top.value;
}

function startGame() {
  state.deck = makeDeck();
  state.player = [];
  state.opponent = [];
  state.discard = null;
  state.turn = "player";
  state.gameOver = false;

  for (let i = 0; i < 7; i++) {
    state.player.push(drawCard());
    state.opponent.push(drawCard());
  }

  // flip first discard (ensure it exists)
  state.discard = drawCard();
  setMessage("Your turn. Play a matching card or draw.");

  render();
}

function endGame(winner) {
  state.gameOver = true;
  setMessage(`${winner} wins! Refresh to play again (we'll add restart next).`);
  render();
}

function checkWin() {
  if (state.player.length === 0) endGame("You");
  if (state.opponent.length === 0) endGame("Opponent");
}

function playCardFromHand(hand, index) {
  const card = hand[index];
  if (!canPlay(card, state.discard)) return false;

  hand.splice(index, 1);
  state.discard = card;
  return true;
}

function opponentTurn() {
  if (state.gameOver) return;

  state.turn = "opponent";
  render();

  // tiny delay so it feels like a turn (no async timers needed; just immediate)
  const idx = state.opponent.findIndex((c) => canPlay(c, state.discard));
  if (idx >= 0) {
    playCardFromHand(state.opponent, idx);
    setMessage("Opponent played a card.");
  } else {
    state.opponent.push(drawCard());
    setMessage("Opponent drew a card.");
  }

  checkWin();
  state.turn = "player";
  setMessage(state.gameOver ? state.message : "Your turn.");
  render();
}

function onDrawClicked() {
  if (state.gameOver) return;
  if (state.turn !== "player") return;

  state.player.push(drawCard());
  setMessage("You drew a card. Opponent's turn.");
  render();

  checkWin();
  if (!state.gameOver) opponentTurn();
}

function onPlayerCardClicked(index) {
  if (state.gameOver) return;
  if (state.turn !== "player") return;

  const ok = playCardFromHand(state.player, index);
  if (!ok) {
    setMessage("Can't play that card — must match color or number.");
    render();
    return;
  }

  setMessage("You played a card. Opponent's turn.");
  render();

  checkWin();
  if (!state.gameOver) opponentTurn();
}

function cardEl(card, { faceDown = false, clickable = false, onClick } = {}) {
  const el = document.createElement("div");
  el.className = "card";

  if (faceDown) {
    el.classList.add("back");
    el.textContent = "UNO";
    return el;
  }

  // simple color styling
  el.style.background = card.color;
  el.textContent = String(card.value);

  if (clickable) {
    el.classList.add("clickable");
    el.addEventListener("click", onClick);
  }

  return el;
}

function render() {
  document.getElementById("turnLabel").textContent = `Turn: ${state.turn}`;
  document.getElementById("message").textContent = state.message;
  document.getElementById("deckCount").textContent = `Cards left: ${state.deck.length}`;

  // discard
  const discard = document.getElementById("discard");
  discard.innerHTML = "";
  if (state.discard) {
    discard.classList.remove("slot");
    discard.appendChild(cardEl(state.discard));
  } else {
    discard.classList.add("slot");
    discard.textContent = "—";
  }

  // opponent hand (face down)
  const opp = document.getElementById("opponentHand");
  opp.innerHTML = "";
  for (let i = 0; i < state.opponent.length; i++) {
    opp.appendChild(cardEl(null, { faceDown: true }));
  }

  // player hand (face up, clickable on your turn)
  const player = document.getElementById("playerHand");
  player.innerHTML = "";
  state.player.forEach((c, i) => {
    player.appendChild(
      cardEl(c, {
        clickable: state.turn === "player" && !state.gameOver,
        onClick: () => onPlayerCardClicked(i),
      })
    );
  });

  // draw button
  const drawBtn = document.getElementById("drawBtn");
  drawBtn.disabled = state.turn !== "player" || state.gameOver;
}

document.getElementById("drawBtn").addEventListener("click", onDrawClicked);

// boot
startGame();
