#include "util.hpp"

float perlin(const Vec3& p, int seed);


float fbm(const Vec3& p, float freq, int octaves, int seed) {
    float value = 0.0f;
    float amp = 1.0f;
    float f = freq;

    for (int i = 0; i < octaves; i++) {
        value += perlin({p.x*f, p.y*f, p.z*f}, seed + i) * amp;
        f *= 2.0f;
        amp *= 0.5f;
    }
    
    return value;
}


float ridged(const Vec3& p, float freq, int seed) {
    float n = perlin({p.x * freq, p.y * freq, p.z * freq}, seed);
    
    return 1.0f - std::abs(n);
}