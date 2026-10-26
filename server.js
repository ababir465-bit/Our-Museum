// Our Museum – realtime server (Express + Socket.io). Rooms live in memory, max 2 players each.
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const app = express(), srv = http.createServer(app);
const io = new Server(srv, { maxHttpBufferSize: 2e6, pingInterval: 8000, pingTimeout: 10000 });
app.use(express.static(__dirname + '/public'));

const rooms = {}; // CODE -> { players:{id:{id,name,style}}, photos:{idx:dataURL}, timer }
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms[c]); return c; };

io.on('connection', s => {
  let room = null;
  const enter = (c, d, cb) => {
    const r = rooms[c];
    if (!r) return cb({ ok: false, error: 'Room not found' });
    if (Object.keys(r.players).length >= 2) return cb({ ok: false, error: 'Room is full (2 players max)' });
    clearTimeout(r.timer);
    const me = { id: s.id, name: String(d.name || 'Guest').slice(0, 14), style: d.style === 'girl' ? 'girl' : 'boy' };
    const peers = Object.values(r.players);
    r.players[s.id] = me; room = c; s.join(c);
    s.to(c).emit('peer', me);
    cb({ ok: true, code: c, id: s.id, peers, photos: r.photos, slot: peers.length });
  };
  s.on('create', (d, cb) => { const c = newCode(); rooms[c] = { players: {}, photos: {} }; enter(c, d || {}, cb); });
  s.on('join', (d, cb) => enter(String((d && d.code) || '').toUpperCase().trim(), d || {}, cb));
  s.on('state', d => room && s.to(room).volatile.emit('state', d));
  s.on('chat', t => { const r = rooms[room]; if (r && r.players[s.id]) s.to(room).emit('chat', { name: r.players[s.id].name, text: String(t).slice(0, 140) }); });
  s.on('photo', d => {
    const r = rooms[room];
    if (!r || !d || !Number.isInteger(d.idx) || typeof d.data !== 'string' || d.data.length > 400000) return;
    r.photos[d.idx] = d.data; s.to(room).emit('photo', d);
  });
  s.on('disconnect', () => {
    const c = room, r = rooms[c]; if (!r) return;
    delete r.players[s.id]; io.to(c).emit('peerleft', s.id);
    if (!Object.keys(r.players).length) r.timer = setTimeout(() => delete rooms[c], 10 * 60 * 1000); // keep 10 min for reconnects
  });
});
const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log('Our Museum running on port ' + PORT));
