FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node /root/garage/speed-test-agent/_grant.mjs ./functions/api/speed-test/
COPY --chown=node:node /root/garage/speed-test-agent/server.mjs ./garage/speed-test-agent/
COPY --chown=node:node /root/garage/speed-test-public-agent/server.mjs ./garage/speed-test-public-agent/
USER node
CMD ["node", "garage/speed-test-public-agent/server.mjs"]
