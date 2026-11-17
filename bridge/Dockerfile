# syntax=docker/dockerfile:1
# Bridge image: Node server + cvc5, veriT and Carcara at pinned, verified versions.
#   docker build -t pv-bridge --target runtime .
# The `test` stage needs the frontend fixtures as an extra context:
#   docker build --target test --build-context fixtures=../frontend/src/alethe/__fixtures__ .

# cvc5 1.4.2 (static release)
FROM debian:bookworm-slim AS cvc5
ARG CVC5_VERSION=1.4.2
ARG CVC5_SHA256=7eb18f8c814c36a46c5a7d003983e9cfbc4b0a9828d6dd596239291bd4cc61d8
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/cvc5
RUN curl -fsSL -o cvc5.zip "https://github.com/cvc5/cvc5/releases/download/cvc5-${CVC5_VERSION}/cvc5-Linux-x86_64-static.zip" \
    && echo "${CVC5_SHA256}  cvc5.zip" | sha256sum -c - \
    && unzip -q cvc5.zip \
    && install -m 0755 cvc5-Linux-x86_64-static/bin/cvc5 /usr/local/bin/cvc5 \
    && /usr/local/bin/cvc5 --version

# veriT 2026.05 (from source)
FROM debian:bookworm-slim AS verit
ARG VERIT_VERSION=2026.05
ARG VERIT_SHA256=c0d3754b599d02c0443590640ecefbd2ddf5603b7adcd8fbdfb31b84e59cc2f1
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl libgmp-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/verit
RUN curl -fsSL -o verit.tar.gz "https://www.verit-solver.org/download/${VERIT_VERSION}/verit-${VERIT_VERSION}.tar.gz" \
    && echo "${VERIT_SHA256}  verit.tar.gz" | sha256sum -c - \
    && tar xzf verit.tar.gz --strip-components=1 \
    && ./configure \
    && make -j"$(nproc)" \
    && install -m 0755 veriT /usr/local/bin/veriT

# Carcara (pinned commit; rust 1.93 per its rust-toolchain.toml). GMP is built from source by gmp-mpfr-sys.
FROM rust:1.93-bookworm AS carcara
ARG CARCARA_REV=20bf49c5ce31089ac83118574c888669355aaae1
RUN apt-get update && apt-get install -y --no-install-recommends m4 make gcc \
    && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/tmp/target \
    CARGO_TARGET_DIR=/tmp/target cargo install --locked --root /opt/carcara         --git https://github.com/ufmg-smite/carcara.git --rev "${CARCARA_REV}" carcara

# Runtime
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgmp10 curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=cvc5 /usr/local/bin/cvc5 /usr/local/bin/cvc5
COPY --from=verit /usr/local/bin/veriT /usr/local/bin/veriT
COPY --from=carcara /opt/carcara/bin/carcara /usr/local/bin/carcara
RUN cvc5 --version | head -n 1 && veriT --version && carcara --version

WORKDIR /app/bridge
COPY package.json ./
COPY src ./src
COPY rare ./rare
ENV HOST=0.0.0.0 PORT=4000 \
    CVC5_PATH=/usr/local/bin/cvc5 VERIT_PATH=/usr/local/bin/veriT CARCARA_PATH=/usr/local/bin/carcara
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "src/server.ts"]

# Tests against the real tools
FROM runtime AS test
USER root
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY test ./test
COPY --from=fixtures . /app/frontend/src/alethe/__fixtures__
RUN chown -R node:node /app
USER node
ENV PV_TEST_CVC5=/usr/local/bin/cvc5 PV_TEST_VERIT=/usr/local/bin/veriT PV_TEST_CARCARA=/usr/local/bin/carcara
CMD ["sh", "-c", "npm run typecheck && npm test"]
