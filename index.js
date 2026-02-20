require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const db = require('./database');
const ai = require('./ai');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

console.log('✅ [SYSTEM] Iniciando script index.js...');

// Limpieza de seguridad para SingletonLock (Evita errores al reiniciar con nodemon)
const sessionPath = path.join(__dirname, 'session');
if (fs.existsSync(sessionPath)) {
    // Buscar y borrar de forma recursiva cualquier archivo SingletonLock o similar
    const deleteLock = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (file === 'SingletonLock' || file === 'SingletonCookie' || file === 'SingletonSocket') {
                try {
                    fs.unlinkSync(fullPath);
                    console.log(`⚙️ [SYSTEM] Eliminado: ${fullPath}`);
                } catch (e) { }
            } else if (fs.lstatSync(fullPath).isDirectory()) {
                deleteLock(fullPath);
            }
        }
    };
    try {
        deleteLock(sessionPath);
    } catch (err) {
        console.warn('⚠️ [SYSTEM] Error en limpieza de locks:', err.message);
    }
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session'
    }),
    puppeteer: {
        executablePath: '/usr/bin/google-chrome',
        headless: true,
        timeout: 120000,           // 2 minutos de carga
        protocolTimeout: 120000,   // 2 minutos para comandos largos como getChats()
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    }
});

const MI_GRUPO_DE_ALERTAS = process.env.MI_GRUPO_DE_ALERTAS || '1234567890@g.us';

// Función para cargar la lista negra
function getBlacklist() {
    try {
        if (fs.existsSync('./blacklist.txt')) {
            const data = fs.readFileSync('./blacklist.txt', 'utf8');
            return data.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
        }
    } catch (err) {
        console.error('❌ Error leyendo blacklist.txt:', err);
    }
    return [];
}

client.on('qr', (qr) => {
    console.log('🚨 NUEVO CÓDIGO QR GENERADO 🚨');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot de monitoreo activo y conectado!');
    if (client.info) {
        console.log(`👤 Conectado como: ${client.info.pushname || client.info.wid.user}`);
    }

    // Programar la tarea diaria (Ej: todos los días a las 09:00 AM)
    cron.schedule('0 9 * * *', async () => {
        console.log('🕒 Ejecutando reporte diario de seguimiento...');
        await sendFollowUpReports();
    });
});

async function sendFollowUpReports(verbose = false) {
    try {
        const clients4Days = await db.getSalesFromDaysAgo(4);
        if (clients4Days.length > 0) {
            let message = `📋 *RECORDATORIO (4 DÍAS)*\n_Ofrecer recarga de agua:_\n\n`;
            clients4Days.forEach(c => {
                message += `👤 ${c.name}\n🔗 https://wa.me/${c.number}\n\n`;
            });
            await client.sendMessage(MI_GRUPO_DE_ALERTAS, message);
        } else if (verbose) {
            await client.sendMessage(MI_GRUPO_DE_ALERTAS, `📋 *RECORDATORIO (4 DÍAS)*\n_No se encontraron clientes con 4 días de haber comprado._`);
        }

        const clientsRange = await db.getSalesInRange(5, 10);
        if (clientsRange.length > 0) {
            let message = `📋 *SEGUIMIENTO (5-10 DÍAS)*\n_Clientes que no han comprado recientemente:_\n\n`;
            clientsRange.forEach(c => {
                message += `👤 ${c.name}\n🔗 https://wa.me/${c.number}\n\n`;
            });
            await client.sendMessage(MI_GRUPO_DE_ALERTAS, message);
        } else if (verbose) {
            await client.sendMessage(MI_GRUPO_DE_ALERTAS, `📋 *SEGUIMIENTO (5-10 DÍAS)*\n_No se encontraron clientes de entre 5 y 10 días de haber comprado._`);
        }
    } catch (err) {
        console.error('❌ Error en el reporte diario:', err);
    }
}

// Cache para guardar las transcripciones y que la IA las pueda ver en el historial
const transcriptionCache = new Map();

