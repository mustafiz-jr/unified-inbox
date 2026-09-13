const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const axios = require('axios');
const P = require('pino');

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
} = require('@whiskeysockets/baileys');

const PORT = 5001;
const LARAVEL_URL = process.env.LARAVEL_URL || 'http://127.0.0.1:8000';
const WEBHOOK_SECRET =
    process.env.WHATSAPP_WEBHOOK_SECRET || 'super-secret-key-change-me';
const MEDIA_DIR = path.join(__dirname, 'media_cache');

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/media', express.static(MEDIA_DIR));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected';
let currentUser = null;
let channelAccountId = null;
let isStarting = false;

// ======================================================
// Buffers
// ======================================================
let historyBuffer = [];
let realtimeBuffer = [];
let historyFlushTimer = null;

// jid -> { name, notify, verifiedName, id }
const contactCache = new Map();
let contactsSyncTimer = null;
let contactsDirty = false;

const logger = P({ level: 'silent' });

// ======================================================
// JID helpers
// ======================================================
function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return null;
    return jid.replace(/:\d+(?=@)/, '').trim();
}

function getPhoneNumberFromJid(jid) {
    const normalized = normalizeJid(jid);
    if (!normalized) return null;
    const number = normalized.split('@')[0]?.replace(/\D/g, '');
    return number || null;
}

function isUsableContactName(name, phoneNumber = null) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (phoneNumber && (trimmed === phoneNumber || trimmed === `+${phoneNumber}`)) {
        return false;
    }
    return true;
}

// Priority: name > notify > verifiedName > fallback
function getBestContactName(contact, fallbackName = null) {
    if (!contact) {
        return isUsableContactName(fallbackName) ? fallbackName.trim() : null;
    }
    const phoneNumber = getPhoneNumberFromJid(contact.id);
    const candidates = [
        contact.name,
        contact.notify,
        contact.verifiedName,
        fallbackName,
    ];
    for (const candidate of candidates) {
        if (isUsableContactName(candidate, phoneNumber)) {
            return candidate.trim();
        }
    }
    return null;
}

function resolveWhatsAppContactName(jid, pushName = null) {
    const normalizedJid = normalizeJid(jid);
    if (!normalizedJid) {
        return isUsableContactName(pushName) ? pushName.trim() : null;
    }

    const cached = contactCache.get(normalizedJid);
    if (cached) {
        const cachedName = getBestContactName({ ...cached, id: normalizedJid });
        if (cachedName) return cachedName;
    }

    return isUsableContactName(pushName) ? pushName.trim() : null;
}

// ======================================================
// Contact ingestion (called from every contacts event)
// ======================================================
function ingestContacts(contacts) {
    if (!Array.isArray(contacts) || !contacts.length) return;

    for (const contact of contacts) {
        if (!contact?.id) continue;
        const jid = normalizeJid(contact.id);
        if (!jid) continue;

        const existing = contactCache.get(jid) || {};
        const merged = { ...existing, ...contact, id: jid };

        const bestName = getBestContactName(merged);
        contactCache.set(jid, {
            ...merged,
            name: bestName || existing.name || null,
        });
    }

    contactsDirty = true;
    scheduleContactsSync();
}

// ======================================================
// Sync contact names to Laravel (debounced)
// ======================================================
function scheduleContactsSync() {
    clearTimeout(contactsSyncTimer);
    contactsSyncTimer = setTimeout(flushContactsToLaravel, 2500);
}

async function flushContactsToLaravel() {
    if (!channelAccountId || !contactsDirty || contactCache.size === 0) return;

    contactsDirty = false;

    const updates = [];
    for (const [jid, c] of contactCache.entries()) {
        const name = getBestContactName({ ...c, id: jid });
        if (!name) continue;
        updates.push({
            external_id: jid,
            display_name: name,
            phone_number: getPhoneNumberFromJid(jid),
        });
    }

    if (!updates.length) return;

    const CHUNK = 200;
    for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        try {
            await axios.post(
                `${LARAVEL_URL}/api/webhooks/whatsapp/contact-names`,
                { channel_account_id: channelAccountId, contacts: chunk },
                {
                    headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
                    timeout: 30000,
                }
            );
        } catch (err) {
            console.error(
                '❌ Contact names sync error:',
                err.response?.data || err.message
            );
        }
    }

    console.log(`👥 Synced ${updates.length} WhatsApp contact names`);
    io.emit('contacts-synced', { count: updates.length });
}

