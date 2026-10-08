FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public
RUN mkdir /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
