/**
 * Procesa el comando !rv para extraer número y cantidad
 * @param {string} body - Cuerpo completo del mensaje
 * @returns {Object|null} - { numero, cantidad } o null si es inválido
 */
function parseRvCommand(body) {
    if (!body) return null;
    const bodyLower = body.toLowerCase();
    if (!bodyLower.startsWith('!rv')) return null;

    const input = body.slice(3).trim();
    if (!input) return null;

    const parts = input.split(/\s+/);
    let numeroTargetRaw = input;
    let cantidad = 1;

    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        if (/^\d{1,2}$/.test(lastPart) && parseInt(lastPart) <= 20) {
            cantidad = parseInt(lastPart);
            numeroTargetRaw = parts.slice(0, -1).join('');
        } else {
            numeroTargetRaw = parts.join('');
        }
    }

    const numero = numeroTargetRaw.replace(/\D/g, '');
    if (!numero || numero.length < 8) return null;

    return { numero, cantidad };
}

module.exports = {
    parseRvCommand
};
