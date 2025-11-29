#include "util.hpp"

// ----------------------------------------------
// noise.cpp 안에 구현된 노이즈 관련 함수들의 선언부
// (여기서는 "이런 함수가 있다"라고만 알려주는 역할)
// ----------------------------------------------
void initNoise(uint32_t seed); // 시드(seed)를 기반으로 노이즈용 테이블 초기화
float perlin(float x, float y, float z);
float fbm(float x, float y, float z, int octaves, float lacunarity, float gain);
float ridged_fbm(float x, float y, float z, int octaves, float lacunarity, float gain);

// ----------------------------------------------
// 노이즈 파라미터 구조체
// (행성의 지형을 어떤 스타일로 만들지 결정하는 설정 값 묶음)
// ----------------------------------------------
struct NoiseParams {
    float macroFreq;      // 대륙 크기를 결정하는 노이즈 주파수
    int   macroOctaves;   // 대륙 노이즈의 반복(옥타브) 수
    float macroAmp;       // 대륙 높이의 강도(얼마나 솟아오르는지)

    float microFreq;      // 작은 지형들(작은 산/골짜기)용 주파수
    int   microOctaves;   // micro 노이즈 옥타브
    float microAmp;       // micro 디테일 강도

    float ridgeFreq;      // 산맥 생성 노이즈의 주파수
    int   ridgeOctaves;   // ridge 노이즈 옥타브
    float ridgeAmp;       // 산맥의 강도

    float lacunarity;     // 옥타브 간 주파수 증가율
    float gain;           // 옥타브 간 강도 감소율
};

// NoiseParams를 시드로부터 자동 생성하는 함수(노이즈 스타일 결정)
NoiseParams generateNoiseParams(uint32_t seed);

