// util.hpp
#pragma once
#include <cmath>
#include <cstdint>

// -------------------------------
// 3D vector helper
// -------------------------------
struct Vec3 {
    float x, y, z;
    Vec3(): x(0), y(0), z(0) {}
    Vec3(float X, float Y, float Z): x(X), y(Y), z(Z) {}
};

// normalize vector (if zero-length returns zero-vector)
inline Vec3 normalize(const Vec3& v) {
    float len = std::sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    if (len <= 1e-9f) return Vec3(0.0f, 0.0f, 0.0f);
    return Vec3(v.x/len, v.y/len, v.z/len);
}

// linear interpolation
inline float lerp(float a, float b, float t) {
    return a + t * (b - a);
}

// clamp for floats (portable if std::clamp not present)
inline float clampf(float v, float lo, float hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

// smoothstep (edge blending)
inline float smoothstep(float edge0, float edge1, float x) {
    float t = clampf((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
    return t * t * (3.0f - 2.0f * t);
}

// simple 32-bit integer hash (deterministic)
inline uint32_t hash32(uint32_t x) {
    x = (x ^ 61u) ^ (x >> 16u);
    x = x + (x << 3u);
    x = x ^ (x >> 4u);
    x = x * 0x27d4eb2du;
    x = x ^ (x >> 15u);
    return x;
}

// deterministic 0..1 float from seed+salt
inline float hash01(uint32_t seed, uint32_t salt = 0) {
    uint32_t v = hash32(seed + salt);
    // take lower 24 bits -> fraction
    return (v & 0xFFFFFFu) / float(0x1000000u);
}

// map seed->float in [a,b]
inline float randomRange(uint32_t seed, uint32_t salt, float a, float b) {
    return a + (b - a) * hash01(seed, salt);
}
