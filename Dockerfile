FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
