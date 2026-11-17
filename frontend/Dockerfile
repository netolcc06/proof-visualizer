# syntax=docker/dockerfile:1

# Build stage. `npm run build` downloads the official cvc5 wasm release from GitHub (scripts/fetch-cvc5.mjs).
# Offline alternative: put cvc5.js + cvc5.wasm in a folder inside the build context (e.g. ./cvc5-local) and pass
#   --build-arg CVC5_WASM_DIR=/app/cvc5-local
# veriT wasm (verit.js, verit.wasm, licences). Empty by default, so a standalone `docker build` works with veriT
# unavailable. docker-compose.yml overrides this stage with the named context `verit-dist` (wasm/verit/dist),
# or: docker build --build-context verit-dist=../wasm/verit/dist .
FROM scratch AS verit-dist

# Carcara wasm (carcara.js, carcara.wasm, licences) and the bundled RARE rules. Empty by default; compose supplies
# `carcara-dist` (wasm/carcara/dist) and `carcara-rare` (bridge/rare), or:
#   docker build --build-context carcara-dist=../wasm/carcara/dist --build-context carcara-rare=../bridge/rare .
FROM scratch AS carcara-dist
FROM scratch AS carcara-rare

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=verit-dist / /verit-wasm
COPY --from=carcara-dist / /carcara-wasm
COPY --from=carcara-rare / /carcara-rare
COPY . .
ARG CVC5_WASM_DIR=""
ENV CVC5_WASM_DIR=${CVC5_WASM_DIR}
ENV VERIT_WASM_DIR=/verit-wasm
ENV CARCARA_WASM_DIR=/carcara-wasm
ENV CARCARA_RARE_FILE=/carcara-rare/cvc5-rewrites.rare
RUN npm run build

# Static serving stage.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