// ======================================================
// Context / Reply parser
// ======================================================
function extractContextInfo(message) {
    if (!message) return null;
    const m = message;
    return (
        m.extendedTextMessage?.contextInfo ||
        m.imageMessage?.contextInfo ||
        m.videoMessage?.contextInfo ||
        m.audioMessage?.contextInfo ||
        m.documentMessage?.contextInfo ||
        m.stickerMessage?.contextInfo ||
        null
    );
}

// ======================================================
// Parse Baileys message
// ======================================================
async function parseBaileysMessage(msg) {
    if (!msg?.message) return null;
    const rawJid = msg.key?.remoteJid;
    if (!rawJid) return null;
    if (rawJid.endsWith('@g.us') || rawJid === 'status@broadcast') return null;

    const jid = normalizeJid(rawJid);
    if (!jid) return null;

    const m = msg.message;
    let body = null;
    let msgType = 'text';
    let mediaMeta = {};

    if (m.conversation) {
        body = m.conversation;
    } else if (m.extendedTextMessage?.text) {
        body = m.extendedTextMessage.text;
    } else if (m.imageMessage) {
        body = m.imageMessage.caption || null;
        msgType = 'image';
        mediaMeta = { mime: m.imageMessage.mimetype };
    } else if (m.videoMessage) {
        body = m.videoMessage.caption || null;
        msgType = 'video';
        mediaMeta = {
            mime: m.videoMessage.mimetype,
            duration: m.videoMessage.seconds,
        };
    } else if (m.audioMessage) {
        msgType = 'audio';
        mediaMeta = {
            mime: m.audioMessage.mimetype,
            duration: m.audioMessage.seconds,
            ptt: m.audioMessage.ptt,
        };
    } else if (m.documentMessage) {
        body = m.documentMessage.fileName || null;
        msgType = 'document';
        mediaMeta = {
            mime: m.documentMessage.mimetype,
            filename: m.documentMessage.fileName,
        };
    } else if (m.stickerMessage) {
        msgType = 'sticker';
        mediaMeta = { mime: m.stickerMessage.mimetype };
    } else if (m.reactionMessage) {
        // Reaction-only message — handled elsewhere; skip here
        return null;
    } else {
        msgType = 'other';
    }

    // ---- Reply context ----
    const ctx = extractContextInfo(m);
    let replyToExternalId = null;
    let replyToBody = null;
    let replyToFromMe = false;

    if (ctx?.stanzaId) {
        replyToExternalId = ctx.stanzaId;
        replyToFromMe = !!ctx.participant ? ctx.participant === sock?.user?.id : false;
        // Try to extract quoted body if available
        const q = ctx.quotedMessage;
        if (q) {
            replyToBody =
                q.conversation ||
                q.extendedTextMessage?.text ||
                q.imageMessage?.caption ||
                q.videoMessage?.caption ||
                q.documentMessage?.fileName ||
                null;
        }
    }

    // ---- Media download ----
    let mediaUrl = null;
    if (['image', 'video', 'audio', 'document', 'sticker'].includes(msgType)) {
        try {
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                { logger, reuploadRequest: sock?.updateMediaMessage }
            );
            if (buffer && buffer.length) {
                let ext = (mediaMeta.mime || '').split('/')[1]?.split(';')[0] || 'bin';
                // Handle special mime types
                if (msgType === 'audio' && mediaMeta.ptt) ext = 'ogg';
                if (ext === 'jpeg') ext = 'jpg';
                const fileName = `${msg.key.id}.${ext}`;
                fs.writeFileSync(path.join(MEDIA_DIR, fileName), buffer);
                mediaUrl = `http://localhost:${PORT}/media/${fileName}`;
                mediaMeta.size = buffer.length;
            }
        } catch (e) {
            console.error('⚠️ Media download failed:', e.message);
        }
    }

    const timestamp = msg.messageTimestamp
        ? Number(msg.messageTimestamp)
        : Math.floor(Date.now() / 1000);

    const contactDisplayName = resolveWhatsAppContactName(jid, msg.pushName || null);
    const phoneNumber = getPhoneNumberFromJid(jid);

    return {
        contact_external_id: jid,
        contact_display_name: contactDisplayName,
        external_message_id: msg.key.id,
        type: msgType,
        body,
        from_me: !!msg.key.fromMe,
        timestamp,
        reply_to_external_id: replyToExternalId,
        reply_to_body: replyToBody,
        reply_to_from_me: replyToFromMe,
        metadata: {
            raw_jid: rawJid,
            normalized_jid: jid,
            phone_number: phoneNumber,
            push_name: msg.pushName || null,
        },
        media_url: mediaUrl,
        media_mime: mediaMeta.mime || null,
        media_filename: mediaMeta.filename || null,
        media_duration: mediaMeta.duration || null,
        media_size: mediaMeta.size || null,
    };
}

