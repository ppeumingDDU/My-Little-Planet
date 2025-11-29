// js_planet.js
// C++ 로직을 JS로 100% 이식하여 성능 비교를 위한 모듈

export class PlanetGeneratorJS {
    constructor() {
        this.perm = new Array(512);
        this.permInited = false;

        // 파라미터 (C++ 구조체와 동일하게 구성)
        this.params = {
            macroFreq: 0.1, macroOctaves: 4, macroAmp: 1.0,
            microFreq: 2.0, microOctaves: 4, microAmp: 0.2,
            ridgeFreq: 1.5, ridgeOctaves: 2, ridgeAmp: 0.8,
            lacunarity: 2.0, gain: 0.5
        };
    }

    // --- 유틸리티 함수 (util.hpp 대응) ---
    lerp(a, b, t) { return a + t * (b - a); }
    fade(t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
    clamp(v, lo, hi) { return Math.max(lo, Math.min(v, hi)); }
    smoothstep(edge0, edge1, x) {
        let t = this.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }

    // --- 노이즈 초기화 (noise.cpp 대응) ---
    init(seed) {
        // JS는 시드 기반 랜덤이 내장되어 있지 않으므로 단순화된 LCG 사용
        let val = seed;
        const random = () => {
            val = (val * 1664525 + 1013904223) % 4294967296;
            return val / 4294967296;
        };

        for(let i=0; i<256; i++) this.perm[i] = i;

        // Shuffle
        for(let i=255; i>0; i--) {
            const j = Math.floor(random() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        // Duplicate
        for(let i=0; i<256; i++) this.perm[256+i] = this.perm[i];

        // 파라미터도 시드에 따라 랜덤 설정 (비교를 위해 단순화하거나 고정값 사용 가능)
        // 여기서는 비교 공정성을 위해 고정값 혹은 유사한 랜덤 생성 로직 사용
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    // --- Perlin Noise ---
    perlin(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.perm[X]+Y, AA = this.perm[A]+Z, AB = this.perm[A+1]+Z;
        const B = this.perm[X+1]+Y, BA = this.perm[B]+Z, BB = this.perm[B+1]+Z;

        return this.lerp(
            this.lerp(
                this.lerp(this.grad(this.perm[AA], x, y, z),
                    this.grad(this.perm[BA], x-1, y, z), u),
                this.lerp(this.grad(this.perm[AB], x, y-1, z),
                    this.grad(this.perm[BB], x-1, y-1, z), u),
                v
            ),
            this.lerp(
                this.lerp(this.grad(this.perm[AA+1], x, y, z-1),
                    this.grad(this.perm[BA+1], x-1, y, z-1), u),
                this.lerp(this.grad(this.perm[AB+1], x, y-1, z-1),
                    this.grad(this.perm[BB+1], x-1, y-1, z-1), u),
                v
            ),
            w
        );
    }

    // --- fBm & Ridged fBm ---
    fbm(x, y, z, octaves, lacunarity, gain) {
        let amp = 1.0;
        let freq = 1.0;
        let sum = 0.0;
        let maxAmp = 0.0;

        for(let i=0; i<octaves; i++) {
            let n = this.perlin(x*freq, y*freq, z*freq);
            sum += (n * 0.5 + 0.5) * amp;
            maxAmp += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return maxAmp === 0 ? 0 : sum / maxAmp;
    }

    ridged_fbm(x, y, z, octaves, lacunarity, gain) {
        let sum = 0.0;
        let freq = 1.0;
        let amp = 1.0;
        let weight = 1.0;

        for(let i=0; i<octaves; i++) {
            let n = this.perlin(x*freq, y*freq, z*freq);
            n = 1.0 - Math.abs(n);
            n *= n;
            n *= weight;
            sum += n * amp;
            weight = this.clamp(n * gain, 0.0, 1.0);
            freq *= lacunarity;
            amp *= 0.5;
        }
        return sum;
    }

    // --- 최종 높이 계산 (planet.cpp의 get_height 대응) ---
    getHeight(x, y, z, scale, radius) {
        // 정규화 (Normalization)
        const len = Math.sqrt(x*x + y*y + z*z);
        const nx = x/len, ny = y/len, nz = z/len;

        // 1. Macro
        const macro = this.fbm(nx * this.params.macroFreq, ny * this.params.macroFreq, nz * this.params.macroFreq,
            this.params.macroOctaves, this.params.lacunarity, this.params.gain) * this.params.macroAmp;

        // 2. Micro
        const micro = this.fbm(nx * this.params.microFreq, ny * this.params.microFreq, nz * this.params.microFreq,
            this.params.microOctaves, this.params.lacunarity, this.params.gain) * this.params.microAmp;

        // 3. Ridge
        const ridge = this.ridged_fbm(nx * this.params.ridgeFreq, ny * this.params.ridgeFreq, nz * this.params.ridgeFreq,
            this.params.ridgeOctaves, this.params.lacunarity, this.params.gain) * this.params.ridgeAmp;

        // 4. Combine
        const continentMask = this.smoothstep(0.35, 0.65, macro);
        const lat = Math.abs(ny);
        const polarBoost = this.smoothstep(0.6, 0.95, lat) * 0.08;

        let h = macro * 0.65 + micro * 0.30 + ridge * continentMask * 0.6 + polarBoost;
        h -= 0.45; // sea level
        h *= scale;

        return h;
    }
}