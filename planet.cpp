// planet.cpp - Full Example Combining Previous Explanations
// ---------------------------------------------------------
// This file demonstrates a typical structure for procedural planet generation
// in C++ for compilation with WebAssembly (Emscripten).
// It includes:
//   - Sphere sampling (lat/lon -> vec3)
//   - Noise (Simplex stub, fBm)
//   - Height generation
//   - Public API for JS

#include <vector>
#include <cmath>
#include <algorithm>
#include "noise.hpp" // Simplex/Perlin implementation (separate file)
#include <emscripten/bind.h>

//------------------------------------------------------
// Vector3 structure
//------------------------------------------------------
struct Vec3 {
    float x, y, z;
};

//------------------------------------------------------
// Convert (x, y) pixel to sphere normal vector
//------------------------------------------------------
Vec3 sampleSphere(int x, int y, int size) {
    float u = (float)x / (float)size; // 0~1
    float v = (float)y / (float)size; // 0~1

    float lon = u * 2.0f * M_PI; // longitude
    float lat = v * M_PI;        // latitude

    Vec3 n;
    n.x = cosf(lon) * sinf(lat);
    n.y = cosf(lat);
    n.z = sinf(lon) * sinf(lat);
    return n;
}

//------------------------------------------------------
// fBm Noise (simple fractal noise)
//------------------------------------------------------
float fbm(const Vec3& p, int octaves, float scale, float persistence) {
    float sum = 0.0f;
    float amp = 1.0f;
    float freq = 1.0f;

    for (int i = 0; i < octaves; i++) {
        sum += amp * simplexNoise(p.x * freq * scale,
                                  p.y * freq * scale,
                                  p.z * freq * scale);
        freq *= 2.0f;
        amp  *= persistence;
    }
    return sum;
}

//------------------------------------------------------
// Ridge Noise (sharp mountains)
//------------------------------------------------------
float ridge(const Vec3& p, float scale) {
    float n = simplexNoise(p.x * scale, p.y * scale, p.z * scale);
    return 1.0f - fabsf(n);
}

//------------------------------------------------------
// Final height computation
//------------------------------------------------------
float computeHeight(const Vec3& n, float baseScale, float mountainScale, float ridgeScale) {
    // Large-scale continents
    float continent = fbm(n, 4, baseScale, 0.5f) * 1.5f;

    // Mountain ranges
    float mountain = powf(fbm(n, 5, mountainScale, 0.45f), 3.0f) * 0.5f;

    // Ridges
    float r = ridge(n, ridgeScale) * 0.3f;

    float height = continent + mountain + r;

    float seaLevel = 0.4f;
    height -= seaLevel;

    return std::max(-1.0f, std::min(height, 1.0f));
}

//------------------------------------------------------
// PlanetGenerator
//------------------------------------------------------
class PlanetGenerator {
public:
    PlanetGenerator(int seed, int size, float baseScale, float mountainScale, float ridgeScale)
        : seed(seed), size(size), baseScale(baseScale), mountainScale(mountainScale), ridgeScale(ridgeScale)
    {
        setNoiseSeed(seed);
        heightmap.resize(size * size);
    }

    void generate() {
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                Vec3 n = sampleSphere(x, y, size);
                float h = computeHeight(n, baseScale, mountainScale, ridgeScale);
                heightmap[y * size + x] = h;
            }
        }
    }

    emscripten::val getHeightmap() {
        return emscripten::val(emscripten::typed_memory_view(heightmap.size(), heightmap.data()));
    }

private:
    int seed;
    int size;
    float baseScale;
    float mountainScale;
    float ridgeScale;
    std::vector<float> heightmap;
};

//------------------------------------------------------
// Bindings
//------------------------------------------------------
EMSCRIPTEN_BINDINGS(planet_module) {
    emscripten::class_<PlanetGenerator>("PlanetGenerator")
        .constructor<int, int, float, float, float>()
        .function("generate", &PlanetGenerator::generate)
        .function("getHeightmap", &PlanetGenerator::getHeightmap);
}
