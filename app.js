// Mini UNO (very small ruleset):
// - Cards: 0-9 in 4 colors
// - You can play if color OR number matches top discard
// - Otherwise draw 1 (no stacking, no action cards yet)
// - Simple opponent: plays first valid card else draws
// - First to empty hand wins

const AI_THINK_MS = 1500; // base think time
const AI_THINK_JITTER_MS = 500; // random extra delay

const gameConfig = {
  mode: "ai",        // "ai" | "local"
  aiCount: 1,        // 1–3
};

const COLOR_MAP = {
  red: "#e53935",
  yellow: "#f9a825", // darker, more readable yellow
  green: "#43a047",
  blue: "#1e88e5",
};

const COLORS = ["red", "yellow", "green", "blue"];
const NUMBERS = [...Array(10)].map((_, i) => i);

const state = {
  deck: [],
  discard: null,
  player: [],
  opponents: [],
  turnIndex: 0,   // 0 = player, 1..N = AIs
  turnDir: 1,     // 1 = clockwise, -1 = counterclockwise
  aiThinking: false,
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

  // Number cards (0-9 twice except 0 once)
  for (const c of COLORS) {
    deck.push({ type: "number", color: c, value: 0 });
    for (let i = 1; i <= 9; i++) {
      deck.push({ type: "number", color: c, value: i });
      deck.push({ type: "number", color: c, value: i });
    }
  }

  // Action cards: Skip (2 per color), Draw2 (2 per color), Reverse (ignored for now)
  for (const c of COLORS) {
    deck.push({ type: "skip", color: c });
    deck.push({ type: "skip", color: c });
    deck.push({ type: "draw2", color: c });
    deck.push({ type: "draw2", color: c });
    deck.push({ type: "reverse", color: c });
    deck.push({ type: "reverse", color: c });
  }

  // Wilds (4), Wild Draw 4 (4)
  for (let i = 0; i < 4; i++) {
    deck.push({ type: "wild" });
    deck.push({ type: "wild4" });
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

  // wilds always playable
  if (card.type === "wild" || card.type === "wild4") return true;

  // matching color
  if (card.color && top.color && card.color === top.color) return true;

  // matching number
  if (card.type === "number" && top.type === "number" && card.value === top.value) {
    return true;
  }

  // matching action type (Skip on Skip, +2 on +2, Reverse on Reverse), color doesn't matter
  if (card.type === top.type && card.type !== "number") {
    return true;
  }

  return false;
}


function applyCardEffect(card) {
  const totalPlayers = 1 + state.opponents.length;
  const step = state.turnDir; // 1 or -1

  // +2
  if (card.type === "draw2") {
    const next = (state.turnIndex + step + totalPlayers) % totalPlayers;

    if (next === 0) {
      state.player.push(drawCard(), drawCard());
    } else {
      state.opponents[next - 1].push(drawCard(), drawCard());
    }

    // set turnIndex on the punished player; nextTurn() will move past them
    state.turnIndex = next;
    return;
  }

  // Skip (skip the next player in the current direction)
  if (card.type === "skip") {
    const skipped = (state.turnIndex + step + totalPlayers) % totalPlayers;
    // put turnIndex on the skipped player; nextTurn() will go past them
    state.turnIndex = skipped;
    return;
  }

  // Reverse: just flip direction
  if (card.type === "reverse") {
    state.turnDir *= -1;
    // very simple UNO: just change direction, no extra skip logic
    return;
  }

  // Wilds are handled elsewhere (color choosing / +4 in modal & AI)
}

function startGame() {
  state.deck = makeDeck();
  state.player = [];
  state.opponents = [];
  state.discard = null;
  state.turnIndex = 0;
  state.turnDir = 1;     // reset direction each game
  state.gameOver = false;

  // create AI hands based on config (default 1 if missing)
  const aiCount = gameConfig?.mode === "ai" ? (gameConfig.aiCount || 1) : 1;

  for (let i = 0; i < aiCount; i++) state.opponents.push([]);

  // deal
  for (let i = 0; i < 7; i++) {
    state.player.push(drawCard());
    state.opponents.forEach((hand) => hand.push(drawCard()));
  }

  // first discard
  state.discard = drawCard();

  setMessage("Your turn. Play a matching card or draw.");
  render();
}


function endGame(winner) {
  state.gameOver = true;
  setMessage(`${winner} wins! Refresh to play again`);
  render();
}

function checkWin() {
  if (state.player.length === 0) endGame("You");
  state.opponents.forEach((hand, i) => {
    if (hand.length === 0) endGame(`AI ${i + 1}`);
  });
}

function playCardFromHand(hand, index) {
  const card = hand[index];
  if (!canPlay(card, state.discard)) return false;

  hand.splice(index, 1);
  state.discard = card;
  return true;
}

function nextTurn() {
  if (state.gameOver) return;

  const total = 1 + state.opponents.length;
  // move in current direction (wrap around both ways)
  state.turnIndex =
    (state.turnIndex + state.turnDir + total) % total;

  if (state.turnIndex === 0) {
    state.aiThinking = false;
    setMessage("Your turn.");
    render();
  } else {
    const aiIndex = state.turnIndex - 1;

    state.aiThinking = true;
    setMessage(`AI ${aiIndex + 1} is thinking...`);
    render();

    const delay =
      AI_THINK_MS + Math.floor(Math.random() * AI_THINK_JITTER_MS);

    window.setTimeout(() => aiTakeTurn(aiIndex), delay);
  }
}
function aiTakeTurn(aiIndex) {
  if (state.gameOver) return;

  const hand = state.opponents[aiIndex];
  const idx = hand.findIndex((c) => canPlay(c, state.discard));
  let card = null;

  if (idx >= 0) {
    card = hand[idx];
    playCardFromHand(hand, idx);
    animateCardToDiscard(card);

    // Als AI een wild of +4 speelt: kies een kleur die het meest in de hand zit
    if (card.type === "wild" || card.type === "wild4") {
      const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
      hand.forEach((c) => {
        if (c.color) counts[c.color]++;
      });
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      card.color = best;
      state.discard.color = best;

      // +4 effect: volgende speler 4 kaarten
      if (card.type === "wild4") {
        const total = 1 + state.opponents.length;
        const next = (state.turnIndex + 1) % total;
        if (next === 0) {
          state.player.push(drawCard(), drawCard(), drawCard(), drawCard());
        } else {
          state.opponents[next - 1].push(
            drawCard(),
            drawCard(),
            drawCard(),
            drawCard()
          );
        }
        // zet turnIndex op die 'gestrafte' speler, nextTurn() gaat daarna naar de volgende
        state.turnIndex = next;
      }
    }

    setMessage(`AI ${aiIndex + 1} played a card.`);
  } else {
    hand.push(drawCard());
    setMessage(`AI ${aiIndex + 1} drew a card.`);
  }

  state.aiThinking = false;

  checkWin();
  if (state.gameOver) {
    render();
    return;
  }

  // +2 / Skip effecten voor niet-wilds
  if (card && card.type !== "wild" && card.type !== "wild4") {
    applyCardEffect(card);
  }

  render();

  if (!state.gameOver) {
    nextTurn();
  }
}

const chooseColorModal = document.getElementById("chooseColorModal");

document.querySelectorAll(".color-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const chosen = btn.getAttribute("data-color");
    state.discard.color = chosen;
    chooseColorModal.classList.add("hidden");

    // apply +4 draw
    if (state.discard.type === "wild4") {
      const total = 1 + state.opponents.length;
      const next = (state.turnIndex + 1) % total;
      if (next === 0) {
        state.player.push(
          drawCard(),
          drawCard(),
          drawCard(),
          drawCard()
        );
      } else {
        state.opponents[next - 1].push(
          drawCard(),
          drawCard(),
          drawCard(),
          drawCard()
        );
      }
      // zet turnIndex op 'gestrafte' speler, nextTurn() gaat daarna door
      state.turnIndex = next;
    }

    nextTurn();
  });
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function onDrawClicked() {
  if (state.gameOver) return;
  if (state.turnIndex !== 0 || state.aiThinking) return;

  state.player.push(drawCard());
  setMessage("You drew a card.");
  render();

  checkWin();
  if (!state.gameOver) nextTurn();
}

