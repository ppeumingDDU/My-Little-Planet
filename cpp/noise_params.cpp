// noise_params.cpp
#include "util.hpp"

// This struct matches the parameters used by planet.cpp
struct NoiseParams {
    float macroFreq;
    int   macroOctaves;
    float macroAmp;

    float microFreq;
    int   microOctaves;
    float microAmp;

    float ridgeFreq;
    int   ridgeOctaves;
    float ridgeAmp;

    float lacunarity;
    float gain;
};

// generateNoiseParams(seed) -> deterministic params for a seed
inline float r(uint32_t seed, uint32_t salt, float a, float b) {
    return randomRange(seed, salt, a, b);
}

NoiseParams generateNoiseParams(uint32_t seed) {
    NoiseParams p;
    // macro (continent) scales
    p.macroFreq = r(seed, 11, 0.03f, 0.18f);       // large-scale continent size
    p.macroOctaves = (int)r(seed, 12, 2.0f, 5.0f);
    p.macroAmp = r(seed, 13, 0.6f, 1.6f);

    // micro (detail)
    p.microFreq = r(seed, 21, 0.8f, 3.0f);
    p.microOctaves = (int)r(seed, 22, 2.0f, 6.0f);
    p.microAmp = r(seed, 23, 0.05f, 0.5f);

    // ridge (mountain)
    p.ridgeFreq = r(seed, 31, 0.6f, 2.5f);
    p.ridgeOctaves = (int)r(seed, 32, 1.0f, 4.0f);
    p.ridgeAmp = r(seed, 33, 0.2f, 1.2f);

    // general fBm params
    p.lacunarity = r(seed, 41, 1.8f, 2.2f);
    p.gain = r(seed, 42, 0.35f, 0.6f);

    return p;
}
