# WhatsApp AI Sale Monitor & CRM 💧🚀

Un ecosistema inteligente de monitoreo y automatización de ventas para WhatsApp, diseñado para optimizar el ciclo de vida del cliente mediante la **orquestación de Inteligencia Artificial**.

Este proyecto no es solo un bot de respuestas; es un agente autónomo que transcribe audios, analiza contextos de venta en tiempo real, gestiona bases de datos relacionales y genera inteligencia de negocios (BI) automáticamente.

## 🌟 Características Principales

- **Detección de Ventas Multi-Modo**: Orquestación de **OpenAI (GPT-4o)** y **Groq** para identificar cierres de venta, cantidades y direcciones con precisión humana.
- **Transcripción de Voz (Whisper)**: Conversión instantánea de notas de voz a texto para procesamiento por la IA. El bot "escucha" y actúa.
- **Bootstrapping Inteligente**: Escaneo retroactivo de chats históricos para poblar la base de datos con ventas pasadas, respetando zonas horarias locales.
- **Seguimiento Automatizado (CRM)**: Generación diaria de listas de seguimiento para clientes (4 días y 5-10 días) para maximizar la retención.
- **Business Intelligence (BI)**:
  - Resúmenes financieros integrados (`!ventas`).
  - Exportación de reportes profesionales en Excel (`!excel`) con rankings de clientes.
- **Arquitectura Robusta**:
  - Contenerización con **Docker** para despliegue instantáneo.
  - Persistencia con **SQLite3**.
  - Estabilidad garantizada con limpieza automática de sesiones y gestión de Puppeteer.

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| **Core** | Node.js (Runtime) |
| **WhatsApp Engine** | WhatsApp-web.js (Puppeteer) |
| **Inteligencia Artificial** | OpenAI API (GPT-4o) / Groq Cloud (Llama 3 / Whisper) |
| **Base de Datos** | SQLite3 |
| **Automatización** | Node-cron |
| **Infraestructura** | Docker & Docker Compose |
| **Reporting** | ExcelJS |

## 🚀 Cómo Empezar

### Requisitos Previos
- Docker & Docker Compose instalados.
- Archivo `.env` configurado con tus API Keys (OpenAI/Groq).

### Instalación
1. Clonar el repositorio.
2. Levantar el contenedor:
   ```bash
   docker compose up -d --build
   ```
3. Escanear el código QR que aparecerá en los logs:
   ```bash
   docker compose logs -f bot
   ```

## 🧠 Orquestación de IA: El Valor Agregado

Este proyecto demuestra una habilidad avanzada en la **integración y sincronización de modelos de IA**. No se limita a llamadas simples a una API, sino que implementa una lógica de negocio donde la IA actúa como el cerebro de un sistema complejo:
- **Flujo de Decisión**: La IA decide cuándo una conversación es una venta cerrada basándose en el historial de mensajes del vendedor y cliente.
- **Contextualización**: Mantiene un caché de transcripciones para que la IA tenga memoria visual y auditiva de la charla.
- **Proactividad**: El sistema anticipa necesidades de seguimiento basándose en la data histórica procesada.

---
Creado por **Angel** - *Transformando conversaciones en datos estructurados y crecimiento.*
