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
  localNames: [],    // namen voor hotseat
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

  localHands: [],
  localNames: [],
  localTurnIndex: 0,
  localHandRevealed: false,
  localDir: 1,    // 1 = vooruit, -1 = achteruit in hotseat
};


function applyLocalCardEffect(card) {
  const totalPlayers = state.localHands.length;
  if (totalPlayers === 0) return;

  const step = state.localDir || 1;

  // +2 (Draw Two)
  if (card.type === "draw2") {
    const victim =
      (state.localTurnIndex + step + totalPlayers) % totalPlayers;

    state.localHands[victim].push(drawCard(), drawCard());

    // zet beurtindex op de gestrafte; endLocalTurn() gaat daarna door
    state.localTurnIndex = victim;
    return;
  }

  // Skip
  if (card.type === "skip") {
    const skipped =
      (state.localTurnIndex + step + totalPlayers) % totalPlayers;
    state.localTurnIndex = skipped;
    return;
  }

  // Reverse
  if (card.type === "reverse") {
    if (totalPlayers === 2) {
      // bij 2 spelers werkt reverse als skip
      const skipped =
        (state.localTurnIndex + step + totalPlayers) % totalPlayers;
      state.localTurnIndex = skipped;
    } else {
      state.localDir = -(state.localDir || 1);
    }
    return;
  }

  // Wilds laten we in hotseat nu alleen kleur veranderen;
  // wild4-draw kun je later ook op localDir baseren als je dat wilt.
}

function applyAiCardEffect(card) {
  const totalPlayers = 1 + state.opponents.length;
  const step = state.turnDir; // +1 or -1

  // +2 (Draw Two)
  if (card.type === "draw2") {
    const victim = (state.turnIndex + step + totalPlayers) % totalPlayers;

    if (victim === 0) {
      state.player.push(drawCard(), drawCard());
    } else {
      state.opponents[victim - 1].push(drawCard(), drawCard());
    }

    state.turnIndex = victim; // nextTurn() springt eroverheen
    return;
  }

  // Skip
  if (card.type === "skip") {
    const skipped = (state.turnIndex + step + totalPlayers) % totalPlayers;
    state.turnIndex = skipped; // nextTurn() springt eroverheen
    return;
  }

  // Reverse
  if (card.type === "reverse") {
    if (totalPlayers === 2) {
      // bij 2 spelers werkt reverse als skip
      const skipped = (state.turnIndex + step + totalPlayers) % totalPlayers;
      state.turnIndex = skipped;
    } else {
      state.turnDir *= -1;
    }
    return;
  }

  // Wilds / wild4 worden elders afgehandeld
}

function applyCardEffect(card) {
  if (gameConfig.mode === "local") {
    applyLocalCardEffect(card);
  } else {
    applyAiCardEffect(card);
  }
}


function endLocalTurn() {
  // alleen relevant in local hotseat
  if (gameConfig.mode !== "local") return;

  state.localHandRevealed = false;

  const total = state.localHands.length;
  if (total === 0) {
    render();
    return;
  }

  const step = state.localDir || 1;

  // volgende speler in huidige richting
  state.localTurnIndex =
    (state.localTurnIndex + step + total) % total;

  const nextName =
    state.localNames[state.localTurnIndex] ||
    `Player ${state.localTurnIndex + 1}`;

  setMessage(`${nextName}, het is jouw beurt.`);
  render();
}


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



