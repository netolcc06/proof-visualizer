# syntax=docker/dockerfile:1
# veriT 2026.05 -> WebAssembly (emscripten). Build:
#   docker build -t pv-verit-wasm .
#   docker run --rm -v "$PWD/dist:/out" pv-verit-wasm   # or: docker build -o dist --target dist .
FROM emscripten/emsdk:6.0.8 AS build

ARG GMP_VERSION=6.3.0
ARG GMP_SHA256=a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898
ARG VERIT_VERSION=2026.05
ARG VERIT_SHA256=c0d3754b599d02c0443590640ecefbd2ddf5603b7adcd8fbdfb31b84e59cc2f1

RUN apt-get update && apt-get install -y --no-install-recommends flex bison m4 xz-utils \
    && rm -rf /var/lib/apt/lists/*

# GMP, static, no assembly
WORKDIR /build/gmp
RUN curl -fsSL -o gmp.tar.xz "https://ftp.gnu.org/gnu/gmp/gmp-${GMP_VERSION}.tar.xz" \
    && echo "${GMP_SHA256}  gmp.tar.xz" | sha256sum -c - \
    && tar xJf gmp.tar.xz --strip-components=1 \
    && emconfigure ./configure --host=none --disable-assembly --enable-static --disable-shared \
         --prefix=/opt/gmp CFLAGS="-O2" \
    && emmake make -j"$(nproc)" && emmake make install

# veriT
WORKDIR /build/verit
RUN curl -fsSL -o verit.tar.gz "https://www.verit-solver.org/download/${VERIT_VERSION}/verit-${VERIT_VERSION}.tar.gz" \
    && echo "${VERIT_SHA256}  verit.tar.gz" | sha256sum -c - \
    && tar xzf verit.tar.gz --strip-components=1
COPY patches/ /build/patches/
RUN cat /build/patches/*.patch | patch -p1

ENV VERIT_LDFLAGS="-L/opt/gmp/lib -O2 \
 -sMODULARIZE=1 -sEXPORT_NAME=createVeriT -sENVIRONMENT=web,worker,node \
 -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=callMain,FS -sFORCE_FILESYSTEM=1 \
 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=5MB \
 -sEXIT_RUNTIME=1"
RUN emconfigure ./configure CFLAGS="-O2 -I/opt/gmp/include" CPPFLAGS="-I/opt/gmp/include" LDFLAGS="-L/opt/gmp/lib" \
    && emmake make -j"$(nproc)" LDFLAGS="$VERIT_LDFLAGS" \
    && mkdir -p /out && ls -la veriT* \
    && cp veriT /out/verit.js && cp veriT.wasm /out/verit.wasm

# Licence texts shipped next to the binaries: veriT, its bundled NetBSD qsort notice, and GMP.
RUN cp /build/verit/LICENSE /out/LICENSE-veriT.txt     && sed -n '/^\/\*-/,/^ \*\//p' /build/verit/src/utils/veriT-qsort.c > /out/LICENSE-veriT-qsort-BSD.txt     && test -s /out/LICENSE-veriT-qsort-BSD.txt     && for f in COPYING COPYING.LESSERv3 COPYINGv2 COPYINGv3; do cp /build/gmp/$f /out/GMP-$f.txt; done

FROM scratch AS dist
COPY --from=build /out/ /
