# ---------- Stage 1: builder (compile TS + install deps prod) ----------
FROM node:20-alpine AS builder
WORKDIR /work

# copy file yang dibutuhkan untuk build
COPY package*.json ./
COPY tsconfig.json ./
# (opsional) kalau memang dipakai:
# COPY babel.config.js ./
# COPY jest.config.ts ./

COPY src ./src
# COPY tests ./tests   # kalau tidak dipakai, skip saja

# 1) install semua deps (termasuk dev) untuk compile
RUN npm ci

# 2) compile ke dist
RUN npx tsc

# 3) copy aset non-TS ke dist
RUN cp src/redis.svg dist/ || true
RUN cp src/*.node.json dist/ || true

# 4) prune dev deps agar node_modules jadi production-only
RUN npm prune --omit=dev

# ---------- Stage 2: runtime n8n ----------
FROM n8nio/n8n:1.92.2

ENV HOME=/home/node \
    XDG_CACHE_HOME=/home/node/.cache \
    N8N_CUSTOM_EXTENSIONS=/custom \
    NODE_ENV=production \
    N8N_RUNNERS_ENABLED=true \
    N8N_USER_FOLDER=/home/node \
    N8N_BINARY_DATA_MODE=filesystem

USER root

# Pastikan tidak ada file bernama ".cache" yang mengganggu
RUN rm -f /home/node/.cache || true

USER node

RUN mkdir -p /home/node/.cache/n8n/public

# Paket custom node kamu (tanpa npm install di runtime)
WORKDIR /custom/redis-stream-trigger
COPY --chown=node:node --from=builder /work/package*.json ./
COPY --chown=node:node --from=builder /work/dist ./dist
COPY --chown=node:node --from=builder /work/node_modules ./node_modules

WORKDIR /home/node
EXPOSE 5678


