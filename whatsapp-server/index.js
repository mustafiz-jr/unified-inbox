const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const axios = require('axios');
const P = require('pino');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const PORT = 5001;
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://127.0.0.1:8000';
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || 'super-secret-key-change-me';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected';
let currentUser = null;
let channelAccountId = null;
let isStarting = false;

const logger = P({ level: 'silent' });

// ======================================================
// WhatsApp Connection
// ======================================================
async function startWhatsApp() {
    if (isStarting) return;
    isStarting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: state,
            browser: ['Unified Inbox', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                currentQR = await QRCode.toDataURL(qr);
                connectionStatus = 'connecting';
                io.emit('qr', { qr: currentQR });
                io.emit('status', { status: 'connecting' });
                console.log('📱 QR generated, waiting for scan...');
            }

            if (connection === 'open') {
                connectionStatus = 'connected';
                currentQR = null;
                const me = sock.user;
                const number = me.id.split(':')[0].split('@')[0];
                currentUser = {
                    id: me.id,
                    name: me.name || me.verifiedName || number,
                    number: number,
                };
                io.emit('status', { status: 'connected' });
                io.emit('user', currentUser);
                console.log('✅ WhatsApp connected:', number);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                connectionStatus = 'disconnected';
                currentUser = null;
                currentQR = null;
                io.emit('status', { status: 'disconnected' });
                isStarting = false;

                if (code === DisconnectReason.loggedOut) {
                    console.log('🚪 Logged out — clearing session folder');
                    try {
                        fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
                    } catch (e) { console.error(e); }
                    sock = null;
                    setTimeout(() => startWhatsApp(), 2000);
                } else {
                    console.log('🔄 Reconnecting... code:', code);
                    setTimeout(() => startWhatsApp(), 3000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                try {
                    if (!msg.message) continue;
                    const fromMe = msg.key.fromMe;
                    const jid = msg.key.remoteJid;

                    if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

                    const m = msg.message;
                    let body = null;
                    let msgType = 'text';

                    if (m.conversation) body = m.conversation;
                    else if (m.extendedTextMessage?.text) body = m.extendedTextMessage.text;
                    else if (m.imageMessage) { body = m.imageMessage.caption || null; msgType = 'image'; }
                    else if (m.videoMessage) { body = m.videoMessage.caption || null; msgType = 'video'; }
                    else if (m.audioMessage) { msgType = 'audio'; }
                    else if (m.documentMessage) { body = m.documentMessage.fileName || null; msgType = 'document'; }
                    else if (m.stickerMessage) { msgType = 'sticker'; }
                    else { msgType = 'other'; }

                    const payload = {
                        channel_account_id: channelAccountId,
                        contact_external_id: jid,
                        contact_display_name: msg.pushName || null,
                        external_message_id: msg.key.id,
                        type: msgType,
                        body: body,
                        from_me: fromMe,
                        timestamp: msg.messageTimestamp,
                        metadata: { raw_jid: jid },
                    };

                    io.emit('new-message', payload);

                    if (channelAccountId) {
                        await axios.post(
                            `${LARAVEL_URL}/api/webhooks/whatsapp`,
                            payload,
                            { headers: { 'X-Webhook-Secret': WEBHOOK_SECRET } }
                        ).catch(err => console.error('Webhook error:', err.message));
                    }
                } catch (err) {
                    console.error('Message handling error:', err);
                }
            }
        });

        isStarting = false;
    } catch (err) {
        isStarting = false;
        console.error('❌ startWhatsApp error:', err);
    }
}

// ======================================================
// Socket.io
// ======================================================
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.emit('status', { status: connectionStatus });
    if (currentQR) socket.emit('qr', { qr: currentQR });
    if (currentUser) socket.emit('user', currentUser);

    socket.on('set-channel-account', (id) => {
        channelAccountId = id;
        console.log('📌 channel_account_id set to:', id);
    });

    socket.on('start-qr', async () => {
        if (connectionStatus === 'connected') {
            socket.emit('status', { status: 'connected' });
            socket.emit('user', currentUser);
            return;
        }
        if (!sock) {
            await startWhatsApp();
        }
        if (currentQR) socket.emit('qr', { qr: currentQR });
    });

    socket.on('logout', async () => {
        try {
            if (sock) await sock.logout();
        } catch (e) { }
        connectionStatus = 'disconnected';
        currentUser = null;
        currentQR = null;
        channelAccountId = null;
        io.emit('status', { status: 'disconnected' });
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ======================================================
// ======================================================
app.post('/send-message', async (req, res) => {
    const { to, body } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    try {
        const result = await sock.sendMessage(to, { text: body });
        return res.json({
            external_message_id: result?.key?.id || null,
            status: 'sent',
        });
    } catch (err) {
        console.error('Send error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/logout', async (req, res) => {
    try {
        if (sock) await sock.logout();
    } catch (e) { }
    connectionStatus = 'disconnected';
    currentUser = null;
    currentQR = null;
    channelAccountId = null;
    io.emit('status', { status: 'disconnected' });
    return res.json({ success: true });
});

app.get('/health', (req, res) => res.json({
    status: connectionStatus,
    user: currentUser,
    hasQR: !!currentQR,
}));

// ======================================================
// Boot
// ======================================================
server.listen(PORT, () => {
    console.log(`🚀 WhatsApp Node Gateway running on port ${PORT}`);
    startWhatsApp();
});