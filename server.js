// --- Taş seti oluşturma ---
function createTiles() {
  const tiles = [];
  const colors = ["kırmızı", "sarı", "mavi", "siyah"];
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

function distributeTiles(tiles) {
  const players = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const count = i === 0 ? 15 : 14; // ilk oyuncuya 15 taş
    players[i] = tiles.splice(0, count);
  }
  return players;
}

// --- Socket.io eventleri ---
io.on("connection", (socket) => {
  console.log("Oyuncu bağlandı:", socket.id);

  socket.on("join_room", (roomId, playerName) => {
    socket.join(roomId);
    io.to(roomId).emit("player_joined", { id: socket.id, name: playerName });
  });

  socket.on("start_game", (roomId) => {
    const tiles = createTiles();
    shuffle(tiles);
    const players = distributeTiles(tiles);
    io.to(roomId).emit("game_started", players);
  });

  socket.on("play_tile", (roomId, tile) => {
    io.to(roomId).emit("tile_played", { player: socket.id, tile });
  });

  socket.on("draw_tile", (roomId) => {
    const tile = tiles.pop();
    socket.emit("tile_drawn", tile);
  });

  socket.on("end_game", (roomId, winnerId) => {
    io.to(roomId).emit("game_ended", { winner: winnerId });
  });
});