// ----------------------------------------------
// 행성 생성기 전체에서 유지하는 전역 상태 변수들
// (사용자가 seed/scale/radius를 바꾸면 값이 업데이트됨)
// ----------------------------------------------
extern "C" {
    static NoiseParams PARAMS;   // 행성 지형 스타일 전체
    static uint32_t GLOBAL_SEED = 0;  
    static float GLOBAL_SCALE = 1.0f;    // 지형 전체 높이 배율
    static float GLOBAL_RADIUS = 1.0f;   // 기본 행성 반지름

    // --------------------------------------------------------------
    // init_planet
    // --------------------------------------------------------------
    // 행성 생성기를 초기화하는 함수.
    // (JS → WASM에서 첫 실행 시 반드시 호출해야 함)
    //
    // seed   : 행성의 지형이 결정되는 “유전 암호” 같은 역할
    // scale  : 산의 높이, 골짜기 깊이 등 전체 높이를 얼마나 키울지
    // radius : 행성의 기본 크기(지름이 아니라 반지름!)
    //
    // 이 함수가 호출되어야:
    // 1) 노이즈 테이블이 초기화되고
    // 2) 노이즈 파라미터(대륙/산맥 스타일)가 시드 기반으로 자동 생성되고
    // 3) get_height(), get_final_position() 함수가 제대로 동작함
    // --------------------------------------------------------------
    void init_planet(int seed, float scale, float radius) {
        GLOBAL_SEED = static_cast<uint32_t>(seed);
        GLOBAL_SCALE = scale;
        GLOBAL_RADIUS = radius;

        // 노이즈 엔진 초기화(시드 기반으로 랜덤 테이블 생성)
        initNoise(GLOBAL_SEED);

        // 시드를 기반으로 노이즈 파라미터(지형 스타일) 자동 생성
        PARAMS = generateNoiseParams(GLOBAL_SEED);
    }

    // --------------------------------------------------------------
    // get_height
    // --------------------------------------------------------------
    // (x, y, z) 방향을 기준으로 “그 방향에서 얼마나 튀어나오거나 파여 있는지” 계산.
    //
    // 반환값:
    // - 양수 → 기본 반지름보다 튀어나온 부분(육지/산)
    // - 음수 → 기본 반지름보다 파인 부분(바다/계곡)
    //
    // ※ Three.js에서는 이 값을 받아서 구 형태의 버텍스를 밀어내며 행성을 만든다.
    // --------------------------------------------------------------
    float get_height(float x, float y, float z) {
        // 먼저 (x,y,z)를 “단위 벡터”로 만들어 방향만 사용하도록 한다.
        Vec3 n = normalize(Vec3(x, y, z));

        // ---------- 1) 대륙 모양 결정 ----------
        // fBm 노이즈는 여러 주파수의 Perlin 노이즈를 섞어서
        // 부드럽고 자연스러운 산-골짜기 패턴을 만든다.
        float macro = fbm(n.x * PARAMS.macroFreq,
                          n.y * PARAMS.macroFreq,
                          n.z * PARAMS.macroFreq,
                          PARAMS.macroOctaves,
                          PARAMS.lacunarity,
                          PARAMS.gain) * PARAMS.macroAmp;

        // ---------- 2) 작은 지형 디테일 ----------
        // micro 노이즈는 작은 굴곡(바위, 작은 언덕)을 추가한다.
        float micro = fbm(n.x * PARAMS.microFreq,
                          n.y * PARAMS.microFreq,
                          n.z * PARAMS.microFreq,
                          PARAMS.microOctaves,
                          PARAMS.lacunarity,
                          PARAMS.gain) * PARAMS.microAmp;

        // ---------- 3) 날카로운 산맥(능선) ----------
        // ridged_fbm은 봉우리가 날카로운 산맥을 만들기 적합한 노이즈.
        float ridge = ridged_fbm(n.x * PARAMS.ridgeFreq,
                                 n.y * PARAMS.ridgeFreq,
                                 n.z * PARAMS.ridgeFreq,
                                 PARAMS.ridgeOctaves,
                                 PARAMS.lacunarity,
                                 PARAMS.gain) * PARAMS.ridgeAmp;

        // ---------- 4) 육지 마스크 ----------
        // macro가 어느 정도 이상일 때만 산맥을 살아 있게 하고,
        // 바다 근처에서는 산맥 효과가 약하도록 만든다.
        float continentMask = smoothstep(0.35f, 0.65f, macro);

        // ---------- 5) 극지방 효과 ----------
        // y축이 위아래 방향이라, y가 ±1에 가까울수록 북/남극.
        // 극지에는 약간의 얼음층/평원 같은 효과를 추가.
        float lat = std::fabs(n.y);
        float polarBoost = smoothstep(0.6f, 0.95f, lat) * 0.08f;

        // ---------- 6) 최종 높이 계산 ----------
        // 각 요소를 비율로 섞어서 전체 지형을 구성한다.
        float height = macro * 0.65f
                     + micro * 0.30f
                     + ridge * continentMask * 0.6f
                     + polarBoost;

        // ---------- 7) 바다 수위 조절 ----------
        // seaLevel 값이 클수록 물이 많아지고 육지가 줄어든다.
        const float seaLevel = 0.45f;
        height -= seaLevel;

        // ---------- 8) 전체 높이 배율 ----------
        // 사용자가 입력한 scale 값에 따라 지형의 높낮이를 조절
        height *= GLOBAL_SCALE;

        return height;
    }

    // --------------------------------------------------------------
    // get_final_position
    // --------------------------------------------------------------
    // 행성 표면 위의 최종 위치 계산:
    // 1) 입력된 (x,y,z) 방향을 단위 벡터로 정리한 후
    // 2) get_height()로 높이를 구하고
    // 3) 기본 반지름 + 높이를 곱하여 최종 표면 좌표를 만든다.
    //
    // 즉,
    // “구의 한 점이 지형에 의해 얼마나 밀려나거나 들어갔는가”
    // 를 계산하여 Three.js에서 행성 표면을 실제로 변형하는 데 사용됨.
    // --------------------------------------------------------------
    void get_final_position(float x, float y, float z,
                            float* outX, float* outY, float* outZ) {
        Vec3 n = normalize(Vec3(x,y,z));
        float h = get_height(n.x, n.y, n.z);
        float r = GLOBAL_RADIUS + h; // 기본 반지름 + 높이 → 실제 좌표

        *outX = n.x * r;
        *outY = n.y * r;
        *outZ = n.z * r;
    }
} // extern "C"