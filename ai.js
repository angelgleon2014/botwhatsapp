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

REGLA DE ORO DE CIERRE (EXTREMA):
- Una venta SOLO es exitosa (esVenta: true) si el Cliente solicita Y el Vendedor responde CONFIRMANDO (ej: ok, voy, listo, perfecto).
- REGLA ABSOLUTA: Si el ÚLTIMO mensaje de la conversación es del CLIENTE, "esVenta" DEBE ser false. No importa lo que se haya dicho antes.
- REGLA DE NO REPETICIÓN: Si el vendedor ya confirmó anteriormente y el cliente vuelve a hablar (ej: "gracias", "le espero"), la venta ya se considera procesada/vieja y debes responder "esVenta": false para evitar duplicados. Solo devuelve true en el PRECISO MOMENTO en que el vendedor confirma.
- Ubicación: No la inventes. Si no hay dirección clara y no está en el mensaje, deja vacío o usa lo que diga el texto.

EJEMPLOS:

Contexto:
Cliente: Quiero 1 agua al 1201
Respuesta: {"esVenta": false, "cantidad": 1, "ubicacion": "1201"} (Falta confirmación)

Contexto:
Cliente: Quiero 1 agua al 1201
Vendedor: Ok voy
Respuesta: {"esVenta": true, "cantidad": 1, "ubicacion": "1201"} (CIERRE PERFECTO)

Contexto:
Cliente: Quiero 1 agua al 1201
Vendedor: Ok voy
Cliente: Gracias amable
Respuesta: {"esVenta": false, "cantidad": 1, "ubicacion": "1201"} (YA CERRADA, EL ÚLTIMO ES CLIENTE)

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
            console.log(`👤 IA (OpenAI GPT-4o) dice: ${JSON.stringify(res)}`);
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
        console.log(`👤 IA (Groq) dice: ${JSON.stringify(res)}`);
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
