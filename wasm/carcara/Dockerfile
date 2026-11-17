# syntax=docker/dockerfile:1
# Carcara -> WebAssembly (emscripten). Build:
#   docker build -o dist --target dist .      # writes dist/carcara.js, dist/carcara.wasm and the licence texts
# Approach: netolcc06/carcara-wasm and ufmg-smite/carcara#149 (Rust target wasm32-unknown-emscripten + GMP built with emcc).
FROM emscripten/emsdk:6.0.8 AS build

ARG GMP_VERSION=6.3.0
ARG GMP_SHA256=a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898
# Same commit as bridge/Dockerfile, so the native bridge and the wasm build behave alike.
ARG CARCARA_REV=20bf49c5ce31089ac83118574c888669355aaae1
# Carcara's rust-toolchain.toml says 1.93; pinned to its latest patch release.
ARG RUST_VERSION=1.93.1
ARG RUSTUP_VERSION=1.28.2
ARG RUSTUP_SHA256=20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c
ARG PROFILE=release-lto

RUN apt-get update && apt-get install -y --no-install-recommends m4 xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Rust toolchain with the emscripten target. RUSTUP_TOOLCHAIN also overrides the repo's rust-toolchain.toml.
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH RUSTUP_TOOLCHAIN=${RUST_VERSION}
RUN curl -fsSL -o /tmp/rustup-init "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init" \
    && echo "${RUSTUP_SHA256}  /tmp/rustup-init" | sha256sum -c - \
    && chmod +x /tmp/rustup-init \
    && /tmp/rustup-init -y --profile minimal --default-toolchain "${RUST_VERSION}" --target wasm32-unknown-emscripten \
    && rm /tmp/rustup-init \
    && rustc --version && cargo --version

# GMP, static, no assembly (same recipe as wasm/verit)
WORKDIR /build/gmp
RUN curl -fsSL -o gmp.tar.xz "https://ftp.gnu.org/gnu/gmp/gmp-${GMP_VERSION}.tar.xz" \
    && echo "${GMP_SHA256}  gmp.tar.xz" | sha256sum -c - \
    && tar xJf gmp.tar.xz --strip-components=1 \
    && emconfigure ./configure --host=none --disable-assembly --enable-static --disable-shared \
         --prefix=/opt/gmp CFLAGS="-O2" \
    && emmake make -j"$(nproc)" && emmake make install

# Carcara at the pinned commit, with the Cargo.toml patch
WORKDIR /build/carcara
RUN git init -q . && git remote add origin https://github.com/ufmg-smite/carcara.git \
    && git fetch -q --depth 1 origin "${CARCARA_REV}" && git checkout -q FETCH_HEAD \
    && test "$(git rev-parse HEAD)" = "${CARCARA_REV}"
COPY patches/ /build/patches/
RUN cat /build/patches/*.patch | patch -p1
# Explicit mode: checkouts on Windows or with core.fileMode=false lose the executable bit
COPY --chmod=0755 emcc-run.sh build.sh /opt/carcara-build/

# Cargo registry/git and the target dir are build caches only; the artifacts are copied out in the same RUN.
RUN --mount=type=cache,target=/opt/cargo/registry \
    --mount=type=cache,target=/opt/cargo/git \
    --mount=type=cache,target=/build/carcara/target \
    GMP_WASM_PREFIX=/opt/gmp PROFILE="${PROFILE}" OUT=/out /opt/carcara-build/build.sh \
    && ls -la /out

# Licence texts shipped next to the binaries: Carcara (Apache-2.0), its NOTICE if any, and GMP.
RUN cp /build/carcara/LICENSE /out/LICENSE-Carcara.txt \
    && if [ -f /build/carcara/NOTICE ]; then cp /build/carcara/NOTICE /out/NOTICE-Carcara.txt; fi \
    && for f in COPYING COPYING.LESSERv3 COPYINGv2 COPYINGv3; do cp /build/gmp/$f /out/GMP-$f.txt; done

FROM scratch AS dist
COPY --from=build /out/ /
