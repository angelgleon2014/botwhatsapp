FROM node:20-slim

# Instalar dependencias necesarias para Chrome Y para compilar SQLite (python, make, g++)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    python3 \
    make \
    g++ \
    --no-install-recommends

# Instalar Chrome Estable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update && apt-get install -y \
    google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Rebuild sqlite3 from source in the container environment
RUN npm install

COPY . .

RUN chown -R node:node /app
USER node

CMD ["node", "index.js"]
