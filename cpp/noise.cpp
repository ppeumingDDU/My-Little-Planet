// noise.cpp
// -------------------------------------------------------------
// 이 파일은 “Perlin 노이즈 + fBm + Ridged 노이즈”를 구현한 곳이다.
//
// 이 3가지 노이즈는 행성의 지형이 자연스럽게 보이도록 만드는 핵심 알고리즘이다.
//
// 제공되는 함수:
//   void initNoise(uint32_t seed);
//     → 노이즈 계산에 필요한 무작위 테이블을 seed로 초기화한다.
//
//   float perlin(float x, float y, float z);
//     → Perlin 노이즈. -1~1 사이 값을 반환.
//       지형의 기본적인 울퉁불퉁함을 만든다.
//
//   float fbm(...);
//     → 여러 개의 Perlin을 합친 형태. 0~1 사이 값.
//       “자연스러운 산·골짜기 패턴”을 만들 때 사용.
//
//   float ridged_fbm(...);
//     → 산맥처럼 날카로운 능선을 만드는 특수 노이즈.
// -------------------------------------------------------------

#include "util.hpp"
#include <algorithm>
#include <numeric>
#include <random>
#include <cmath>
#include <cstdint>

// -------------------------------------------------------------
// permutation table: 퍼뮤테이션 테이블(길이 512)
//
// Perlin 노이즈는 내부적으로 0~255 사이 숫자들을 섞어서 사용한다.
// 이 섞인 값은 “행성이 어떤 모양이 될지” 무작위성을 부여하는 역할을 한다.
//
// 256개 테이블을 두 번 복사하여 512개로 만든 이유는
// 인덱싱 편의를 위해서다.
// -------------------------------------------------------------
static int perm_table[512];
static bool perm_inited = false;

// -------------------------------------------------------------
// initNoise(seed)
// -------------------------------------------------------------
// seed 값을 이용해 노이즈용 무작위 순서 테이블을 만든다.
// seed가 동일하면 항상 같은 랜덤 테이블이 만들어져서
// → 같은 행성이 다시 만들어질 수 있다.
// -------------------------------------------------------------
void initNoise(uint32_t seed) {
    // 0~255 정렬된 상태로 시작
    for (int i = 0; i < 256; ++i) perm_table[i] = i;

    // seed 기반으로 섞기(랜덤 셔플)
    std::mt19937 rng(seed);
    std::shuffle(perm_table, perm_table + 256, rng);

    // 두 번 복사해 512개 테이블 만들기
    for (int i = 0; i < 256; ++i) perm_table[256 + i] = perm_table[i];

    perm_inited = true;
}

// -------------------------------------------------------------
// fadef
// -------------------------------------------------------------
// Perlin 노이즈 내부에서 사용되는 “부드러움 곡선 함수”.
// 값이 갑자기 바뀌지 않고 자연스럽게 이어지도록 만든다.
//
// 6t^5 - 15t^4 + 10t^3  형태의 곡선을 사용한다.
// -------------------------------------------------------------
static inline float fadef(float t) {
    return t * t * t * (t * (t * 6.0f - 15.0f) + 10.0f);
}

// 보간(두 값 사이 중간값)
static inline float lerpf(float a, float b, float t) { return a + t*(b-a); }

