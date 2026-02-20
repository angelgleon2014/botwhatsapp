FROM ghcr.io/puppeteer/puppeteer:21.0.0

WORKDIR /app

USER root

# Desactivar repositorios fallidos de Google
RUN rm -f /etc/apt/sources.list.d/google.list

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# En Docker, correr como root evita los problemas de permisos con volúmenes montados de Linux
USER root

CMD ["sh", "-c", "rm -f /app/session/session/SingletonLock && node index.js"]
