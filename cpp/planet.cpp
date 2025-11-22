// planet.cpp
#include "util.hpp"

// forward declarations of noise functions implemented in noise.cpp
// (these are C++ functions in the same translation unit when linked)
void initNoise(uint32_t seed); // initialize permutation
float perlin(float x, float y, float z);
float fbm(float x, float y, float z, int octaves, float lacunarity, float gain);
float ridged_fbm(float x, float y, float z, int octaves, float lacunarity, float gain);

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

// parameters generator
NoiseParams generateNoiseParams(uint32_t seed);

// keep state (global for simplicity / matches your original layout)
extern "C" {
    static NoiseParams PARAMS;
    static uint32_t GLOBAL_SEED = 0;
    static float GLOBAL_SCALE = 1.0f;   // user amplitude scale
    static float GLOBAL_RADIUS = 1.0f;  // planet base radius

    // Initialize the planet generator with a seed, a scale (height multiplier), and base radius
    // - seed: deterministic key for generating noise params & permutation
    // - scale: multiplies final height values
    // - radius: base radius of planet (mesh radius)
    void init_planet(int seed, float scale, float radius) {
        GLOBAL_SEED = static_cast<uint32_t>(seed);
        GLOBAL_SCALE = scale;
        GLOBAL_RADIUS = radius;

        // initialize permutation table in noise module
        initNoise(GLOBAL_SEED);

        // derive noise parameters deterministically from seed
        PARAMS = generateNoiseParams(GLOBAL_SEED);
    }

    // compute signed height for direction (x,y,z) where x,y,z are coordinates on unit sphere (or approximated)
    // returns signed height value (negative -> below sea level)
    float get_height(float x, float y, float z) {
        // normalize input direction to use consistent sampling
        Vec3 n = normalize(Vec3(x, y, z));

        // 1) Macro continent shape (fBm gives 0..1 roughly; scale by macroAmp)
        float macro = fbm(n.x * PARAMS.macroFreq,
                          n.y * PARAMS.macroFreq,
                          n.z * PARAMS.macroFreq,
                          PARAMS.macroOctaves,
                          PARAMS.lacunarity,
                          PARAMS.gain) * PARAMS.macroAmp;

        // 2) Micro details
        float micro = fbm(n.x * PARAMS.microFreq,
                          n.y * PARAMS.microFreq,
                          n.z * PARAMS.microFreq,
                          PARAMS.microOctaves,
                          PARAMS.lacunarity,
                          PARAMS.gain) * PARAMS.microAmp;

        // 3) Ridged mountains (sharp peaks)
        float ridge = ridged_fbm(n.x * PARAMS.ridgeFreq,
                                 n.y * PARAMS.ridgeFreq,
                                 n.z * PARAMS.ridgeFreq,
                                 PARAMS.ridgeOctaves,
                                 PARAMS.lacunarity,
                                 PARAMS.gain) * PARAMS.ridgeAmp;

        // 4) continent mask – only apply mountains where macro indicates land
        // create smooth mask from macro: values near threshold produce smooth coastline
        float continentMask = smoothstep(0.35f, 0.65f, macro); // 0..1

        // 5) latitudinal (polar) modifier — simple polar effect to add ice/plateau
        float lat = std::fabs(n.y); // 0 at equator, 1 at poles
        float polarBoost = smoothstep(0.6f, 0.95f, lat) * 0.08f; // small added height near poles

        // 6) combine with weights (tweakable)
        float height = macro * 0.65f      // main shape
                     + micro * 0.30f     // details
                     + ridge * continentMask * 0.6f // mountains only on continents
                     + polarBoost;

        // 7) set sea level baseline (shift)
        const float seaLevel = 0.45f; // bigger -> more ocean
        height -= seaLevel;

        // 8) apply global scaling (user control)
        height *= GLOBAL_SCALE;

        return height; // signed height relative to radius
    }

    // compute final displaced 3D position for a sphere vertex (expects input roughly normalized)
    // writes to outX/outY/outZ
    void get_final_position(float x, float y, float z,
                            float* outX, float* outY, float* outZ) {
        Vec3 n = normalize(Vec3(x,y,z));
        float h = get_height(n.x, n.y, n.z);
        float r = GLOBAL_RADIUS + h; // final radius = base radius + height
        *outX = n.x * r;
        *outY = n.y * r;
        *outZ = n.z * r;
    }
} // extern "C"
