# syntax=docker/dockerfile:1.6

FROM node:20-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server.js ./
COPY content ./content
COPY examples ./examples
COPY readme.md ./readme.md
RUN chown -R node:node /app

USER node

ENV insecure=true \
    port=8080
EXPOSE 8080

CMD ["node", "server.js"]
