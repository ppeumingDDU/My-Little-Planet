#!/usr/bin/env bash
set -e

SRC1=noise.cpp
SRC2=noise_params.cpp
SRC3=planet.cpp

OUT_DIR=web
mkdir -p ${OUT_DIR}

emcc \
  ${SRC1} ${SRC2} ${SRC3} \
  -O3 -std=c++17 \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS="['_init_planet','_get_height','_get_final_position']" \
  -s EXTRA_EXPORTED_RUNTIME_METHODS="['cwrap','getValue']" \
  -o ${OUT_DIR}/planet.js

echo "Build complete: ${OUT_DIR}/planet.js + ${OUT_DIR}/planet.wasm"