client.on('message_create', async (msg) => {
    // 1. FILTRADO DE ESTADOS (STORIES)
    // Los estados de tus contactos llegan como mensajes a 'status@broadcast'
    if (msg.from === 'status@broadcast' || msg.to === 'status@broadcast' || msg.broadcast) {
        return;
    }

    try {
        let contact;
        let numeroLimpio = '';
        try {
            // No pedir contacto para mensajes que enviamos nosotros (evita error _serialized)
            if (msg.fromMe && client.info) {
                numeroLimpio = client.info.wid.user;
            } else {
                contact = await msg.getContact();
                numeroLimpio = contact ? contact.number : '';
            }
        } catch (e) {
            console.warn('[WARN] No se pudo obtener el contacto para msj:', e.message);
        }

        // VERIFICACIÓN DE LISTA NEGRA
        const blacklist = getBlacklist();
        if (numeroLimpio && blacklist.includes(numeroLimpio)) {
            return;
        }

        const chat = await msg.getChat();

        let cuerpoMensaje = msg.body || '';

        // 2. MANEJO DE AUDIOS / NOTAS DE VOZ
        if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
            try {
                console.log(`[AUDIO] Descargando de ${chat.name || 'Privado'}...`);
                const media = await msg.downloadMedia();
                if (media) {
                    const tempPath = path.join(__dirname, `temp_audio_${Date.now()}.ogg`);
                    fs.writeFileSync(tempPath, Buffer.from(media.data, 'base64'));

                    const transcripcion = await ai.transcribeAudio(tempPath);
                    if (transcripcion) {
                        console.log(`[TRANS] "${transcripcion}"`);
                        cuerpoMensaje = transcripcion;
                        // Guardamos en cache
                        transcriptionCache.set(msg.id._serialized, transcripcion);
                        if (transcriptionCache.size > 100) {
                            const firstKey = transcriptionCache.keys().next().value;
                            transcriptionCache.delete(firstKey);
                        }
                    }
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                }
            } catch (err) {
                console.error('[ERROR] Audio:', err.message);
            }
        }

        // Ignorar mensajes enviados por el propio bot, excepto:
        // 1. Comandos que empiecen con '!'
        // 2. Palabras de confirmación o rechazo que sirven para cerrar el ciclo de venta
        const palabrasRelevantes = ['ok', 'voy', 'vale', 'listo', 'sale', 'ya', 'perfecto', 'no', 'mañana', 'cerrado', 'puedo', 'disculpe'];
        const esRespuestaRelevanteVendedor = msg.fromMe && palabrasRelevantes.some(p => {
            const regex = new RegExp(`\\b${p}\\b`, 'i');
            return regex.test(cuerpoMensaje);
        });

        if (msg.fromMe && !cuerpoMensaje.trim().startsWith('!') && !esRespuestaRelevanteVendedor) {
            return;
        }

        // Log básico de actividad (Solo para chats privados para no saturar los logs)
        if (!chat.isGroup) {
            console.log(`[BOT LOG] Chat: ${chat.name || 'Privado'} | ID: ${chat.id._serialized} | Mensaje: ${cuerpoMensaje.substring(0, 50)}`);
        }

        const mensajeLimpio = cuerpoMensaje.toLowerCase();

        // 1. DETECCIÓN AUTOMÁTICA DE VENTAS (IA)
        if (!chat.isGroup) {
            const palabrasTrigger = ['agua', 'aguas', 'bidon', 'bidones', 'bidón', 'bidónes', 'recarga', 'botellon', 'pedido'];
            const palabrasIntento = ['deme', 'dame', 'quiero', 'mande', 'mándeme', 'necesito', 'traeme', 'tráeme', 'envie', 'envíe'];
            const todasLasTrigger = [...palabrasTrigger, ...palabrasIntento];
            const palabrasConfirmacion = ['ok', 'voy', 'vale', 'listo', 'sale', 'ya', 'perfecto'];
            const palabrasNegativas = ['no', 'puedo', 'disculpe', 'regreso', 'mañana', 'cerrado'];

            // Detección proactiva: revisar mensajes recientes
            const messagesIA = await chat.fetchMessages({ limit: 5 });

            // Función para obtener texto real (incluyendo transcripciones del cache)
            const getTextoMensaje = (m) => {
                if (transcriptionCache.has(m.id._serialized)) {
                    return transcriptionCache.get(m.id._serialized);
                }
                return m.body || '';
            };

            const tieneTriggerReciente = messagesIA.some(m => {
                const texto = getTextoMensaje(m).toLowerCase();
                const tieneKeyword = todasLasTrigger.some(p => texto.includes(p));
                const tienePedidoImplicito = /\d+\s*(al|depto|torre|apt)\s/i.test(texto);
                return tieneKeyword || tienePedidoImplicito;
            });

            const esRespuesta = [...palabrasConfirmacion, ...palabrasNegativas].some(p => {
                const regex = new RegExp(`\\b${p}\\b`, 'i');
                return regex.test(mensajeLimpio);
            });
            const tieneTriggerActual = todasLasTrigger.some(p => mensajeLimpio.includes(p));
            // Regex mejorada: detecta números de 3-4 dígitos seguidos opcionalmente de torres A, B, B1, B2
            const tienePedidoImplicito = /\b\d{3,4}\s*[ab][12]?\b/i.test(mensajeLimpio);

            if (tieneTriggerActual || tienePedidoImplicito || (esRespuesta && tieneTriggerReciente)) {
                console.log(`[IA SEARCH] Analizando venta con ${chat.name}...`);

                const context = messagesIA.map(m => {
                    const role = m.fromMe ? 'Vendedor' : 'Cliente';
                    return `${role}: ${getTextoMensaje(m)}`;
                }).join('\n');

                // Aseguramos que el audio actual esté si no sale en fetchMessages
                let contextoFinal = context;
                if (msg.hasMedia && !context.includes(cuerpoMensaje)) {
                    contextoFinal += `\nCliente: ${cuerpoMensaje}`;
                }

                const aiResponse = await ai.detectSale(contextoFinal);

                // REGLA DE SEGURIDAD: Solo registrar si el último mensaje fue del VENDEDOR (fromMe)
                // y la IA confirmó la venta. Esto evita registros falsos por mensajes del cliente.
                if (aiResponse && aiResponse.esVenta && msg.fromMe) {
                    const cantidad = aiResponse.cantidad || 1;
                    const ubicacion = aiResponse.ubicacion || '';
                    const precioPorUnidad = 2000;
                    const totalClp = cantidad * precioPorUnidad;

                    try {
                        // En chat privado, el número del cliente siempre está en el ID del chat.
                        // Usar chat.id.user garantiza que no registremos el número del bot
                        // cuando este es quien envía el mensaje de confirmación ("ok").
                        numero = chat.id.user;
                        const contacto = await chat.getContact();
                        nombre = contacto.pushname || contacto.name || chat.name || "Desconocido";
                    } catch (e) {
                        console.warn("[WARN] No se pudo obtener contacto para venta:", e.message);
                        nombre = chat.name || "Desconocido";
                        numero = chat.id.user || "unknown";
                    }
                    await db.registerSale(nombre, numero, cantidad, totalClp, ubicacion);

                    console.log(`[VENTA OK] Guardada para ${nombre} | ID: ${numero} | Cant: ${cantidad} | Total: $${totalClp} | Ubicación: ${ubicacion}`);
                } else {
                    console.log(`👤 IA dice: NO (Venta no cerrada aún)`);
                }
            }
        }


        // 2. MONITOREO DE PALABRAS CLAVE EN GRUPOS (ALERTA DE PEDIDO)
        const palabrasClave = ['agua', 'bidon', 'bidón', 'recarga', 'botellon', 'botellón'];
        const contienePalabra = palabrasClave.some(palabra => mensajeLimpio.includes(palabra));

        if (chat.isGroup && contienePalabra && chat.id._serialized !== MI_GRUPO_DE_ALERTAS) {
            let contactoInfo = null;
            try {
                contactoInfo = await msg.getContact();
            } catch (e) {
                console.warn('[WARN] No se pudo obtener contacto para alerta de grupo:', e.message);
            }
            const alerta = `🚨 *ALERTA DE PEDIDO* 🚨\n\n` +
                `👥 *Grupo:* ${chat.name}\n` +
                `👤 *Persona:* ${contactoInfo ? (contactoInfo.pushname || contactoInfo.number) : 'Desconocido'}\n` +
                `💬 *Mensaje:* ${cuerpoMensaje}\n\n` +
                `🔗 *Ir al Chat:* ${contactoInfo ? `https://wa.me/${contactoInfo.number}` : '#'}`;

            await client.sendMessage(MI_GRUPO_DE_ALERTAS, alerta);
            console.log('[NOTIF] Alerta enviada para el grupo:', chat.name);
        }

        // 3. COMANDO !reporte (Generar reportes de seguimiento ahora)
        if (mensajeLimpio === '!reporte' && !chat.isGroup) {
            await msg.reply('⏳ Generando y enviando reportes de seguimiento al grupo de alertas...');
            await sendFollowUpReports(true); // Verbose = true para que avise si no hay nada
            await msg.reply('✅ Reportes enviados.');
        }

        // 3.5 COMANDO DE BOOTSTRAP (!bootstrap) - Escaneo masivo retroactivo
        if (mensajeLimpio === '!bootstrap' && !chat.isGroup) {
            await msg.reply('🔍 *INICIANDO ESCANEO RETROACTIVO...*\n\nEsto puede tomar algunos minutos. Voy a revisar todos tus chats privados recientes y buscar ventas históricas.\n\n_No envíes otros comandos hasta que termine._');

            try {
                const allChats = await client.getChats();
                const privateChats = allChats.filter(c => !c.isGroup);

                // Filtrar chats con actividad en los últimos 10 días
                const diezDiasAtras = Date.now() / 1000 - (10 * 24 * 60 * 60);
                const chatsRecientes = privateChats.filter(c => {
                    return c.lastMessage && c.lastMessage.timestamp > diezDiasAtras;
                });

                console.log(`[BOOTSTRAP] Encontrados ${chatsRecientes.length} chats privados con actividad reciente`);
                await msg.reply(`📊 Encontré *${chatsRecientes.length}* chats privados con actividad en los últimos 10 días. Analizando...`);

                let ventasEncontradas = 0;
                let chatsAnalizados = 0;
                let detalleVentas = [];

                for (const chatItem of chatsRecientes) {
                    try {
                        const messages = await chatItem.fetchMessages({ limit: 5 });
                        if (messages.length === 0) continue;

                        // Filtrar mensajes vacíos o de sistema
                        const mensajesUtiles = messages.filter(m => m.body && m.body.trim().length > 0);
                        if (mensajesUtiles.length === 0) continue;

                        const context = mensajesUtiles.map(m =>
                            `${m.fromMe ? 'Vendedor' : 'Cliente'}: ${m.body}`
                        ).join('\n');

                        // Usar la IA para analizar
                        const aiResponse = await ai.detectSale(context);
                        chatsAnalizados++;

                        if (aiResponse && aiResponse.esVenta) {
                            const cantidad = aiResponse.cantidad || 1;
                            const ubicacion = aiResponse.ubicacion || '';
                            const totalClp = cantidad * 2000;
                            // No se necesita obtener el contacto mediante la API, usamos los datos del chat directamente
                            const nombre = chatItem.name || chatItem.id.user;
                            const numero = chatItem.id.user;

                            // Usar la fecha del último mensaje del VENDEDOR (confirmación) en hora LOCAL
                            const lastSellerMsg = [...mensajesUtiles].reverse().find(m => m.fromMe);
                            const tstamp = lastSellerMsg ? lastSellerMsg.timestamp : mensajesUtiles[mensajesUtiles.length - 1].timestamp;
                            const fechaVenta = db.getChileDate(new Date(tstamp * 1000));

                            await db.registerSale(nombre, numero, cantidad, totalClp, ubicacion, fechaVenta);
                            ventasEncontradas++;
                            detalleVentas.push(`✅ *${nombre}* | ${cantidad} unid. | $${totalClp.toLocaleString('es-CL')} | 📅 ${fechaVenta} | 📍 ${ubicacion || 'N/A'}`);
                            console.log(`[BOOTSTRAP] Venta encontrada: ${nombre} | Cant: ${cantidad} | Fecha: ${fechaVenta}`);
                        }

                        // Pausa aleatoria entre 2 y 5 segundos (comportamiento más humano y seguro)
                        const delay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
                        await new Promise(resolve => setTimeout(resolve, delay));

                        // Cada 10 chats, dar un update
                        if (chatsAnalizados % 10 === 0) {
                            await msg.reply(`⏳ Progreso: ${chatsAnalizados}/${chatsRecientes.length} chats analizados... (${ventasEncontradas} ventas encontradas)`);
                        }
                    } catch (chatErr) {
                        console.warn(`[BOOTSTRAP] Error en chat ${chatItem.name}:`, chatErr.message);
                    }
                }

                // Reporte final
                let resumen = `✅ *BOOTSTRAP COMPLETADO* ✅\n\n`;
                resumen += `📊 *Chats analizados:* ${chatsAnalizados}\n`;
                resumen += `📊 *Ventas detectadas:* ${ventasEncontradas}\n\n`;

                if (detalleVentas.length > 0) {
                    resumen += `*DETALLE DE VENTAS ENCONTRADAS:*\n\n`;
                    resumen += detalleVentas.join('\n');
                    resumen += `\n\n_Ahora puedes usar !reporte para ver seguimiento de estos clientes._`;
                } else {
                    resumen += `_No se detectaron ventas cerradas en los chats recientes. Esto puede ser normal si las conversaciones no tenían confirmaciones explícitas._`;
                }

                await msg.reply(resumen);

                // Ejecutar los reportes automáticamente al terminar bootstrap
                await msg.reply('🕒 Lanzando reportes de seguimiento basados en los nuevos datos...');
                await sendFollowUpReports(true);

                console.log(`[BOOTSTRAP] Finalizado. Ventas: ${ventasEncontradas}/${chatsAnalizados} chats`);

            } catch (bootErr) {
                console.error('[BOOTSTRAP] Error general:', bootErr);
                await msg.reply('❌ Error durante el escaneo. Revisa los logs.');
            }
        }

        // 4. COMANDO DE ESCANEO HISTÓRICO (!scan)
        if (mensajeLimpio === '!scan' && !chat.isGroup) {
            await msg.reply('⏳ Escaneando mensajes recientes para buscar ventas pasadas...');
            const messages = await chat.fetchMessages({ limit: 50 });
            const context = messages.map(m => `${m.fromMe ? 'Vendedor' : 'Cliente'}: ${m.body}`).join('\n');
            const aiResponse = await ai.detectSale(context);
            // En el comando !scan, permitimos que se registre si la IA lo ve claro, 
            // ya que el comando lo lanza el usuario manualmente para buscar ventas pasadas.
            if (aiResponse && aiResponse.esVenta) {
                const cantidad = aiResponse.cantidad || 1;
                const totalClp = cantidad * 2000;
                const contacto = await msg.getContact();
                await db.registerSale(contacto.pushname || contacto.number, contacto.number, cantidad, totalClp);
                await msg.reply(`✅ Venta histórica detectada y guardada ($${totalClp}).`);
            } else {
                await msg.reply('No se detectaron ventas claras en los últimos mensajes.');
            }
        }

        // 5. COMANDO DE FINANZAS (!ventas)
        if ((mensajeLimpio === '!ventas' || mensajeLimpio === '!caja') && !chat.isGroup) {
            await msg.reply('📊 Generando resumen financiero...');
            const summary = await db.getFinancialSummary();
            const topClients = await db.getTopClients(3);

            const format = (data) => `$${(data.total || 0).toLocaleString('es-CL')} (${data.qty || 0} unid.)`;

            let response = `📈 *RESUMEN DE INGRESOS* 📈\n\n` +
                `📅 *Hoy:* ${format(summary.today)}\n` +
                `📆 *Ayer:* ${format(summary.yesterday)}\n` +
                `🗓️ *Esta Semana:* ${format(summary.week)}\n` +
                `📊 *Este Mes:* ${format(summary.month)}\n\n`;

            if (topClients.length > 0) {
                response += `🏆 *TOP CLIENTES DEL MES* 🏆\n`;
                topClients.forEach((c, i) => {
                    const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉');
                    response += `${medal} *${c.name}*: ${c.total_qty} unid.\n`;
                });
                response += `\n`;
            }

            response += `_Nota: Cálculo basado en $2.000 por unidad._`;

            await msg.reply(response);
        }

        // 6. COMANDO DE EXCEL (!excel)
        if (mensajeLimpio === '!excel' && !chat.isGroup) {
            try {
                await msg.reply('📑 Generando archivo Excel mensual...');
                const data = await db.getMonthlySalesData();

                if (data.length === 0) {
                    return await msg.reply('No hay ventas registradas este mes aún.');
                }

                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Ventas del Mes');

                worksheet.columns = [
                    { header: 'Fecha', key: 'date', width: 15 },
                    { header: 'Cliente', key: 'name', width: 25 },
                    { header: 'Teléfono', key: 'number', width: 15 },
                    { header: 'Dirección', key: 'address', width: 25 },
                    { header: 'Cant.', key: 'quantity', width: 10 },
                    { header: 'Total CLP', key: 'total_clp', width: 15 }
                ];

                // Estilo para la cabecera
                worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
                worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0078D4' } };
                worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

                data.forEach(sale => {
                    const row = worksheet.addRow(sale);
                    row.getCell('total_clp').numFmt = '"$"#,##0'; // Formato de moneda
                });

                // Añadir fila de totales
                const totalCant = data.reduce((acc, s) => acc + s.quantity, 0);
                const totalDinero = data.reduce((acc, s) => acc + s.total_clp, 0);

                const lastRow = worksheet.addRow({
                    date: 'TOTAL',
                    quantity: totalCant,
                    total_clp: totalDinero
                });

                lastRow.font = { bold: true };
                lastRow.getCell('total_clp').numFmt = '"$"#,##0';
                lastRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0078D4' } };

                // --- NUEVA PESTAÑA: RANKING DE CLIENTES ---
                const topData = await db.getTopClients(10); // Top 10 para el Excel
                if (topData.length > 0) {
                    const wsRanking = workbook.addWorksheet('Ranking de Clientes');
                    wsRanking.columns = [
                        { header: 'Puesto', key: 'rank', width: 10 },
                        { header: 'Cliente', key: 'name', width: 30 },
                        { header: 'Teléfono', key: 'number', width: 20 },
                        { header: 'Total Vendido (Unid.)', key: 'total_qty', width: 25 }
                    ];

                    // Estilo Cabecera Ranking (Verde)
                    wsRanking.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
                    wsRanking.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '28A745' } };
                    wsRanking.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

                    topData.forEach((c, i) => {
                        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : i + 1));
                        wsRanking.addRow({
                            rank: medal,
                            name: c.name,
                            number: c.number,
                            total_qty: c.total_qty
                        });
                    });
                }

                const tempPath = path.join(__dirname, `Ventas_${Date.now()}.xlsx`);
                await workbook.xlsx.writeFile(tempPath);

                const { MessageMedia } = require('whatsapp-web.js');
                const media = MessageMedia.fromFilePath(tempPath);
                await client.sendMessage(msg.from, media, { caption: '📊 Aquí tienes el detalle de ventas del mes hasta ahora.' });

                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (err) {
                console.error('Error generando Excel:', err);
                await msg.reply('❌ Error al generar el archivo Excel.');
            }
        }

        // 7. ELIMINAR ÚLTIMA VENTA (!euv)
        if (mensajeLimpio === '!euv' && !chat.isGroup) {
            const rowCount = await db.deleteLastSale();
            if (rowCount > 0) {
                await msg.reply('🗑️ *Venta eliminada:* Se ha eliminado el último registro de venta de la base de datos.');
                console.log('[DELETE] Última venta eliminada por comando !euv');
            } else {
                await msg.reply('⚠️ No hay ventas registradas para eliminar.');
            }
        }

        // 8. ELIMINAR ÚLTIMA VENTA POR NÚMERO (!euvn)
        if (mensajeLimpio.startsWith('!euvn') && !chat.isGroup) {
            // Extraer todos los dígitos después del comando para manejar espacios o caracteres especiales
            const numeroTarget = mensajeLimpio.replace('!euvn', '').replace(/\D/g, '');

            if (!numeroTarget) {
                return await msg.reply('❌ Formato incorrecto. Usa: `!euvn [numero]` (ej: !euvn 56912345678)');
            }

            const rowCount = await db.deleteLastSaleByNumber(numeroTarget);
            if (rowCount > 0) {
                await msg.reply(`🗑️ *Venta eliminada:* Se ha eliminado la última venta registrada para el ID ${numeroTarget}.`);
                console.log(`[DELETE] Venta eliminada para ${numeroTarget} por comando !euvn`);
            } else {
                await msg.reply(`⚠️ No se encontraron ventas para el ID ${numeroTarget}. Verifica el número o ID en los logs.`);
            }
        }

        // 9. REGISTRO MANUAL DE VENTA (!rv)
        if (mensajeLimpio.startsWith('!rv') && !chat.isGroup) {
            const rawArgs = cuerpoMensaje.split(/\s+/).slice(1);
            if (rawArgs.length < 1) {
                return await msg.reply('❌ Formato incorrecto. Usa: `!rv [numero] [cantidad]`\nEj: `!rv 56912345678 2`');
            }

            const numeroTarget = rawArgs[0].replace(/\D/g, '');
            let cantidad = parseInt(rawArgs[1]);
            if (isNaN(cantidad) || cantidad <= 0) cantidad = 1;

            if (!numeroTarget) {
                return await msg.reply('❌ Debes ingresar un número válido.');
            }

            try {
                // Buscar ubicación previa
                const ultimaUbicacion = await db.getLastLocation(numeroTarget);
                const precioPorUnidad = 2000;
                const totalClp = cantidad * precioPorUnidad;

                // Buscar nombre si es posible
                let nombreManual = "Registro Manual";
                try {
                    const contactInfo = await client.getContactById(numeroTarget + "@c.us");
                    if (contactInfo) {
                        nombreManual = contactInfo.pushname || contactInfo.name || nombreManual;
                    }
                } catch (e) {
                    // No importa si falla el nombre
                }

                await db.registerSale(nombreManual, numeroTarget, cantidad, totalClp, ultimaUbicacion);

                let resp = `✅ *Venta registrada manualmente*\n\n` +
                    `👤 *Cliente:* ${nombreManual}\n` +
                    `🆔 *ID:* ${numeroTarget}\n` +
                    `💧 *Cant:* ${cantidad}\n` +
                    `💰 *Total:* $${totalClp.toLocaleString('es-CL')}`;

                if (ultimaUbicacion) {
                    resp += `\n📍 *Ubicación:* ${ultimaUbicacion} (autocompletada)`;
                }

                await msg.reply(resp);
                console.log(`[MANUAL OK] Venta registrada por comando !rv para ${numeroTarget}`);
            } catch (err) {
                console.error('Error en !rv:', err);
                await msg.reply('❌ Error al registrar la venta manualmente.');
            }
        }

        // 7. COMANDO DE AYUDA (!ayuda)
        if ((mensajeLimpio === '!ayuda' || mensajeLimpio === '!help' || mensajeLimpio === '!comandos') && !chat.isGroup) {
            const ayudaMensaje = `📝 *COMANDOS DEL BOT* 📝\n\n` +
                `*!ventas*: Resumen de ingresos acumulados.\n` +
                `*!excel*: Descarga el listado mensual en Excel.\n` +
                `*!reporte*: Seguimiento de pedidos pendientes.\n` +
                `*!rv [num] [cant]*: Registra venta manualmente.\n` +
                `*!euv*: Elimina la última venta registrada.\n` +
                `*!euvn [num]*: Elimina la última venta de un número.\n` +
                `*!scan*: Busca ventas en el historial reciente.\n` +
                `*!id*: Ver ID de este chat.\n\n` +
                `_Nota: Estos comandos solo funcionan en chats privados._`;

            await msg.reply(ayudaMensaje);
        }

        // 8. COMANDO !id (Para obtener IDs de grupos/chats)
        if (mensajeLimpio === '!id' && !chat.isGroup) {
            await msg.reply(`🆔 ID de este chat: \`${chat.id._serialized}\``);
        }

    } catch (error) {
        console.error('❌ Error procesando mensaje:', error);
    }
});

client.initialize();
