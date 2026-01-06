const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// CORS: sadece senin domainin
app.use(cors({
  origin: "https://cadinindiyari.com",
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://cadinindiyari.com",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ---------------- OKEY OYUN MANTIĞI ----------------

const colors = ["kırmızı", "sarı", "mavi", "siyah"];

function createTiles() {
  const tiles = [];
  for (let c of colors) {
    for (let n = 1; n <= 13; n++) {
      tiles.push({ color: c, number: n });
      tiles.push({ color: c, number: n }); // çift set
    }
  }
  tiles.push({ color: "joker", number: 0 });
  tiles.push({ color: "joker", number: 0 });
  return tiles;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function distributeTiles(deck) {
  const hands = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const count = i === 0 ? 15 : 14; // ilk oyuncu 15 taş
    hands[i] = deck.splice(0, count);
  }
  return hands;
}

// Basit skor/hamle mantığı (gerçek okey kurallarına yakın ama üretim için sade)
function chooseBotMove(hand, discardTop) {
  // Önce eldeki çiftleri korumaya çalış: discardTop ile eşleşen varsa al
  // Basit strateji: çek → en yüksek numaralı taşı at
  const toPlay = hand.reduce((max, t) => (t.number > (max?.number || -1) ? t : max), null);
  return { action: "play", tile: toPlay };
}

// ---------------- ODA VE OYUN DURUMU ----------------

const rooms = new Map();
/*
roomState = {
  id: "masa1",
  players: [{id, name, isBot, socketId|null}],
  deck: [...],
  discard: [...],
  hands: [[],[],[],[]],
  turnIndex: 0, // 0..3
  started: false
}
*/

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      players: [],
      deck: [],
      discard: [],
      hands: [[], [], [], []],
      turnIndex: 0,
      started: false
    });
  }
  return rooms.get(roomId);
}

function addBotPlayersIfNeeded(room) {
  const needed = 4 - room.players.length;
  const botNames = ["Bot1", "Bot2", "Bot3"];
  for (let i = 0; i < needed; i++) {
    room.players.push({ id: `bot-${i}`, name: botNames[i], isBot: true, socketId: null });
  }
}

function startGame(room) {
  room.deck = createTiles();
  shuffle(room.deck);
  room.hands = distributeTiles(room.deck);
  room.discard = [];
  room.turnIndex = 0;
  room.started = true;
}

// Oyuncu indexini bul
function playerIndexBySocket(room, socketId) {
  return room.players.findIndex(p => p.socketId === socketId);
}

// Sıradaki oyuncu bot mu?
function isCurrentBot(room) {
  const p = room.players[room.turnIndex];
  return !!p?.isBot;
}

// Sırayı ilerlet
function nextTurn(room) {
  room.turnIndex = (room.turnIndex + 1) % 4;
}

// Bot hamlesi döngüsü
function runBotLoop(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.started) return;

  // Bot sırası değilse dur
  if (!isCurrentBot(room)) return;

  const idx = room.turnIndex;
  const hand = room.hands[idx];

  // Bot basitçe: desteden çek → en yüksek taşı at
  if (room.deck.length > 0) {
    const drawn = room.deck.pop();
    hand.push(drawn);
    io.to(roomId).emit("tile_drawn_public", { playerIndex: idx, tile: { color: "kapalı", number: -1 } });
  }

  const move = chooseBotMove(hand, room.discard[room.discard.length - 1]);
  if (move.action === "play" && move.tile) {
    // elden çıkar
    const pos = hand.findIndex(t => t.color === move.tile.color && t.number === move.tile.number);
    if (pos >= 0) {
      const played = hand.splice(pos, 1)[0];
      room.discard.push(played);
      io.to(roomId).emit("tile_played", { playerIndex: idx, tile: played });
    }
  }

  // Basit bitiş kontrolü (elde 0 taş kalırsa)
  if (hand.length === 0) {
    io.to(roomId).emit("game_ended", { winnerIndex: idx, winnerName: room.players[idx].name });
    room.started = false;
    return;
  }

  // Sırayı ilerlet ve bir sonraki bot ise tekrar çalıştır
  nextTurn(room);
  setTimeout(() => runBotLoop(roomId), 600); // akıcı olsun
}

