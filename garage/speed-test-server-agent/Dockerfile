FROM node:22-bookworm-slim
WORKDIR /app
# Supply the verified upstream v1.0.14 binary for the target Linux architecture.
COPY --chmod=0555 librespeed-cli /usr/local/bin/librespeed-cli
COPY --chown=node:node runner.mjs server.mjs ./
USER node
CMD ["node", "server.mjs"]
