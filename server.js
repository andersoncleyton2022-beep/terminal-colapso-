const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'cmd.exe' : 'bash');

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.send('OK'));

wss.on('connection', (ws) => {
  console.log('[+] Nova conexão WebSocket');

  // Spawna um PTY real — igual ao Termux
  const term = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/tmp',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'pt_BR.UTF-8',
    },
  });

  console.log(`[+] PTY criado — PID: ${term.pid}`);

  // Terminal → Browser
  term.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  term.onExit(({ exitCode }) => {
    console.log(`[-] PTY encerrado — código: ${exitCode}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      ws.close();
    }
  });

  // Browser → Terminal
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'input') {
        term.write(msg.data);
      } else if (msg.type === 'resize') {
        term.resize(
          Math.max(2, Math.min(msg.cols, 300)),
          Math.max(2, Math.min(msg.rows, 200))
        );
      }
    } catch (e) {
      console.error('Mensagem inválida:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[-] WebSocket fechado — matando PTY');
    try { term.kill(); } catch (_) {}
  });

  ws.on('error', (err) => {
    console.error('WebSocket erro:', err.message);
    try { term.kill(); } catch (_) {}
  });
});

server.listen(PORT, () => {
  console.log(`⚡ Servidor rodando em http://localhost:${PORT}`);
});