function onPlayerCardClicked(index) {
  if (state.gameOver) return;
  if (state.turnIndex !== 0 || state.aiThinking) return;

  const card = state.player[index];
  const ok = playCardFromHand(state.player, index);
  if (!ok) {
    setMessage("Can't play that card — must match color or number.");
    render();
    return;
  }

  // ✨ animatie
  animateCardToDiscard(card);

  setMessage("You played a card.");
  render();
  checkWin();
  if (state.gameOver) return;

  if (card.type === "wild" || card.type === "wild4") {
    // kleur kiezen via modal
    chooseColorModal.classList.remove("hidden");
    return;
  }

  applyCardEffect(card);
  render();
  checkWin();
  if (state.gameOver) return;

  nextTurn();
}



function cardEl(card, { faceDown = false, clickable = false, onClick } = {}) {
  const el = document.createElement("div");
  el.className = "card";

  // face-down card (opponents)
  if (faceDown) {
    el.classList.add("back");
    el.textContent = "UNO";
    return el;
  }

  if (!card) return el; // safety, shouldn't really happen

  // ----- background color -----
  let bg;

  if (card.type === "wild" || card.type === "wild4") {
    // if a color was chosen already, tint by that; else neutral dark
    bg = card.color ? COLOR_MAP[card.color] : "#222";
  } else if (card.color && COLOR_MAP[card.color]) {
    bg = COLOR_MAP[card.color];
  } else {
    bg = "#444"; // fallback
  }

  el.style.background = bg;
  el.style.color = "#fff";

  // ----- label / text -----
  let label = "";

switch (card.type) {
  case "number":
    label = String(card.value);
    break;
  case "draw2":
    label = "+2";
    break;
  case "skip":
    label = "Skip";
    break;
  case "reverse":
    label = "↺"; // or "Rev"
    break;
  case "wild":
    label = "Wild";
    break;
  case "wild4":
    label = "Wild +4";
    break;
  default:
    label = "?";
}


  el.textContent = label;

  // ----- interactions -----
  if (clickable) {
    el.classList.add("clickable");
    el.addEventListener("click", onClick);
  }

  return el;
}

