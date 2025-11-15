#include "util.hpp"


struct NoiseParams {
    float macroFreq;
    float microFreq;
    float ridgeFreq;
    float amplitude;
    int octaves;
};


NoiseParams generateNoiseParams(int seed) {
    NoiseParams p;

    p.macroFreq = randomRange(seed + 10, 0.1f, 0.3f);
    p.microFreq = randomRange(seed + 20, 1.0f, 3.0f);
    p.ridgeFreq = randomRange(seed + 30, 0.8f, 2.2f);


    p.amplitude = randomRange(seed + 40, 0.08f, 0.15f);
    p.octaves = (int)randomRange(seed + 50, 3, 6);


    return p;
}