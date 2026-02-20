const ai = require('../ai');

// Mock de OpenAI
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => {
        return {
            chat: {
                completions: {
                    create: jest.fn().mockResolvedValue({
                        choices: [{
                            message: {
                                content: JSON.stringify({
                                    esVenta: true,
                                    cantidad: 2,
                                    ubicacion: "Test Address"
                                })
                            }
                        }]
                    })
                }
            }
        };
    });
});

describe('AI Module', () => {
    test('detectSale should return a structured object from mocked IA', async () => {
        const result = await ai.detectSale('Cliente: hola quiero 2 aguas\nVendedor: ok voy');

        expect(result).toBeDefined();
        expect(result.esVenta).toBe(true);
        expect(result.cantidad).toBe(2);
        expect(result.ubicacion).toBe("Test Address");
    });

    test('transcribeAudio should return empty string if no file exists (mocked error handling)', async () => {
        // En un entorno de test sin archivos reales, debería fallar o retornar vacío según hayamos programado
        const result = await ai.transcribeAudio('non_existent.ogg');
        expect(result).toBe('');
    });
});
