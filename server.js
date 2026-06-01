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

// Força bash interativo — resolve tela preta no Render
const SHELL = 'bash';
const SHELL_ARGS = ['--login', '-i'];

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.send('OK'));

wss.on('connection', (ws) => {
  console.log('[+] Nova conexão WebSocket');

  const term = pty.spawn(SHELL, SHELL_ARGS, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/root',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      SHELL: '/bin/bash',
      // Garante que o bash mostre o prompt
      PS1: '\\u@cloudterm:\\w\\$ ',
      FORCE_COLOR: '1',
    },
  });

  console.log(`[+] PTY criado — PID: ${term.pid}`);

  // Força o bash a exibir o prompt logo ao conectar
  setTimeout(() => {
    if (ws.readyState === ws.OPEN) {
      term.write('\n');
    }
  }, 300);

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