// -------------------------------------------------------------
// grad()
// -------------------------------------------------------------
// Perlin 노이즈의 핵심: “격자 점의 방향 벡터”를 선택하여
// 입력 좌표(x,y,z)와의 점곱을 통해 값을 만든다.
// -------------------------------------------------------------
static inline float grad(int hash, float x, float y, float z) {
    int h = hash & 15;
    float u = h < 8 ? x : y;
    float v = h < 4 ? y : (h == 12 || h == 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

// -------------------------------------------------------------
// perlin(x,y,z)
// -------------------------------------------------------------
// 3D Perlin 노이즈 구현.
// 자연스러운 패턴을 만드는 데 널리 쓰는 노이즈.
//
// 특징:
//   - 결과값은 -1 ~ 1
//   - 매끄럽고 구름 같은 패턴
//   - 반복성이 없고 자연스럽다
// -------------------------------------------------------------
float perlin(float x, float y, float z) {
    if (!perm_inited) initNoise(0); // 만약 initPlanet를 안 부르면 기본 seed 사용

    // 입력 좌표의 정수 부분(격자 위치)
    int X = static_cast<int>(std::floor(x)) & 255;
    int Y = static_cast<int>(std::floor(y)) & 255;
    int Z = static_cast<int>(std::floor(z)) & 255;

    // 소수점 부분만 남겨 “격자 안에서의 위치”를 구함
    x -= std::floor(x);
    y -= std::floor(y);
    z -= std::floor(z);

    // fade 곡선 적용
    float u = fadef(x);
    float v = fadef(y);
    float w = fadef(z);

    // 퍼뮤테이션 테이블로 해시 인덱스 찾기
    int A  = perm_table[X] + Y;
    int AA = perm_table[A] + Z;
    int AB = perm_table[A + 1] + Z;
    int B  = perm_table[X + 1] + Y;
    int BA = perm_table[B] + Z;
    int BB = perm_table[B + 1] + Z;

    // Perlin의 8개 코너를 보간해 자연스러운 패턴 생성
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

    return res; // -1 ~ 1
}

// -------------------------------------------------------------
// fbm (Fractal Brownian Motion)
// -------------------------------------------------------------
// 여러 개의 Perlin 노이즈를 서로 다른 규모로 쌓아서
// “자연스러운 산/구름/지형”을 만드는 고급 기법이다.
//
// 특징:
// - 여러 옥타브(octaves) → 큰 패턴 + 작은 패턴 동시에
// - lacunarity → 옥타브마다 주파수 증가
// - gain       → 옥타브마다 강도 감소
// - 결과: 0 ~ 1 정도의 값
// -------------------------------------------------------------
float fbm(float x, float y, float z, int octaves, float lacunarity, float gain) {
    float amplitude = 1.0f;
    float frequency = 1.0f;
    float sum = 0.0f;
    float maxAmp = 0.0f;

    for (int i = 0; i < octaves; ++i) {
        float n = perlin(x * frequency, y * frequency, z * frequency);
        n = n * 0.5f + 0.5f; // -1~1 → 0~1 로 변환

        sum += n * amplitude; // 누적
        maxAmp += amplitude;

        amplitude *= gain;        // 옥타브마다 강도 줄이고
        frequency *= lacunarity;  // 옥타브마다 주파수 증가
    }
    if (maxAmp == 0.0f) return 0.0f;
    return sum / maxAmp;  // 정규화
}

// -------------------------------------------------------------
// ridged_fbm
// -------------------------------------------------------------
// ridge = 능선, 산맥 패턴을 만드는 특수 노이즈.
//
// 일반 fBm은 부드러운 언덕 같은 지형이지만,
// ridged fBm은:
//   - 중간 값이 낮고
//   - 높은 값만 살아남아
//   - “날카로운 산맥” 형태를 만들어낸다.
//
// 이 노이즈는 행성의 산맥·봉우리를 만들 때 핵심이다.
// -------------------------------------------------------------
float ridged_fbm(float x, float y, float z, int octaves, float lacunarity, float gain) {
    float sum = 0.0f;
    float frequency = 1.0f;
    float amplitude = 1.0f;
    float weight = 1.0f;

    for (int i = 0; i < octaves; ++i) {
        float n = perlin(x * frequency, y * frequency, z * frequency);

        // |n|가 클수록 낮아지고, 1-|n|이 높아져 산맥 형태가 된다.
        n = 1.0f - std::fabs(n);
        n *= n; // 더 날카롭게(sharpen)

        n *= weight; // 이전 옥타브의 영향으로 더 자연스러운 능선

        sum += n * amplitude;

        // 다음 옥타브가 얼마나 영향을 받을지 결정
        weight = clampf(n * gain, 0.0f, 1.0f);

        frequency *= lacunarity;
        amplitude *= 0.5f;
    }
    return sum; // 보통 0 ~ 1.2 정도
}