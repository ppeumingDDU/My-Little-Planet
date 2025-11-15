#pragma once
#include <cmath>


struct Vec3 {
    float x, y, z;
};


inline Vec3 normalize(const Vec3& v) {
    float len = std::sqrt(v.x*v.x + v.y*v.y + v.z*v.z);

    return { v.x/len, v.y/len, v.z/len };
}


inline int hashInt(int x) {
    x = (x ^ 61) ^ (x >> 16);
    x = x + (x << 3);
    x = x ^ (x >> 4);
    x = x * 0x27d4eb2d;
    x = x ^ (x >> 15);
    
    return x;
}


inline float randomRange(int seed, float a, float b) {
    int h = hashInt(seed) & 0xffff;
    float t = h / 65535.0f;
    return a + t * (b - a);
}