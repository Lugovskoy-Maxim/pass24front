# Frontend Dockerfile (Next.js)
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN mkdir -p public
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy only what is needed
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose port
EXPOSE 3000

# Start the app (0.0.0.0 required for Docker port forwarding)
ENV HOSTNAME=0.0.0.0
CMD ["npm", "run", "start"]
