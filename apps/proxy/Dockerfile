# Прокси Shalter — без зависимостей, только Node (типы с .ts снимает сам Node).
# Сборка из корня репозитория: docker build -t shalter-proxy apps/proxy
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/main.ts"]
