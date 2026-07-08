FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Accept build args for NEXT_PUBLIC_ vars (baked into bundle at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_GENLAYER_ENDPOINT=https://rpc-bradbury.genlayer.com
ARG NEXT_PUBLIC_CONTRACT_ADDRESS=0x5c5C18e0B7bD4EfF63C89C7077DAA64f2F4356d1
ARG DOCKER_BUILD=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_GENLAYER_ENDPOINT=$NEXT_PUBLIC_GENLAYER_ENDPOINT
ENV NEXT_PUBLIC_CONTRACT_ADDRESS=$NEXT_PUBLIC_CONTRACT_ADDRESS
ENV DOCKER_BUILD=$DOCKER_BUILD
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
