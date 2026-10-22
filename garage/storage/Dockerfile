FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --chown=node:node package.json ./

RUN npm install --omit=dev \
    && npm cache clean --force

COPY --chown=node:node src ./src

RUN mkdir -p /app/data \
    && chown node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "src/index.js"]