// ======================================================
// Own profile name detection
// ======================================================
function extractOwnName(newName) {
    if (!newName || typeof newName !== 'string') return;
    if (!currentUser) return;

    const trimmed = newName.trim();
    if (!trimmed) return;
    if (currentUser.name === trimmed) return;
    if (trimmed === currentUser.number || trimmed === `+${currentUser.number}`) return;

    currentUser.name = trimmed;
    console.log('👤 Own name updated:', trimmed);
    io.emit('user', currentUser);

    if (channelAccountId) {
        axios.post(
            `${LARAVEL_URL}/api/webhooks/whatsapp/update-name`,
            { channel_account_id: channelAccountId, account_name: trimmed },
            { headers: { 'X-Webhook-Secret': WEBHOOK_SECRET } }
        ).catch(err => console.error('Name update webhook error:', err.message));
    }
}

function findSelfInContacts(contacts) {
    if (!Array.isArray(contacts) || !contacts.length || !sock?.user?.id) return;

    const myJid = normalizeJid(sock.user.id);
    const myNumber = getPhoneNumberFromJid(myJid);

    for (const c of contacts) {
        if (!c?.id) continue;
        const cJid = normalizeJid(c.id);
        const cNum = getPhoneNumberFromJid(cJid);

        if (cJid === myJid || cNum === myNumber) {
            extractOwnName(getBestContactName(c));
            break;
        }
    }
}

// ======================================================
// History buffer flush (contacts first!)
// ======================================================
async function flushHistoryBuffer() {
    if (!channelAccountId) return;

    if (contactsDirty && contactCache.size > 0) {
        await flushContactsToLaravel();
    }

    if (!historyBuffer.length) return;

    const batch = historyBuffer.splice(0, historyBuffer.length);
    console.log(`📤 Sending ${batch.length} history messages to Laravel...`);

    const CHUNK = 100;
    for (let i = 0; i < batch.length; i += CHUNK) {
        const chunk = batch.slice(i, i + CHUNK);
        try {
            await axios.post(
                `${LARAVEL_URL}/api/webhooks/whatsapp/history`,
                { channel_account_id: channelAccountId, messages: chunk },
                {
                    headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
                    timeout: 30000,
                }
            );
        } catch (err) {
            console.error('❌ History webhook error:', err.message);
        }
    }

    io.emit('history-synced', { count: batch.length });
}

function scheduleHistoryFlush() {
    clearTimeout(historyFlushTimer);
    historyFlushTimer = setTimeout(flushHistoryBuffer, 2500);
}

