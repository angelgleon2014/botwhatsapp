const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const db = require('./database');
const ai = require('./ai');
require('dotenv').config();

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session'
    }),
    puppeteer: {
        executablePath: '/usr/bin/google-chrome-stable',
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// Configuración desde .env
const MI_GRUPO_DE_ALERTAS = process.env.MI_GRUPO_DE_ALERTAS || '1234567890@g.us';

client.on('qr', (qr) => {
    console.log('🚨 NUEVO CÓDIGO QR GENERADO 🚨');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot de monitoreo activo y conectado!');

    // Programar la tarea diaria (Ej: todos los días a las 09:00 AM)
    cron.schedule('0 9 * * *', async () => {
        console.log('🕒 Ejecutando reporte diario de seguimiento...');
        await sendFollowUpReports();
    });
});

async function sendFollowUpReports() {
    try {
        const clients4Days = await db.getSalesFromDaysAgo(4);
        if (clients4Days.length > 0) {
            let message = `📋 *RECORDATORIO (4 DÍAS)*\n_Ofrecer recarga de agua:_\n\n`;
            clients4Days.forEach(c => {
                message += `👤 ${c.name}\n🔗 https://wa.me/${c.number}\n\n`;
            });
            await client.sendMessage(MI_GRUPO_DE_ALERTAS, message);
        }

        const clientsRange = await db.getSalesInRange(5, 10);
        if (clientsRange.length > 0) {
            let message = `📋 *SEGUIMIENTO (5-10 DÍAS)*\n_Clientes que no han comprado recientemente:_\n\n`;
            clientsRange.forEach(c => {
                message += `👤 ${c.name}\n🔗 https://wa.me/${c.number}\n\n`;
            });
            await client.sendMessage(MI_GRUPO_DE_ALERTAS, message);
        }
    } catch (err) {
        console.error('❌ Error en el reporte diario:', err);
    }
}

client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        const mensajeLimpio = msg.body.toLowerCase();

        // 1. DETECCIÓN AUTOMÁTICA DE VENTAS (IA)
        // Solo en chats privados para no saturar con grupos de spam
        if (!chat.isGroup) {
            const palabrasTrigger = ['agua', 'bidon', 'bidón', 'recarga', 'botellon', 'pedido', 'confirmado', 'listo'];
            const tieneTrigger = palabrasTrigger.some(p => mensajeLimpio.includes(p));

            if (tieneTrigger) {
                console.log(`🔍 Posible venta detectada en chat con ${chat.name}. Analizando con IA...`);

                // Obtenemos los últimos 5 mensajes del chat para contexto
                const messages = await chat.fetchMessages({ limit: 5 });
                const context = messages.map(m => `${m.fromMe ? 'Vendedor' : 'Cliente'}: ${m.body}`).join('\n');

                const esVenta = await ai.detectSale(context);

                if (esVenta) {
                    const contacto = await msg.getContact();
                    const nombre = contacto.pushname || contacto.number;
                    await db.registerSale(nombre, contacto.number);
                    console.log(`✅ Venta guardada automáticamente para ${nombre}`);

                    // Opcional: Avisarte a ti por el grupo de alertas que se detectó una venta
                    // await client.sendMessage(MI_GRUPO_DE_ALERTAS, `🤖 *IA:* He detectado y guardado una venta para *${nombre}*`);
                }
            }
        }

        // 2. MONITOREO DE PALABRAS CLAVE EN GRUPOS (ALERTA DE PEDIDO)
        const palabrasClave = ['agua', 'bidon', 'bidón', 'recarga', 'botellon', 'botellón'];
        const contienePalabra = palabrasClave.some(palabra => mensajeLimpio.includes(palabra));

        if (chat.isGroup && contienePalabra && chat.id._serialized !== MI_GRUPO_DE_ALERTAS) {
            const contacto = await msg.getContact();
            const alerta = `🚨 *ALERTA DE PEDIDO* 🚨\n\n` +
                `👥 *Grupo:* ${chat.name}\n` +
                `👤 *Persona:* ${contacto.pushname || contacto.number}\n` +
                `💬 *Mensaje:* ${msg.body}\n\n` +
                `🔗 *Ir al Chat:* https://wa.me/${contacto.number}`;

            await client.sendMessage(MI_GRUPO_DE_ALERTAS, alerta);
            console.log('✨ Notificación enviada para el grupo:', chat.name);
        }

        // 3. COMANDO DE ESCANEO HISTÓRICO (!scan)
        if (mensajeLimpio === '!scan' && !chat.isGroup) {
            await msg.reply('⏳ Escaneando mensajes recientes para buscar ventas pasadas...');
            const messages = await chat.fetchMessages({ limit: 50 });
            // Agrupar mensajes en bloques para no saturar la API
            const context = messages.map(m => `${m.fromMe ? 'Vendedor' : 'Cliente'}: ${m.body}`).join('\n');
            const esVenta = await ai.detectSale(context);
            if (esVenta) {
                const contacto = await msg.getContact();
                await db.registerSale(contacto.pushname || contacto.number, contacto.number);
                await msg.reply('✅ Venta histórica detectada y guardada.');
            } else {
                await msg.reply('No se detectaron ventas claras en los últimos mensajes.');
            }
        }

    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
    }
});

client.initialize();
