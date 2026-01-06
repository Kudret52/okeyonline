const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// CORS ayarı: sadece senin domainine izin ver
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

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);
  socket.emit("oyun_mesaji", "Okey oyununa hoş geldin!");

  socket.on("disconnect", () => {
    console.log("Oyuncu ayrıldı:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