// ======================================================
// WhatsApp Connection
// ======================================================
async function startWhatsApp() {
    if (isStarting) return;
    isStarting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(
            './auth_info_baileys'
        );
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            auth: state,
            browser: ['Unified Inbox', 'Chrome', '1.0.0'],
            syncFullHistory: true,
            shouldSyncHistoryMessage: () => true,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            getMessage: async () => ({ conversation: '' }),
        });

        sock.ev.on('creds.update', saveCreds);

        // ==================================================
        // Contact events
        // ==================================================
        sock.ev.on('contacts.upsert', (contacts) => {
            try {
                findSelfInContacts(contacts);
                ingestContacts(contacts);
            } catch (err) {
                console.error('contacts.upsert error:', err.message);
            }
        });

        sock.ev.on('contacts.update', (contacts) => {
            try {
                findSelfInContacts(contacts);
                ingestContacts(contacts);
            } catch (err) {
                console.error('contacts.update error:', err.message);
            }
        });

        // ==================================================
        // Connection events
        // ==================================================
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
                const number = getPhoneNumberFromJid(me.id);
                currentUser = {
                    id: me.id,
                    name: me.name || me.verifiedName || number,
                    number,
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
                    } catch (e) {
                        console.error(e);
                    }
                    sock = null;
                    historyBuffer = [];
                    contactCache.clear();
                    setTimeout(() => startWhatsApp(), 2000);
                } else {
                    console.log('🔄 Reconnecting... code:', code);
                    setTimeout(() => startWhatsApp(), 3000);
                }
            }
        });

        // ==================================================
        // History sync
        // ==================================================
        sock.ev.on(
            'messaging-history.set',
            async ({ chats, contacts, messages, isLatest, progress }) => {
                if (contacts?.length) {
                    findSelfInContacts(contacts);
                    ingestContacts(contacts);
                }

                console.log(
                    `📚 History chunk: ${messages?.length || 0} msgs, ` +
                    `${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ` +
                    `isLatest=${isLatest}, progress=${progress ?? 'n/a'}`
                );

                if (!messages || !messages.length) {
                    if (isLatest) {
                        console.log('✅ History sync complete');
                        scheduleHistoryFlush();
                    }
                    return;
                }

                for (const msg of messages) {
                    try {
                        const parsed = await parseBaileysMessage(msg);
                        if (!parsed) continue;
                        historyBuffer.push(parsed);
                    } catch (e) {
                        console.error('History parse error:', e.message);
                    }
                }

                if (channelAccountId) scheduleHistoryFlush();

                if (isLatest) {
                    console.log('✅ History sync complete — final flush');
                    scheduleHistoryFlush();
                }
            }
        );

        sock.ev.on('messaging-history.status', (s) => {
            console.log('📊 History status:', JSON.stringify(s));
        });

        // ==================================================
        // Realtime messages — webhook FIRST, emit with IDs
        // ==================================================
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                try {
                    const parsed = await parseBaileysMessage(msg);
                    if (!parsed) continue;

                    const payload = {
                        channel_account_id: channelAccountId,
                        ...parsed,
                    };

                    if (!channelAccountId) {
                        realtimeBuffer.push(payload);
                        io.emit('new-message', payload);
                        continue;
                    }

                    let laravel = null;
                    try {
                        const resp = await axios.post(
                            `${LARAVEL_URL}/api/webhooks/whatsapp`,
                            payload,
                            {
                                headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
                                timeout: 15000,
                            }
                        );
                        laravel = resp.data;
                    } catch (err) {
                        console.error(
                            '❌ Message webhook error:',
                            err.response?.data || err.message
                        );
                    }

                    io.emit('new-message', {
                        ...payload,
                        conversation_id: laravel?.conversation_id || null,
                        contact_id: laravel?.contact_id || null,
                        message_id: laravel?.message_id || null,
                    });
                } catch (err) {
                    console.error('Message handling error:', err);
                }
            }
        });

        // ==================================================
        // Incoming reactions
        // ==================================================
        sock.ev.on('messages.reaction', async (reactions) => {
            for (const r of reactions) {
                try {
                    const targetKey = r.key;
                    const reaction = r.reaction;
                    if (!targetKey?.id) continue;

                    const reactorJid = reaction?.key?.fromMe
                        ? 'me'
                        : normalizeJid(reaction?.key?.remoteJid);

                    const payload = {
                        channel_account_id: channelAccountId,
                        external_message_id: targetKey.id,
                        reactor_jid: reactorJid,
                        emoji: reaction?.text || '',
                    };

                    io.emit('message-reaction', payload);

                    if (channelAccountId) {
                        await axios.post(
                            `${LARAVEL_URL}/api/webhooks/whatsapp/reaction`,
                            payload,
                            { headers: { 'X-Webhook-Secret': WEBHOOK_SECRET } }
                        ).catch(err => console.error('Reaction webhook error:', err.message));
                    }
                } catch (e) {
                    console.error('reaction handler error:', e.message);
                }
            }
        });

        // ==================================================
        // Message status updates (delivered/read)
        // ==================================================
        sock.ev.on('messages.update', async (updates) => {
            for (const u of updates) {
                try {
                    if (!u.key?.id || !u.update) continue;
                    const status = u.update.status;
                    const map = { 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' };
                    if (map[status]) {
                        io.emit('message-status', {
                            external_message_id: u.key.id,
                            status: map[status],
                        });
                    }
                } catch (e) {
                    console.error('messages.update error:', e.message);
                }
            }
        });

        // ==================================================
        // Presence (typing / online) per chat
        // ==================================================
        sock.ev.on('presence.update', ({ id, presences }) => {
            try {
                const jid = normalizeJid(id);
                if (!jid || !presences) return;
                const key = Object.keys(presences)[0];
                const p = presences[key];
                if (!p) return;
                io.emit('presence', {
                    jid,
                    presence: p.lastKnownPresence,
                    lastSeen: p.lastSeen || null,
                });
            } catch (e) {
                console.error('presence error:', e.message);
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

    socket.on('set-channel-account', async (id) => {
        channelAccountId = id;
        console.log('📌 channel_account_id set to:', id);

        if (currentUser?.name && currentUser.name !== currentUser.number) {
            axios.post(
                `${LARAVEL_URL}/api/webhooks/whatsapp/update-name`,
                { channel_account_id: id, account_name: currentUser.name },
                { headers: { 'X-Webhook-Secret': WEBHOOK_SECRET } }
            ).catch(err => console.error('Name update webhook error:', err.message));
        }

        if (contactCache.size) {
            contactsDirty = true;
            scheduleContactsSync();
        }

        if (historyBuffer.length) {
            console.log(`♻️ Flushing ${historyBuffer.length} buffered history messages`);
            scheduleHistoryFlush();
        }

        if (realtimeBuffer.length) {
            console.log(`♻️ Flushing ${realtimeBuffer.length} buffered realtime messages`);
            const pending = realtimeBuffer.splice(0, realtimeBuffer.length);
            (async () => {
                for (const p of pending) {
                    try {
                        await axios.post(
                            `${LARAVEL_URL}/api/webhooks/whatsapp`,
                            p,
                            { headers: { 'X-Webhook-Secret': WEBHOOK_SECRET } }
                        );
                    } catch (e) {
                        console.error('Buffered realtime flush error:', e.message);
                    }
                }
            })();
        }
    });

    socket.on('start-qr', async () => {
        if (connectionStatus === 'connected') {
            socket.emit('status', { status: 'connected' });
            socket.emit('user', currentUser);
            return;
        }
        if (!sock) await startWhatsApp();
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
        historyBuffer = [];
        contactCache.clear();
        io.emit('status', { status: 'disconnected' });
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ======================================================
// HTTP endpoints
// ======================================================

// ---------- Send text (with optional reply) ----------
app.post('/send-message', async (req, res) => {
    const { to, body, reply_to } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    try {
        const sendOpts = { text: body };

        if (reply_to?.external_message_id) {
            sendOpts.quoted = {
                key: {
                    remoteJid: to,
                    fromMe: !!reply_to.from_me,
                    id: reply_to.external_message_id,
                },
                message: { conversation: reply_to.body || '' },
            };
        }

        const result = await sock.sendMessage(to, sendOpts);
        return res.json({
            external_message_id: result?.key?.id || null,
            status: 'sent',
        });
    } catch (err) {
        console.error('Send error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Send media (image / video / document) ----------
app.post('/send-media', async (req, res) => {
    const {
        to,
        media_url,
        media_type,
        media_mime,
        media_filename,
        caption,
        reply_to,
    } = req.body;

    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    if (!media_url) {
        return res.status(400).json({ error: 'media_url required' });
    }

    try {
        // Fetch media file (from Laravel storage / Node media cache)
        const mediaResp = await axios.get(media_url, {
            responseType: 'arraybuffer',
            timeout: 60000,
        });
        const buffer = Buffer.from(mediaResp.data);

        const sendOpts = { caption: caption || undefined };

        if (reply_to?.external_message_id) {
            sendOpts.quoted = {
                key: {
                    remoteJid: to,
                    fromMe: !!reply_to.from_me,
                    id: reply_to.external_message_id,
                },
                message: { conversation: reply_to.body || '' },
            };
        }

        if (media_type === 'image') {
            sendOpts.image = buffer;
            if (media_mime) sendOpts.mimetype = media_mime;
        } else if (media_type === 'video') {
            sendOpts.video = buffer;
            if (media_mime) sendOpts.mimetype = media_mime;
        } else if (media_type === 'audio') {
            sendOpts.audio = buffer;
            sendOpts.mimetype = media_mime || 'audio/mp4';
            sendOpts.ptt = false;
        } else {
            sendOpts.document = buffer;
            sendOpts.mimetype = media_mime || 'application/octet-stream';
            sendOpts.fileName = media_filename || 'file';
        }

        const result = await sock.sendMessage(to, sendOpts);
        return res.json({
            external_message_id: result?.key?.id || null,
            status: 'sent',
        });
    } catch (err) {
        console.error('Send media error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Send voice (PTT) ----------
app.post('/send-voice', async (req, res) => {
    const { to, media_url, media_mime, reply_to } = req.body;

    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    if (!media_url) {
        return res.status(400).json({ error: 'media_url required' });
    }

    try {
        const mediaResp = await axios.get(media_url, {
            responseType: 'arraybuffer',
            timeout: 60000,
        });
        const buffer = Buffer.from(mediaResp.data);

        const sendOpts = {
            audio: buffer,
            mimetype: media_mime || 'audio/ogg; codecs=opus',
            ptt: true,
        };

        if (reply_to?.external_message_id) {
            sendOpts.quoted = {
                key: {
                    remoteJid: to,
                    fromMe: !!reply_to.from_me,
                    id: reply_to.external_message_id,
                },
                message: { conversation: reply_to.body || '' },
            };
        }

        const result = await sock.sendMessage(to, sendOpts);
        return res.json({
            external_message_id: result?.key?.id || null,
            status: 'sent',
        });
    } catch (err) {
        console.error('Send voice error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Send reaction ----------
app.post('/send-reaction', async (req, res) => {
    const { to, external_message_id, from_me, emoji } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    if (!to || !external_message_id) {
        return res.status(400).json({ error: 'to and external_message_id required' });
    }
    try {
        await sock.sendMessage(to, {
            react: {
                text: emoji || '',
                key: {
                    remoteJid: to,
                    fromMe: !!from_me,
                    id: external_message_id,
                },
            },
        });
        return res.json({ status: 'ok' });
    } catch (err) {
        console.error('Send reaction error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Edit ----------
app.post('/send-edit', async (req, res) => {
    const { to, external_message_id, from_me, body } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    try {
        await sock.sendMessage(to, {
            text: body,
            edit: {
                remoteJid: to,
                fromMe: !!from_me,
                id: external_message_id,
            },
        });
        return res.json({ status: 'ok' });
    } catch (err) {
        console.error('Edit error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Delete for everyone ----------
app.post('/send-delete', async (req, res) => {
    const { to, external_message_id, from_me } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    try {
        await sock.sendMessage(to, {
            delete: {
                remoteJid: to,
                fromMe: !!from_me,
                id: external_message_id,
            },
        });
        return res.json({ status: 'ok' });
    } catch (err) {
        console.error('Delete error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Typing presence ----------
app.post('/send-typing', async (req, res) => {
    const { to, state } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    if (!to) return res.status(400).json({ error: 'to required' });
    try {
        await sock.sendPresenceUpdate(state || 'composing', to);
        return res.json({ status: 'ok' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Subscribe presence for a chat ----------
app.post('/subscribe-presence', async (req, res) => {
    const { to } = req.body;
    if (!sock || connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp not connected' });
    }
    if (!to) return res.status(400).json({ error: 'to required' });
    try {
        await sock.presenceSubscribe(to);
        return res.json({ status: 'ok' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ---------- Logout ----------
app.post('/logout', async (req, res) => {
    try {
        if (sock) await sock.logout();
    } catch (e) { }
    connectionStatus = 'disconnected';
    currentUser = null;
    currentQR = null;
    channelAccountId = null;
    historyBuffer = [];
    contactCache.clear();
    io.emit('status', { status: 'disconnected' });
    return res.json({ success: true });
});

// ---------- Health ----------
app.get('/health', (req, res) =>
    res.json({
        status: connectionStatus,
        user: currentUser,
        hasQR: !!currentQR,
        bufferedHistory: historyBuffer.length,
        cachedContacts: contactCache.size,
    })
);

// ======================================================
// Boot
// ======================================================
server.listen(PORT, () => {
    console.log(`🚀 WhatsApp Node Gateway running on port ${PORT}`);
    startWhatsApp();
}); 