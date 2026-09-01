import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { Server } from "socket.io"; // ★追加: Socket.IOをインポート

const host = "127.0.0.1";
const port = 4173;
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/classic.html", ["classic.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/function-style.css", ["function-style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/function-app.js", ["function-app.js", "text/javascript; charset=utf-8"]],
  ["/function-game.js", ["function-game.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/logic.js", ["logic.js", "text/javascript; charset=utf-8"]],
]);

// 既存のHTTPサーバー作成処理
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to load application file");
  }
});

// ★追加: サーバーインスタンスにSocket.IOを紐付け
const io = new Server(server);

// ★追加: クライアントとのWebSocket接続時の処理
io.on("connection", (socket) => {
  console.log("ユーザーが接続しました:", socket.id);

  // クライアントから 'chat message' というイベントを受け取った時
  socket.on("chat message", (data) => {
    // 接続している全員（送信者含む）にメッセージをブロードキャストする
    io.emit("chat message", {
      sender: socket.id, // 一旦Socket IDを送信者名として使用します
      message: data.message,
      time: new Date().toLocaleTimeString("ja-JP"),
    });
  });

  socket.on("disconnect", () => {
    console.log("ユーザーが切断しました:", socket.id);
  });
});

server.listen(port, host, () => {
  console.log(`TRUTH OR WOLF: http://${host}:${port}`);
});