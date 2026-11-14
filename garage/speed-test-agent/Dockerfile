FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node _grant.mjs ./functions/api/speed-test/
COPY --chown=node:node server.mjs ./garage/speed-test-agent/
USER node
CMD ["node", "garage/speed-test-agent/server.mjs"]
