FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
# The live host fronts this container with a reverse proxy that appends the
# real client address to X-Forwarded-For; per-IP rate limits key off it.
# NEVER set this on a bare deployment - the header is client-authored there.
ENV TRUST_PROXY=1
EXPOSE 8080
USER node
CMD ["node", "server.js"]
