#!/usr/bin/env bash
set -e

SRC1=cpp/noise.cpp
SRC2=cpp/noise_params.cpp
SRC3=cpp/planet.cpp

OUT_DIR=web
mkdir -p ${OUT_DIR}

emcc \
  ${SRC1} ${SRC2} ${SRC3} \
  -O3 -std=c++17 \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORTED_FUNCTIONS="['_init_planet','_get_height','_get_final_position']" \
  -s EXPORTED_RUNTIME_METHODS="['cwrap','getValue']" \
  -o ${OUT_DIR}/planet.js

echo "Build complete"
