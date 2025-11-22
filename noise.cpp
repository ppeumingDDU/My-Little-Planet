// noise.cpp
// Implements a Perlin-like permutation based noise with fBm and ridged helpers.
// This file exposes:
//   void initNoise(uint32_t seed);
//   float perlin(float x, float y, float z);   // returns roughly in [-1,1]
//   float fbm(float x,y,z, int octaves, float lacunarity, float gain); // 0..~1
//   float ridged_fbm(float x,y,z, int octaves, float lacunarity, float gain); // >=0

#include "util.hpp"
#include <algorithm>
#include <numeric>
#include <random>
#include <cmath>
#include <cstdint>

// permutation table (512 entries)
static int perm_table[512];
static bool perm_inited = false;

// Initialize the permutation table using the given seed
void initNoise(uint32_t seed) {
    // initialize 0..255
    for (int i = 0; i < 256; ++i) perm_table[i] = i;
    // shuffle
    std::mt19937 rng(seed);
    std::shuffle(perm_table, perm_table + 256, rng);
    // duplicate
    for (int i = 0; i < 256; ++i) perm_table[256 + i] = perm_table[i];
    perm_inited = true;
}

// fade function for Perlin
static inline float fadef(float t) {
    return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}
static inline float lerpf(float a, float b, float t) { return a + t*(b-a); }

// gradient
static inline float grad(int hash, float x, float y, float z) {
    int h = hash & 15;
    float u = h < 8 ? x : y;
    float v = h < 4 ? y : (h == 12 || h == 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

// Perlin noise - returns approximately in [-1,1]
float perlin(float x, float y, float z) {
    if (!perm_inited) initNoise(0); // default seed if not initialized

    int X = static_cast<int>(std::floor(x)) & 255;
    int Y = static_cast<int>(std::floor(y)) & 255;
    int Z = static_cast<int>(std::floor(z)) & 255;

    x -= std::floor(x);
    y -= std::floor(y);
    z -= std::floor(z);

    float u = fadef(x);
    float v = fadef(y);
    float w = fadef(z);

    int A  = perm_table[X] + Y;
    int AA = perm_table[A] + Z;
    int AB = perm_table[A + 1] + Z;
    int B  = perm_table[X + 1] + Y;
    int BA = perm_table[B] + Z;
    int BB = perm_table[B + 1] + Z;

    float res = lerpf(
        lerpf(
            lerpf(grad(perm_table[AA], x, y, z),
                 grad(perm_table[BA], x - 1.0f, y, z), u),
            lerpf(grad(perm_table[AB], x, y - 1.0f, z),
                 grad(perm_table[BB], x - 1.0f, y - 1.0f, z), u),
            v),
        lerpf(
            lerpf(grad(perm_table[AA + 1], x, y, z - 1),
                 grad(perm_table[BA + 1], x - 1.0f, y, z - 1), u),
            lerpf(grad(perm_table[AB + 1], x, y - 1.0f, z - 1),
                 grad(perm_table[BB + 1], x - 1.0f, y - 1.0f, z - 1), u),
            v),
        w
    );

    // return raw in [-1,1]
    return res;
}

// fBm: sum of octaves of perlin; normalized roughly to [0,1]
float fbm(float x, float y, float z, int octaves, float lacunarity, float gain) {
    float amplitude = 1.0f;
    float frequency = 1.0f;
    float sum = 0.0f;
    float maxAmp = 0.0f;

    for (int i = 0; i < octaves; ++i) {
        float n = perlin(x * frequency, y * frequency, z * frequency);
        n = n * 0.5f + 0.5f; // map to [0,1]
        sum += n * amplitude;
        maxAmp += amplitude;

        amplitude *= gain;      // typically <1, e.g. 0.5
        frequency *= lacunarity; // typically >1, e.g. 2
    }
    if (maxAmp == 0.0f) return 0.0f;
    return sum / maxAmp;
}

// ridged multifractal fBm: produces sharp ridges
float ridged_fbm(float x, float y, float z, int octaves, float lacunarity, float gain) {
    float sum = 0.0f;
    float frequency = 1.0f;
    float amplitude = 1.0f;
    float weight = 1.0f;

    for (int i = 0; i < octaves; ++i) {
        float n = perlin(x * frequency, y * frequency, z * frequency);
        n = 1.0f - std::fabs(n); // make ridges (0..1)
        n *= n; // sharpen
        n *= weight;
        sum += n * amplitude;

        // weight modulates the next octave contribution (classic ridged)
        weight = clampf(n * gain, 0.0f, 1.0f);
        frequency *= lacunarity;
        amplitude *= 0.5f;
    }
    return sum;
}
