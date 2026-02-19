const OpenAI = require('openai');
require('dotenv').config();

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

/**
 * Analyzes a conversation to determine if a water sale was closed.
 * @param {string} chatHistory - The last few messages of the conversation.
 * @returns {Promise<boolean>} - True if a sale was closed, false otherwise.
 */
async function detectSale(chatHistory) {
    try {
        if (!process.env.GROQ_API_KEY) {
            console.warn('⚠️ GROQ_API_KEY no configurada. Saltando análisis de IA.');
            return false;
        }

        const prompt = `Analiza la siguiente conversación de WhatsApp de un negocio de venta de agua. 
Determina si el vendedor y el cliente han cerrado una venta (el cliente pidió y el vendedor confirmó el envío o aceptó el pedido).

REGLAS:
- Responde ÚNICAMENTE con la palabra "SÍ" si la venta se cerró.
- Responde ÚNICAMENTE con la palabra "NO" si no hay una venta clara o aún están negociando/preguntando.
- Ignora mensajes que solo sean saludos sin pedido.

Conversación:
${chatHistory}

¿Venta cerrada? (SÍ/NO):`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-8b-8192",
            temperature: 0.1,
        });

        const response = completion.choices[0].message.content.trim().toUpperCase();
        console.log(`🤖 IA dice: ${response}`);
        return response.includes('SÍ');
    } catch (error) {
        console.error('❌ Error en detección de IA:', error.message);
        return false;
    }
}

module.exports = { detectSale };
