# ==============================================================================
# Dockerfile para Hugging Face Spaces - WhatsApp Bridge El Arca Display Club
# ==============================================================================
FROM node:20-slim

# Instalar dependencias necesarias para bibliotecas nativas de Node
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar manifiesto de dependencias e instalarlas
COPY package.json ./
RUN npm install --production

# Copiar código del microservicio
COPY server.js ./

# Crear directorio de sesión local con permisos de escritura
RUN mkdir -p /app/auth_session && chmod -R 777 /app/auth_session

# Hugging Face Spaces utiliza el puerto 7860 por defecto
ENV PORT=7860
EXPOSE 7860

# Comando de inicio
CMD ["node", "server.js"]