// ---------------- SOCKET.IO OLAYLARI ----------------

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("join_room", (roomId, playerName) => {
    const room = ensureRoom(roomId);

    // Eğer bu socket zaten odadaysa tekrar ekleme
    const already = room.players.find(p => p.socketId === socket.id);
    if (!already) {
      room.players.push({ id: socket.id, name: playerName || "Oyuncu", isBot: false, socketId: socket.id });
    }

    socket.join(roomId);
    io.to(roomId).emit("player_joined", { id: socket.id, name: playerName });

    // Tek kişi ise botları ekle
    if (room.players.filter(p => !p.isBot).length === 1) {
      addBotPlayersIfNeeded(room);
      io.to(roomId).emit("bots_added", room.players.filter(p => p.isBot).map(b => b.name));
    }
  });

  socket.on("start_game", (roomId) => {
    const room = ensureRoom(roomId);
    if (room.started) return;

    // 4 oyuncu garantile
    addBotPlayersIfNeeded(room);
    startGame(room);

    // Oyunculara kendi ellerini gönder
    room.players.forEach((p, i) => {
      if (p.isBot) return;
      io.to(p.socketId).emit("game_started", {
        myIndex: i,
        myTiles: room.hands[i],
        players: room.players.map(pp => ({ name: pp.name, isBot: pp.isBot })),
        remainingTiles: room.deck.length
      });
    });

    // Ortak bilgi
    io.to(roomId).emit("game_info", {
      turnIndex: room.turnIndex,
      discardTop: room.discard[room.discard.length - 1] || null
    });

    // Eğer sıra bottaysa döngüyü başlat
    if (isCurrentBot(room)) {
      setTimeout(() => runBotLoop(roomId), 600);
    }
  });

  socket.on("draw_tile", (roomId) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;

    const idx = playerIndexBySocket(room, socket.id);
    if (idx !== room.turnIndex) return; // sıra sende değil

    if (room.deck.length === 0) return;
    const tile = room.deck.pop();
    room.hands[idx].push(tile);

    socket.emit("tile_drawn", tile);
    io.to(roomId).emit("tile_drawn_public", { playerIndex: idx, tile: { color: "kapalı", number: -1 } });
  });

  socket.on("play_tile", (roomId, tile) => {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;

    const idx = playerIndexBySocket(room, socket.id);
    if (idx !== room.turnIndex) return; // sıra sende değil

    const pos = room.hands[idx].findIndex(t => t.color === tile.color && t.number === tile.number);
    if (pos < 0) return;

    const played = room.hands[idx].splice(pos, 1)[0];
    room.discard.push(played);

    io.to(roomId).emit("tile_played", { playerIndex: idx, tile: played });

    // Basit bitiş kontrolü
    if (room.hands[idx].length === 0) {
      io.to(roomId).emit("game_ended", { winnerIndex: idx, winnerName: room.players[idx].name });
      room.started = false;
      return;
    }

    // Sırayı ilerlet ve bot döngüsünü tetikle
    nextTurn(room);
    io.to(roomId).emit("game_info", {
      turnIndex: room.turnIndex,
      discardTop: room.discard[room.discard.length - 1] || null
    });

    if (isCurrentBot(room)) {
      setTimeout(() => runBotLoop(roomId), 600);
    }
  });

  socket.on("end_game", (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.started = false;
    io.to(roomId).emit("game_ended", { winnerIndex: null, winnerName: null });
  });

  socket.on("disconnect", () => {
    console.log("Oyuncu ayrıldı:", socket.id);
    // İsteğe bağlı: odadan düşeni temizleme/yeniden dengeleme
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});i
