# Backend Dockerfile (NestJS)
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build && npm prune --omit=dev

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy only production files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

# Expose port
EXPOSE 4000

# Start the app (production)
CMD ["node", "dist/main.js"]