async function animateCardToDiscard(card) {
  const discardEl = document.getElementById("discard");
  if (!discardEl || !card) return;

  // maak een visuele kaart
  const fly = cardEl(card);
  fly.classList.add("card-fly");

  document.body.appendChild(fly);
  await sleep(1000);


  // startpositie (midden scherm is al gezet in CSS)
  // forceer reflow zodat de transition daarna werkt
  void fly.offsetWidth;

  // doelpositie = midden van discard-stapel
  const rect = discardEl.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;

  fly.style.left = `${targetX}px`;
  fly.style.top = `${targetY}px`;
  fly.style.transform = "translate(-50%, -50%) scale(0.4)";
  fly.style.opacity = "0";

  // opruimen na animatie
  fly.addEventListener(
    "transitionend",
    () => {
      fly.remove();
    },
    { once: true }
  );
}


function render() {
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

const oppWrap = document.getElementById("opponents");
oppWrap.innerHTML = "";

state.opponents.forEach((hand, i) => {
  const area = document.createElement("div");
  area.className = "hand-area";

  const isActive = state.turnIndex === i + 1; // 1..N are AIs
  if (isActive) area.classList.add("active-turn");

  const title = document.createElement("div");
  title.className = "opponent-title";

  const h2 = document.createElement("h2");
  h2.textContent = `AI ${i + 1}`;

  const badge = document.createElement("span");
  badge.className = "badge";

  if (isActive && state.aiThinking) {
    badge.classList.add("thinking");
    badge.textContent = "thinking…";
  } else {
    badge.textContent = `${hand.length} cards`;
  }

  title.appendChild(h2);
  title.appendChild(badge);

  const handEl = document.createElement("div");
  handEl.className = "hand";

  for (let k = 0; k < hand.length; k++) {
    handEl.appendChild(cardEl(null, { faceDown: true }));
  }

  area.appendChild(title);
  area.appendChild(handEl);
  oppWrap.appendChild(area);
});



  // player hand (face up, clickable on your turn)
  const player = document.getElementById("playerHand");
  player.innerHTML = "";
  state.player.forEach((c, i) => {
    player.appendChild(
      cardEl(c, {
        clickable: state.turnIndex === 0 && !state.gameOver && !state.aiThinking,
        onClick: () => onPlayerCardClicked(i),
      })
    );
  });

  // draw button
  const drawBtn = document.getElementById("drawBtn");
drawBtn.disabled = state.turnIndex !== 0 || state.gameOver || state.aiThinking;
}

document.getElementById("drawBtn").addEventListener("click", onDrawClicked);

// boot
const startModal = document.getElementById("startModal");
const aiOptions = document.getElementById("aiOptions");

// Hide AI options if Local is selected
document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    aiOptions.style.display = mode === "ai" ? "flex" : "none";
  });
});

document.getElementById("startBtn").addEventListener("click", () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const aiCount = Number(document.getElementById("aiCount").value);

  gameConfig.mode = mode;
  gameConfig.aiCount = aiCount;

  // one-time: hide modal and start
  startModal.classList.add("hidden");
  startGame();
});

// On load: show modal, don't start game yet
setMessage("Choose settings to begin.");