function startGame() {
  state.deck = makeDeck();
  state.discard = null;
  state.gameOver = false;

  if (gameConfig.mode === "local") {
    // 🔹 LOCAL HOTSEAT
    const names =
      gameConfig.localNames && gameConfig.localNames.length
        ? gameConfig.localNames
        : ["Player 1", "Player 2"];

    state.localNames = names;
    state.localHands = names.map(() => []);
    state.localTurnIndex = 0;
    state.localHandRevealed = false;
    state.localDir = 1;

    // kaarten delen
    for (let i = 0; i < 7; i++) {
      state.localHands.forEach((hand) => hand.push(drawCard()));
    }

    // eerste discard
    state.discard = drawCard();

    setMessage(`${names[0]}, het is jouw beurt.`);
    render();
    return;
  }

  // 🔹 VS AI (bestaande gedrag)
  state.player = [];
  state.opponents = [];
  state.turnIndex = 0;
  state.turnDir = 1;
  state.aiThinking = false;

  const aiCount = gameConfig?.mode === "ai" ? (gameConfig.aiCount || 1) : 1;
  for (let i = 0; i < aiCount; i++) state.opponents.push([]);

  // deal
  for (let i = 0; i < 7; i++) {
    state.player.push(drawCard());
    state.opponents.forEach((hand) => hand.push(drawCard()));
  }

  // eerste discard
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

      // +4 effect: volgende speler in huidige richting krijgt 4 kaarten
      if (card.type === "wild4") {
        const total = 1 + state.opponents.length;
        const step = state.turnDir; // 1 of -1
        const victim = (state.turnIndex + step + total) % total;

        if (victim === 0) {
          state.player.push(
            drawCard(),
            drawCard(),
            drawCard(),
            drawCard()
          );
        } else {
          state.opponents[victim - 1].push(
            drawCard(),
            drawCard(),
            drawCard(),
            drawCard()
          );
        }

        // beurtindex op de 'gestrafte' speler; nextTurn() gaat daarna verder
        state.turnIndex = victim;
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

    if (gameConfig.mode === "local") {
      // 🔹 HOTSEAT: wild +4 straf in huidige richting
      if (state.discard.type === "wild4") {
        const total = state.localHands.length;
        const step = state.localDir || 1;
        const victim =
          (state.localTurnIndex + step + total) % total;

        state.localHands[victim].push(
          drawCard(),
          drawCard(),
          drawCard(),
          drawCard()
        );

        // beurtindex op gestrafte speler, endLocalTurn gaat daarna door
        state.localTurnIndex = victim;
      }

      // wild zonder +4: alleen kleur veranderen, dan naar volgende
      endLocalTurn();
      return;
    }

    // 🔹 VS AI: bestaande logica, maar richting-afhankelijk
    if (state.discard.type === "wild4") {
      const total = 1 + state.opponents.length;
      const step = state.turnDir;
      const victim =
        (state.turnIndex + step + total) % total;

      if (victim === 0) {
        state.player.push(
          drawCard(),
          drawCard(),
          drawCard(),
          drawCard()
        );
      } else {
        state.opponents[victim - 1].push(
          drawCard(),
          drawCard(),
          drawCard(),
          drawCard()
        );
      }

      state.turnIndex = victim;
    }

    // in VS AI gaat het spel gewoon door naar volgende beurt
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

function renderLocalHotseat() {
  const msgEl = document.getElementById("message");
  const deckCountEl = document.getElementById("deckCount");
  const discardEl = document.getElementById("discard");
  const oppWrap = document.getElementById("opponents");
  const playerHandEl = document.getElementById("playerHand");
  const drawBtn = document.getElementById("drawBtn");

  const currentIndex = state.localTurnIndex;
  const currentName =
    state.localNames[currentIndex] || `Player ${currentIndex + 1}`;
  const currentHand = state.localHands[currentIndex];

  deckCountEl.textContent = `Cards left: ${state.deck.length}`;

  // discard tonen
  discardEl.innerHTML = "";
  if (state.discard) {
    discardEl.classList.remove("slot");
    discardEl.appendChild(cardEl(state.discard));
  } else {
    discardEl.classList.add("slot");
    discardEl.textContent = "—";
  }

  // andere spelers volledig verbergen
// andere spelers: lijst met aantallen tonen
oppWrap.innerHTML = "";

const panel = document.createElement("div");
panel.className = "hand-area";

const titleEl = document.createElement("h2");
titleEl.textContent = "Spelers";
panel.appendChild(titleEl);

const listEl = document.createElement("div");
listEl.className = "player-list";

state.localHands.forEach((hand, i) => {
  const row = document.createElement("div");
  row.className = "player-list-item";
  if (i === currentIndex) {
    row.classList.add("active-player");
  }

  const nameSpan = document.createElement("span");
  nameSpan.textContent =
    state.localNames[i] || `Player ${i + 1}`;

  const countSpan = document.createElement("span");
  countSpan.textContent = `${hand.length} kaarten`;

  row.appendChild(nameSpan);
  row.appendChild(countSpan);
  listEl.appendChild(row);
});

panel.appendChild(listEl);
oppWrap.appendChild(panel);
  // speler-hand area leegmaken
  playerHandEl.innerHTML = "";

  if (state.gameOver) {
    drawBtn.disabled = true;
    msgEl.textContent = state.message;
    return;
  }




document.getElementById("drawBtn").addEventListener("click", onDrawClicked);
document.getElementById("drawBtn").addEventListener("click", () => {
  if (gameConfig.mode === "local") {
    hotseatOnDrawClicked();
  } else {
    onDrawClicked();
  }
});

  function hotseatOnDrawClicked() {
  if (state.gameOver) return;
  if (!state.localHandRevealed) return;

  const currentIndex = state.localTurnIndex;
  const hand = state.localHands[currentIndex];

  hand.push(drawCard());
  setMessage("Je hebt een kaart gepakt.");

  // in deze simpele variant eindigt je beurt na 1 kaart pakken
  endLocalTurn();
}


function hotseatOnCardClicked(index) {
  if (state.gameOver) return;
  if (!state.localHandRevealed) return;

  const currentIndex = state.localTurnIndex;
  const hand = state.localHands[currentIndex];
  const card = hand[index];

  if (!canPlay(card, state.discard)) {
    setMessage("Die kaart past nu nog niet.");
    render();
    return;
  }

  // kaart spelen
  hand.splice(index, 1);
  state.discard = card;
  animateCardToDiscard(card);

  // gewonnen?
  if (hand.length === 0) {
    const name =
      state.localNames[currentIndex] || `Player ${currentIndex + 1}`;
    state.gameOver = true;
    setMessage(`${name} heeft gewonnen!`);
    render();
    return;
  }

  // 🔹 Wild / +4 → eerst kleur kiezen via modal
  if (card.type === "wild" || card.type === "wild4") {
    chooseColorModal.classList.remove("hidden");
    return;
  }

  // 🔹 andere specials (+2 / Skip / Reverse)
  applyCardEffect(card);

  // beurt doorgeven aan volgende speler
  endLocalTurn();
}


  // ✳️ Hand NOG NIET onthuld → alleen grote knop tonen
  if (!state.localHandRevealed) {
    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = `${currentName}, klik hier om je kaarten te zien`;
    btn.addEventListener("click", () => {
      if (state.gameOver) return;
      state.localHandRevealed = true;
      setMessage(`${currentName}, je bent aan de beurt.`);
      render();
    });
    playerHandEl.appendChild(btn);

    drawBtn.disabled = true;
    msgEl.textContent = `${currentName}, het is jouw beurt.`;
    return;
  }

  // ✳️ Hand WEL onthuld → kaarten tonen
  currentHand.forEach((c, i) => {
    playerHandEl.appendChild(
      cardEl(c, {
        clickable: !state.gameOver,
        onClick: () => hotseatOnCardClicked(i),
      })
    );
  });

  // in hotseat mag je nu 1 kaart spelen of 1 kaart pakken
  drawBtn.disabled = state.gameOver;
  msgEl.textContent = state.message || `${currentName}, kies een kaart of pak een kaart.`;
}


function render() {
    if (gameConfig.mode === "local") {
    renderLocalHotseat();
    return;
  }

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

function updateLocalNameFields() {
  const count = Number(localCountSelect.value) || 2;
  localNamesContainer.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "name-row";

    const label = document.createElement("label");
    label.textContent = `Player ${i + 1} name`;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "name-input";
    input.placeholder = `Player ${i + 1}`;
    input.value = `Player ${i + 1}`;

    row.appendChild(label);
    row.appendChild(input);
    localNamesContainer.appendChild(row);
  }
}
// boot
const startModal = document.getElementById("startModal");
const aiOptions = document.getElementById("aiOptions");
const localOptions = document.getElementById("localOptions");
const localCountSelect = document.getElementById("localCount");
const localNamesContainer = document.getElementById("localNames");

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;

    if (mode === "ai") {
      aiOptions.style.display = "flex";
      localOptions.style.display = "none";
    } else {
      aiOptions.style.display = "none";
      localOptions.style.display = "block";
      updateLocalNameFields();
    }
  });
});

localCountSelect.addEventListener("change", () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode === "local") {
    updateLocalNameFields();
  }
});
document.getElementById("startBtn").addEventListener("click", () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  gameConfig.mode = mode;

  if (mode === "ai") {
    const aiCount = Number(document.getElementById("aiCount").value);
    gameConfig.aiCount = aiCount;
    gameConfig.localNames = [];
  } else {
    const count = Number(localCountSelect.value) || 2;
    const inputs = localNamesContainer.querySelectorAll("input.name-input");
    const names = [];

    inputs.forEach((input, i) => {
      const val = input.value.trim();
      names.push(val || `Player ${i + 1}`);
    });

    gameConfig.localNames = names;
    // voor nu laten we aiCount gewoon op 1; hotseat-logica komt in de volgende stap
  }

  startModal.classList.add("hidden");
  startGame();
});


// On load: show modal, don't start game yet
setMessage("Choose settings to begin.");
