FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
ENV NODE_ENV=production
ENV PORT=8091
EXPOSE 8091
USER node
CMD ["node", "server.js"]
