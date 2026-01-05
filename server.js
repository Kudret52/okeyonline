const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Socket.io ayarı
const io = new Server(server, {
  cors: {
    origin: "*", // frontend domainini buraya yazabilirsin (örn: https://cadinindiyari.com)
    methods: ["GET", "POST"]
  }
});

// Oyuncu bağlantısı
io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  // Örnek: oyuncuya hoş geldin mesajı gönder
  socket.emit("oyun_mesaji", "Okey oyununa hoş geldin!");

  // Oyuncu ayrıldığında
  socket.on("disconnect", () => {
    console.log("Oyuncu ayrıldı:", socket.id);
  });
});

// Railway/Render port ayarı
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});