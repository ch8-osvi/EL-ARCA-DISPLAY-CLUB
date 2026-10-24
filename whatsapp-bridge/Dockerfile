FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js security.js auth-store.js ./
RUN mkdir -p /app/auth_session /app/spool && chown -R node:node /app
USER node
ENV PORT=7860
CMD ["node", "server.js"]
