const OpenAI = require('openai');
const fs = require('fs');
require('dotenv').config();

const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

/**
 * Analyzes a conversation to determine if a water sale was closed.
 * Prioritizes OpenAI if available, falls back to Groq.
 */
async function detectSale(chatHistory) {
    // Re-chequeo dinámico por si acaso
    const activeOpenAI = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

    const prompt = `Actúa como un Auditor de Ventas Estricto para un negocio de agua en Chile.
Tu misión es determinar si una venta se CERRÓ con éxito basándote en la conversación.

REGLA DE ORO DE CIERRE:
- Una venta SOLO es exitosa (esVenta: true) si el Cliente solicita Y el Vendedor responde CONFIRMANDO de forma explícita.
- SI EL ÚLTIMO MENSAJE ES DEL CLIENTE, la venta "esVenta" SIEMPRE es false (está pendiente).
- Respuestas de rechazo (No puedo, No hay, Vuelvo en 2h) son "esVenta": false.

EJEMPLOS DE ENTRENAMIENTO:

Cliente: Hola quiero 2 aguas al 1201
Respuesta: {"esVenta": false, "cantidad": 2, "ubicacion": "1201"} (Falta confirmación del vendedor)

Ejemplo 2 (RECHAZADA):
Cliente: Tráeme 3 bidones
Vendedor: No tengo stock ahora, disculpe.
Respuesta: {"esVenta": false, "cantidad": 3, "ubicacion": ""} (Vendedor rechazó)

Ejemplo 3 (EXITOSA):
Cliente: Quiero 2 de 20 litros porfa al depto 507 torre A
Vendedor: Ok voy para allá
Respuesta: {"esVenta": true, "cantidad": 2, "ubicacion": "Depto 507 Torre A"} (Venta cerrada con éxito)

REGLAS DE SALIDA:
- Responde ÚNICAMENTE con un objeto JSON: { "esVenta": boolean, "cantidad": number, "ubicacion": string }
- No añadas texto extra.

Conversación actual:
${chatHistory}

Respuesta JSON:`;

    if (activeOpenAI) {
        try {
            const completion = await activeOpenAI.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-4o",
                temperature: 0,
                response_format: { type: "json_object" }
            });
            const res = JSON.parse(completion.choices[0].message.content.trim());
            console.log(`🤖 IA (OpenAI GPT-4o) dice: ${JSON.stringify(res)}`);
            return res;
        } catch (err) {
            console.warn('⚠️ Error en OpenAI, reintentando con Groq:', err.message);
        }
    } else {
        console.log('💡 [DEBUG] OpenAI Key no detectada, usando Groq...');
    }

    // Fallback a Groq
    try {
        if (!process.env.GROQ_API_KEY) return { esVenta: false, cantidad: 0 };

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0,
            response_format: { type: "json_object" }
        });

        const res = JSON.parse(completion.choices[0].message.content.trim());
        console.log(`🤖 IA (Groq) dice: ${JSON.stringify(res)}`);
        return res;
    } catch (error) {
        console.error('❌ Error en detección de IA:', error.message);
        return { esVenta: false, cantidad: 0 };
    }
}

/**
 * Transcribes an audio file using Groq's Whisper model.
 * @param {string} filePath - Path to the audio file.
 * @returns {Promise<string>} - Transcribed text.
 */
async function transcribeAudio(filePath) {
    try {
        if (!process.env.GROQ_API_KEY) {
            return '';
        }

        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-large-v3",
            language: "es", // Forzamos español para mejor precisión
            response_format: "text",
        });

        return transcription;
    } catch (error) {
        console.error('❌ Error en transcripción Whisper:', error.message);
        return '';
    }
}

module.exports = { detectSale, transcribeAudio };
