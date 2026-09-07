import { AUTO, Events, Game as PhaserGame, Scale, Scene } from 'phaser';

// ---------------------------------------------------------------------------
// GAME CONSTANTS
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const WORLD_H = 600;

export const GRAVITY_Y = 800;
export const PLAYER_RUN = 220;
export const JUMP_VELOCITY = -420;      // H = v^2 / (2g) = 420^2/1600 = 110px
export const DOUBLE_JUMP_VELOCITY = -380;
export const WALL_JUMP_X = 260;
export const WALL_JUMP_Y = -400;
export const TRAMPOLINE_VELOCITY = -640;
export const COYOTE_MS = 100;
export const JUMP_BUFFER_MS = 120;
export const INVULN_MS = 1200;
export const KILL_Y = 585;

export const MAX_LIVES = 3;

export const COLORS = {
    BACKGROUND: '#2196f3',
    GRASS: 0x66bb6a,
    GRASS_CAP: 0x81c784,
    DIRT: 0x795548,
    DIRT_DARK: 0x5d4037,
    FROG_BODY: 0x43a047,
    FROG_BELLY: 0xa5d6a7,
    FROG_DARK: 0x2e7d32,
    SCARF: 0xe53935,
    EYE: 0xffffff,
    PUPIL: 0x212121,
    APPLE: 0xe53935,
    APPLE_STEM: 0x6d4c41,
    COIN: 0xffd54f,
    COIN_DARK: 0xf59e0b,
    SAW: 0xb0bec5,
    SAW_DARK: 0x546e7a,
    FLAG_POLE: 0xcfd8dc,
    FLAG_CLOTH: 0xffca28,
    TEXT: '#ffffff',
} as const;

// ---------------------------------------------------------------------------
// EVENT NAMES — single source of truth for the React <-> Phaser contract.
// ---------------------------------------------------------------------------
export const EVT = {
    SCENE_READY: 'current-scene-ready',
    PHASE_CHANGED: 'phase-changed',
    SCORE_UPDATED: 'score-updated',
    LIVES_UPDATED: 'lives-updated',
    TIMER_UPDATED: 'timer-updated',
    GAME_WIN: 'game-win',
    GAME_OVER: 'game-over',
    TOGGLE_PAUSE: 'toggle-pause',
    START_GAME: 'start-game',
    RESTART_GAME: 'restart-game',
    COUNTDOWN: 'countdown',
    TOUCH_INPUT: 'touch-input',
    GO_MENU: 'go-menu',
    SELECT_LEVEL: 'select-level',
    LEVEL_CHANGED: 'level-changed',
} as const;

// ---------------------------------------------------------------------------
// SAVE / PERSISTENCE — unlocked levels + per-level star ratings.
// ---------------------------------------------------------------------------
const SAVE_KEY = 'pixel_frog_platformer_save';

interface SaveData {
    bestScore: number;
    bestTime: number;
    totalStars: number;
    unlocked: number;          // highest unlocked level id (1..LEVEL_COUNT)
    stars: Record<number, number>; // level id -> best stars (0..3)
}

const DEFAULT_SAVE: SaveData = { bestScore: 0, bestTime: 0, totalStars: 0, unlocked: 1, stars: {} };
let cachedSave: SaveData | null = null;

function loadSave(): SaveData {
    if (cachedSave) return cachedSave;
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            const parsedSave: SaveData = { ...DEFAULT_SAVE, ...JSON.parse(raw) };
            cachedSave = parsedSave;
            return parsedSave;
        }
    } catch { /* ignore */ }
    cachedSave = { ...DEFAULT_SAVE, stars: {} };
    return cachedSave;
}

function writeSave(data: SaveData): void {
    cachedSave = data;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    void fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).catch(() => { /* offline mode uses localStorage */ });
}

export function readProgress(): SaveData {
    return loadSave();
}

export async function hydrateProgress(): Promise<SaveData> {
    try {
        const response = await fetch('/api/progress');
        if (response.ok) {
            const remote = await response.json() as SaveData;
            cachedSave = { ...DEFAULT_SAVE, ...remote };
            try { localStorage.setItem(SAVE_KEY, JSON.stringify(cachedSave)); } catch { /* ignore */ }
        }
    } catch { /* offline mode uses localStorage */ }
    return loadSave();
}

// ---------------------------------------------------------------------------
// LEVEL REGISTRY — 9 handcrafted, escalating levels.
// Constraints: platform gaps <= 130px, vertical steps <= 80px (jump H = 110px).
// ---------------------------------------------------------------------------
interface Plat { x: number; y: number; w: number; h: number; }
interface Theme {
    skyTop: number; skyBottom: number;
    hillFar: number; hillMid: number; hillNear: number;
    grass: number; grassCap: number; dirt: number; dirtDark: number;
    bgCss: string;
}

export interface LevelDef {
    id: number;
    name: string;
    worldW: number;
    target: number;
    theme: Theme;
    platforms: Plat[];
    apples: Array<[number, number]>;
    saws: Array<[number, number, number, number]>; // x, y, rangeX, speed
    trampolines: Array<[number, number]>;
    falling: Array<[number, number]>;
    flag: [number, number];
    spawn: [number, number];
}

const THEME_MEADOW: Theme = {
    skyTop: 0x4fc3f7, skyBottom: 0x1976d2,
    hillFar: 0x64b5f6, hillMid: 0x42a5f5, hillNear: 0x2e7d32,
    grass: 0x66bb6a, grassCap: 0x81c784, dirt: 0x795548, dirtDark: 0x5d4037,
    bgCss: '#2196f3',
};
const THEME_TWILIGHT: Theme = {
    skyTop: 0xffb74d, skyBottom: 0x6a1b9a,
    hillFar: 0x9575cd, hillMid: 0x5e35b1, hillNear: 0x1b5e20,
    grass: 0x2e7d32, grassCap: 0x43a047, dirt: 0x4e342e, dirtDark: 0x3e2723,
    bgCss: '#6a1b9a',
};
const THEME_MIDNIGHT: Theme = {
    skyTop: 0x1a237e, skyBottom: 0x000033,
    hillFar: 0x283593, hillMid: 0x1a237e, hillNear: 0x0d1b2a,
    grass: 0x3949ab, grassCap: 0x5c6bc0, dirt: 0x263238, dirtDark: 0x1c2529,
    bgCss: '#0d1440',
};
const THEME_CRYSTAL: Theme = {
    skyTop: 0x0a1128, skyBottom: 0x001f54,
    hillFar: 0x1282a2, hillMid: 0x034078, hillNear: 0x001f54,
    grass: 0x00b4d8, grassCap: 0x90e0ef, dirt: 0x1c2541, dirtDark: 0x0b132b,
    bgCss: '#0a1128',
};
const THEME_INFERNO: Theme = {
    skyTop: 0x370617, skyBottom: 0x6a040f,
    hillFar: 0x9d0208, hillMid: 0xd00000, hillNear: 0x370617,
    grass: 0xf48c06, grassCap: 0xffba08, dirt: 0x240046, dirtDark: 0x10002b,
    bgCss: '#370617',
};
const THEME_AURORA: Theme = {
    skyTop: 0x0f172a, skyBottom: 0x1d3557,
    hillFar: 0x7bdff2, hillMid: 0x3a86ff, hillNear: 0x0b525b,
    grass: 0x2ec4b6, grassCap: 0x9ef01a, dirt: 0x2f3e46, dirtDark: 0x1b2a33,
    bgCss: '#0b525b',
};
const THEME_SUMMIT: Theme = {
    skyTop: 0x1b263b, skyBottom: 0x3a0ca3,
    hillFar: 0xc77dff, hillMid: 0x7b2cbf, hillNear: 0x240046,
    grass: 0x9d4edd, grassCap: 0xe0aaff, dirt: 0x2b1d35, dirtDark: 0x140b1d,
    bgCss: '#240046',
};
const THEME_STORM: Theme = {
    skyTop: 0x263859, skyBottom: 0x17223b,
    hillFar: 0x415a77, hillMid: 0x2f4858, hillNear: 0x183a37,
    grass: 0x2d6a4f, grassCap: 0x74c69d, dirt: 0x354f52, dirtDark: 0x172a2d,
    bgCss: '#17223b',
};
const THEME_RIVER: Theme = {
    skyTop: 0x48cae4, skyBottom: 0x0077b6,
    hillFar: 0x90e0ef, hillMid: 0x00b4d8, hillNear: 0x1b4332,
    grass: 0x52b788, grassCap: 0xb7e4c7, dirt: 0x8d6e63, dirtDark: 0x4e342e,
    bgCss: '#0077b6',
};
const THEME_THUNDER: Theme = {
    skyTop: 0x33415c, skyBottom: 0x111827,
    hillFar: 0x5c677d, hillMid: 0x33415c, hillNear: 0x1b263b,
    grass: 0xe09f3e, grassCap: 0xffd166, dirt: 0x4a4e69, dirtDark: 0x22223b,
    bgCss: '#111827',
};
const THEME_ANCESTOR: Theme = {
    skyTop: 0x9c6644, skyBottom: 0x582f0e,
    hillFar: 0xddb892, hillMid: 0xb08968, hillNear: 0x606c38,
    grass: 0x7f4f24, grassCap: 0xdda15e, dirt: 0x6f4518, dirtDark: 0x3b240d,
    bgCss: '#582f0e',
};
const THEME_SKY_SHRINE: Theme = {
    skyTop: 0x90e0ef, skyBottom: 0x4361ee,
    hillFar: 0xcaf0f8, hillMid: 0x48cae4, hillNear: 0x3a0ca3,
    grass: 0x4cc9f0, grassCap: 0xf1faee, dirt: 0x3f37c9, dirtDark: 0x240046,
    bgCss: '#4361ee',
};
const THEME_DROUGHT_END: Theme = {
    skyTop: 0xf4a261, skyBottom: 0xe76f51,
    hillFar: 0xe9c46a, hillMid: 0xf4a261, hillNear: 0x2a9d8f,
    grass: 0x40916c, grassCap: 0x95d5b2, dirt: 0x9c6644, dirtDark: 0x582f0e,
    bgCss: '#e76f51',
};
const THEME_RETURN: Theme = {
    skyTop: 0x80ed99, skyBottom: 0x168aad,
    hillFar: 0xb5e48c, hillMid: 0x52b69a, hillNear: 0x184e77,
    grass: 0x34a0a4, grassCap: 0xd9ed92, dirt: 0x386641, dirtDark: 0x1b4332,
    bgCss: '#168aad',
};

function createGuardianTrial(id: number, name: string, target: number, theme: Theme, variant: number): LevelDef {
    const platformCount = 20 + variant;
    const heightPatterns = [
        [420, 410, 340, 270, 350, 280, 210, 300],
        [420, 350, 280, 200, 290, 370, 300, 230],
        [400, 320, 240, 170, 250, 330, 260, 190],
        [430, 360, 290, 220, 300, 380, 310, 240],
        [390, 310, 230, 150, 240, 320, 250, 180],
    ];
    const heights = heightPatterns[variant];
    const platforms: Plat[] = [{ x: 0, y: 480, w: 290, h: 120 }];
    for (let i = 0; i < platformCount; i++) {
        const y = heights[i % heights.length];
        platforms.push({ x: 390 + i * 210, y, w: 120, h: WORLD_H - y });
    }
    const finalX = 390 + platformCount * 210;
    platforms.push({ x: finalX, y: 400, w: 360, h: 200 });

    const apples: Array<[number, number]> = [[120, 430], [240, 430]];
    for (const platform of platforms.slice(1, -1)) {
        if (apples.length < target) apples.push([platform.x + 32, platform.y - 48]);
        if (apples.length < target) apples.push([platform.x + 88, platform.y - 48]);
    }

    const saws: Array<[number, number, number, number]> = platforms.slice(1, -1)
        .filter((_, index) => index % 2 === variant % 2)
        .map((platform, index) => [platform.x + 48, platform.y - 35, 38 + (index % 3) * 6, Math.max(620, 820 - variant * 35)]);
    const trampolines: Array<[number, number]> = platforms.slice(2, -1)
        .filter((_, index) => index % 5 === 0)
        .map((platform) => [platform.x + platform.w / 2, platform.y - 14]);
    const falling: Array<[number, number]> = platforms.slice(1, -2)
        .filter((_, index) => index % 3 === 1)
        .map((platform, index) => [platform.x + platform.w + 45, Math.max(90, platform.y - 75 - (index % 2) * 20)]);

    return {
        id, name, worldW: finalX + 360, target, theme, platforms, apples, saws,
        trampolines, falling, flag: [finalX + 210, 400], spawn: [80, 400],
    };
}

export const LEVELS: LevelDef[] = [
    {
        id: 1, name: 'Sunny Meadow', worldW: 2400, target: 15, theme: THEME_MEADOW,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 400, h: 120 },
            { x: 520, y: 480, w: 200, h: 120 },
            { x: 820, y: 420, w: 160, h: 180 },
            { x: 1080, y: 360, w: 150, h: 240 },
            { x: 1330, y: 430, w: 200, h: 170 },
            { x: 1630, y: 480, w: 220, h: 120 },
            { x: 1950, y: 420, w: 150, h: 180 },
            { x: 2170, y: 400, w: 230, h: 200 },
        ],
        apples: [
            [150, 430], [300, 430], [470, 380], [600, 430], [700, 430],
            [880, 370], [940, 370], [1050, 300], [1150, 310], [1250, 360],
            [1420, 380], [1500, 380], [1700, 430], [1800, 430], [2000, 370],
        ],
        saws: [
            [620, 445, 60, 1400], [1200, 325, 50, 1600], [1750, 445, 60, 1500],
        ],
        trampolines: [[450, 466], [1360, 416]],
        falling: [[1000, 250], [1290, 250]],
        flag: [2250, 400],
    },
    {
        id: 2, name: 'Twilight Forest', worldW: 2700, target: 18, theme: THEME_TWILIGHT,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 360, h: 120 },
            { x: 460, y: 440, w: 180, h: 160 },
            { x: 720, y: 400, w: 150, h: 200 },
            { x: 950, y: 350, w: 140, h: 250 },
            { x: 1180, y: 420, w: 180, h: 180 },
            { x: 1450, y: 360, w: 150, h: 240 },
            { x: 1690, y: 300, w: 140, h: 300 },
            { x: 1920, y: 380, w: 170, h: 220 },
            { x: 2180, y: 440, w: 180, h: 160 },
            { x: 2450, y: 400, w: 250, h: 200 },
        ],
        apples: [
            [140, 430], [280, 430], [420, 390], [540, 390], [660, 350],
            [790, 350], [880, 300], [1010, 300], [1120, 370], [1260, 370],
            [1380, 310], [1520, 310], [1620, 250], [1760, 250], [1860, 330],
            [2000, 330], [2120, 390], [2300, 350],
        ],
        saws: [
            [520, 405, 70, 1300], [1010, 315, 55, 1500], [1240, 385, 70, 1400],
            [1520, 325, 60, 1200], [2240, 405, 70, 1300],
        ],
        trampolines: [[400, 466], [1150, 406], [2150, 426]],
        falling: [[900, 240], [1330, 240], [1600, 200], [2060, 260]],
        flag: [2560, 400],
    },
    {
        id: 3, name: 'Midnight Peak', worldW: 3000, target: 20, theme: THEME_MIDNIGHT,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 320, h: 120 },
            { x: 420, y: 430, w: 150, h: 170 },
            { x: 650, y: 380, w: 130, h: 220 },
            { x: 860, y: 320, w: 120, h: 280 },
            { x: 1060, y: 380, w: 140, h: 220 },
            { x: 1280, y: 300, w: 120, h: 300 },
            { x: 1490, y: 360, w: 150, h: 240 },
            { x: 1720, y: 280, w: 120, h: 320 },
            { x: 1930, y: 350, w: 150, h: 250 },
            { x: 2160, y: 420, w: 160, h: 180 },
            { x: 2400, y: 340, w: 130, h: 260 },
            { x: 2620, y: 400, w: 380, h: 200 },
        ],
        apples: [
            [130, 430], [260, 430], [380, 380], [490, 380], [600, 330],
            [710, 330], [800, 270], [920, 270], [1000, 330], [1120, 330],
            [1220, 250], [1340, 250], [1430, 310], [1560, 310], [1660, 230],
            [1780, 230], [1870, 300], [2000, 300], [2100, 370], [2460, 290],
        ],
        saws: [
            [470, 395, 60, 1100], [910, 285, 50, 1200], [1120, 345, 60, 1100],
            [1330, 265, 50, 1000], [1540, 325, 60, 1100], [1770, 245, 50, 1000],
            [2210, 385, 70, 1200],
        ],
        trampolines: [[360, 466], [1030, 366], [1690, 346], [2360, 326]],
        falling: [
            [560, 220], [760, 200], [1180, 190], [1400, 170], [1620, 160], [2050, 220],
        ],
        flag: [2880, 400],
    },
    {
        id: 4, name: 'Crystal Cavern', worldW: 3200, target: 22, theme: THEME_CRYSTAL,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 340, h: 120 },
            { x: 440, y: 430, w: 140, h: 170 },
            { x: 660, y: 370, w: 130, h: 230 },
            { x: 870, y: 310, w: 120, h: 290 },
            { x: 1070, y: 380, w: 140, h: 220 },
            { x: 1290, y: 300, w: 120, h: 300 },
            { x: 1490, y: 250, w: 110, h: 350 },
            { x: 1680, y: 320, w: 130, h: 280 },
            { x: 1890, y: 400, w: 150, h: 200 },
            { x: 2120, y: 340, w: 120, h: 260 },
            { x: 2320, y: 280, w: 110, h: 320 },
            { x: 2510, y: 360, w: 140, h: 240 },
            { x: 2730, y: 420, w: 160, h: 180 },
            { x: 2960, y: 400, w: 240, h: 200 },
        ],
        apples: [
            [130, 430], [270, 430], [380, 380], [510, 380], [600, 320],
            [720, 320], [810, 260], [930, 260], [1010, 330], [1130, 330],
            [1230, 250], [1350, 250], [1440, 200], [1550, 200], [1630, 270],
            [1740, 270], [1840, 350], [1960, 350], [2060, 290], [2180, 290],
            [2270, 230], [2380, 230],
        ],
        saws: [
            [480, 395, 55, 1100], [920, 275, 50, 1000], [1150, 345, 55, 1100],
            [1380, 265, 50, 1000], [1570, 215, 45, 900], [1780, 285, 55, 1100],
            [2000, 365, 60, 1200], [2200, 305, 50, 1000], [2420, 245, 45, 900],
            [2600, 325, 55, 1100],
        ],
        trampolines: [[380, 466], [1050, 366], [1660, 306], [2300, 266], [2700, 406]],
        falling: [
            [560, 220], [780, 200], [1200, 180], [1450, 160], [1620, 150],
            [2050, 200], [2250, 180], [2480, 170],
        ],
        flag: [3080, 400],
    },
    {
        id: 5, name: 'Inferno Fortress', worldW: 3400, target: 25, theme: THEME_INFERNO,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 300, h: 120 },
            { x: 400, y: 420, w: 130, h: 180 },
            { x: 610, y: 360, w: 120, h: 240 },
            { x: 810, y: 300, w: 110, h: 300 },
            { x: 1000, y: 370, w: 130, h: 230 },
            { x: 1210, y: 290, w: 110, h: 310 },
            { x: 1400, y: 230, w: 100, h: 370 },
            { x: 1580, y: 300, w: 120, h: 300 },
            { x: 1780, y: 380, w: 140, h: 220 },
            { x: 2000, y: 310, w: 110, h: 290 },
            { x: 2190, y: 250, w: 100, h: 350 },
            { x: 2370, y: 330, w: 130, h: 270 },
            { x: 2580, y: 400, w: 150, h: 200 },
            { x: 2810, y: 340, w: 120, h: 260 },
            { x: 3010, y: 400, w: 390, h: 200 },
        ],
        apples: [
            [120, 430], [240, 430], [350, 370], [470, 370], [560, 310],
            [670, 310], [760, 250], [870, 250], [950, 320], [1060, 320],
            [1150, 240], [1270, 240], [1350, 180], [1450, 180], [1530, 250],
            [1640, 250], [1730, 330], [1850, 330], [1940, 260], [2060, 260],
            [2140, 200], [2250, 200], [2320, 280], [2440, 280], [2530, 350],
        ],
        saws: [
            [440, 385, 50, 900], [660, 325, 45, 850], [870, 265, 40, 800],
            [1050, 335, 50, 900], [1270, 255, 45, 850], [1450, 195, 40, 800],
            [1640, 265, 50, 900], [1850, 345, 55, 950], [2060, 275, 45, 850],
            [2250, 215, 40, 800], [2440, 295, 50, 900], [2650, 365, 55, 950],
            [2870, 305, 45, 850],
        ],
        trampolines: [[350, 466], [980, 356], [1560, 286], [2170, 236], [2560, 386], [2790, 386]],
        falling: [
            [520, 200], [730, 180], [1100, 160], [1320, 140], [1500, 130],
            [1900, 180], [2100, 160], [2350, 150], [2500, 140], [2750, 170],
        ],
        flag: [3260, 400],
    },
    {
        id: 6, name: 'Aurora Rift', worldW: 3600, target: 28, theme: THEME_AURORA,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 360, h: 120 },
            { x: 430, y: 430, w: 150, h: 170 },
            { x: 650, y: 380, w: 120, h: 220 },
            { x: 880, y: 330, w: 120, h: 270 },
            { x: 1080, y: 390, w: 150, h: 210 },
            { x: 1320, y: 300, w: 110, h: 300 },
            { x: 1560, y: 250, w: 110, h: 350 },
            { x: 1780, y: 330, w: 140, h: 270 },
            { x: 2020, y: 270, w: 110, h: 330 },
            { x: 2240, y: 360, w: 150, h: 240 },
            { x: 2480, y: 300, w: 120, h: 300 },
            { x: 2710, y: 240, w: 120, h: 360 },
            { x: 2930, y: 320, w: 150, h: 280 },
            { x: 3190, y: 420, w: 410, h: 180 },
        ],
        apples: [
            [150, 430], [260, 430], [390, 380], [500, 380], [600, 330],
            [760, 330], [840, 280], [960, 280], [1010, 340], [1120, 340],
            [1240, 250], [1360, 250], [1490, 200], [1620, 200], [1710, 280],
            [1830, 280], [1960, 220], [2120, 220], [2190, 310], [2340, 310],
            [2440, 250], [2580, 250], [2770, 190], [2870, 190], [3010, 270],
        ],
        saws: [
            [500, 395, 50, 1100], [920, 295, 50, 1000], [1120, 355, 60, 1100],
            [1360, 265, 50, 1000], [1590, 215, 45, 900], [1830, 295, 55, 1000],
            [2060, 235, 45, 900], [2280, 325, 55, 1100], [2520, 265, 50, 1000],
            [2760, 205, 45, 900], [2990, 285, 55, 1100],
        ],
        trampolines: [[370, 466], [1040, 366], [1680, 286], [2390, 326], [2900, 286]],
        falling: [
            [620, 210], [820, 190], [1200, 180], [1420, 160], [1780, 150],
            [2160, 200], [2460, 170], [2850, 180], [3080, 210],
        ],
        flag: [3460, 400],
    },
    {
        id: 7, name: 'Final Summit', worldW: 3900, target: 32, theme: THEME_SUMMIT,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 300, h: 120 },
            { x: 410, y: 430, w: 120, h: 170 },
            { x: 620, y: 370, w: 120, h: 230 },
            { x: 840, y: 310, w: 110, h: 290 },
            { x: 1030, y: 260, w: 100, h: 340 },
            { x: 1220, y: 330, w: 120, h: 270 },
            { x: 1430, y: 250, w: 100, h: 350 },
            { x: 1620, y: 200, w: 110, h: 400 },
            { x: 1830, y: 280, w: 120, h: 320 },
            { x: 2060, y: 360, w: 150, h: 240 },
            { x: 2300, y: 290, w: 120, h: 310 },
            { x: 2510, y: 220, w: 110, h: 380 },
            { x: 2720, y: 300, w: 130, h: 300 },
            { x: 2960, y: 360, w: 150, h: 240 },
            { x: 3200, y: 250, w: 120, h: 350 },
            { x: 3440, y: 400, w: 460, h: 200 },
        ],
        apples: [
            [140, 430], [260, 430], [360, 380], [470, 380], [560, 320],
            [680, 320], [770, 260], [880, 260], [980, 210], [1090, 210],
            [1160, 280], [1290, 280], [1380, 200], [1490, 200], [1570, 150],
            [1680, 150], [1770, 230], [1890, 230], [2010, 310], [2140, 310],
            [2250, 240], [2360, 240], [2460, 170], [2580, 170], [2670, 250],
            [2800, 250], [2900, 310], [3020, 310], [3150, 200], [3260, 200],
            [3340, 320], [3500, 350],
        ],
        saws: [
            [470, 395, 50, 900], [690, 335, 45, 850], [890, 275, 45, 850],
            [1060, 225, 40, 800], [1260, 295, 50, 900], [1460, 215, 40, 800],
            [1650, 165, 35, 780], [1880, 245, 45, 850], [2110, 325, 55, 950],
            [2340, 255, 45, 850], [2560, 185, 35, 780], [2770, 265, 50, 900],
            [3000, 325, 55, 950], [3230, 215, 45, 850], [3500, 365, 55, 950],
        ],
        trampolines: [[350, 466], [990, 226], [1680, 166], [2280, 286], [2900, 326], [3380, 366]],
        falling: [
            [540, 210], [760, 180], [1180, 150], [1380, 130], [1760, 150],
            [1960, 180], [2210, 160], [2460, 140], [2820, 150], [3120, 180], [3350, 160],
        ],
        flag: [3680, 400],
    },
    {
        id: 8, name: 'Rainmaker Ascent', worldW: 4200, target: 35, theme: THEME_STORM,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 300, h: 120 }, { x: 400, y: 420, w: 130, h: 180 },
            { x: 620, y: 350, w: 120, h: 250 }, { x: 840, y: 280, w: 110, h: 320 },
            { x: 1040, y: 360, w: 130, h: 240 }, { x: 1260, y: 290, w: 110, h: 310 },
            { x: 1460, y: 220, w: 100, h: 380 }, { x: 1650, y: 300, w: 120, h: 300 },
            { x: 1860, y: 390, w: 150, h: 210 }, { x: 2100, y: 310, w: 120, h: 290 },
            { x: 2310, y: 230, w: 110, h: 370 }, { x: 2510, y: 320, w: 130, h: 280 },
            { x: 2740, y: 250, w: 110, h: 350 }, { x: 2940, y: 170, w: 100, h: 430 },
            { x: 3130, y: 270, w: 120, h: 330 }, { x: 3340, y: 360, w: 150, h: 240 },
            { x: 3580, y: 280, w: 120, h: 320 }, { x: 3800, y: 400, w: 400, h: 200 },
        ],
        apples: [
            [130, 430], [250, 430], [350, 370], [470, 370], [570, 300],
            [680, 300], [790, 230], [900, 230], [990, 310], [1100, 310],
            [1210, 240], [1320, 240], [1410, 170], [1510, 170], [1600, 250],
            [1710, 250], [1810, 340], [1930, 340], [2050, 260], [2160, 260],
            [2260, 180], [2370, 180], [2470, 270], [2580, 270], [2690, 200],
            [2800, 200], [2900, 120], [2990, 120], [3080, 220], [3190, 220],
            [3290, 310], [3410, 310], [3530, 230], [3640, 230], [3880, 350],
        ],
        saws: [
            [450, 385, 50, 850], [670, 315, 45, 800], [890, 245, 40, 760],
            [1090, 325, 50, 850], [1310, 255, 45, 800], [1500, 185, 38, 740],
            [1700, 265, 45, 800], [1930, 355, 55, 900], [2150, 275, 45, 800],
            [2360, 195, 40, 760], [2580, 285, 50, 850], [2790, 215, 40, 760],
            [2990, 135, 35, 700], [3190, 235, 45, 800], [3420, 325, 55, 900],
            [3640, 245, 45, 800], [3890, 365, 60, 950],
        ],
        trampolines: [[350, 466], [1010, 346], [1810, 376], [2470, 306], [3290, 256], [3740, 386]],
        falling: [[550, 190], [770, 160], [1180, 160], [1390, 120], [1780, 160], [2020, 180], [2440, 140], [2860, 100], [3260, 150], [3520, 160], [3740, 180]],
        flag: [4050, 400],
    },
    {
        id: 9, name: 'River Guardian', worldW: 4500, target: 38, theme: THEME_RIVER,
        spawn: [80, 400],
        platforms: [
            { x: 0, y: 480, w: 280, h: 120 }, { x: 380, y: 410, w: 120, h: 190 },
            { x: 590, y: 330, w: 110, h: 270 }, { x: 790, y: 250, w: 100, h: 350 },
            { x: 980, y: 340, w: 120, h: 260 }, { x: 1190, y: 260, w: 100, h: 340 },
            { x: 1380, y: 180, w: 100, h: 420 }, { x: 1570, y: 270, w: 110, h: 330 },
            { x: 1780, y: 370, w: 140, h: 230 }, { x: 2010, y: 290, w: 110, h: 310 },
            { x: 2210, y: 210, w: 100, h: 390 }, { x: 2400, y: 300, w: 120, h: 300 },
            { x: 2610, y: 220, w: 100, h: 380 }, { x: 2800, y: 140, w: 100, h: 460 },
            { x: 2990, y: 240, w: 110, h: 360 }, { x: 3200, y: 340, w: 130, h: 260 },
            { x: 3420, y: 260, w: 110, h: 340 }, { x: 3620, y: 180, w: 100, h: 420 },
            { x: 3810, y: 290, w: 120, h: 310 }, { x: 4020, y: 390, w: 150, h: 210 },
            { x: 4260, y: 400, w: 240, h: 200 },
        ],
        apples: [
            [120, 430], [230, 430], [330, 360], [440, 360], [540, 280],
            [650, 280], [740, 200], [840, 200], [930, 290], [1040, 290],
            [1140, 210], [1240, 210], [1330, 130], [1430, 130], [1520, 220],
            [1630, 220], [1730, 320], [1850, 320], [1960, 240], [2070, 240],
            [2160, 160], [2260, 160], [2350, 250], [2460, 250], [2560, 170],
            [2660, 170], [2750, 90], [2850, 90], [2940, 190], [3050, 190],
            [3150, 290], [3260, 290], [3370, 210], [3480, 210], [3570, 130],
            [3670, 130], [3760, 240], [4070, 340],
        ],
        saws: [
            [430, 375, 45, 780], [640, 295, 40, 740], [840, 215, 35, 700],
            [1030, 305, 45, 780], [1240, 225, 40, 740], [1430, 145, 35, 680],
            [1620, 235, 40, 740], [1850, 335, 50, 820], [2060, 255, 40, 740],
            [2260, 175, 35, 700], [2460, 265, 45, 780], [2660, 185, 35, 700],
            [2850, 105, 30, 650], [3050, 205, 40, 740], [3260, 305, 50, 820],
            [3480, 225, 40, 740], [3670, 145, 35, 680], [3870, 255, 45, 780],
            [4090, 355, 55, 880],
        ],
        trampolines: [[330, 466], [950, 326], [1730, 356], [2350, 286], [3150, 326], [3970, 376]],
        falling: [[520, 170], [720, 120], [1110, 130], [1500, 100], [1700, 130], [1930, 150], [2330, 120], [2730, 80], [3120, 130], [3350, 110], [3750, 140], [3950, 170]],
        flag: [4380, 400],
    },
    createGuardianTrial(10, 'Thunder Plains', 40, THEME_THUNDER, 0),
    createGuardianTrial(11, "Ancestor's Crossing", 42, THEME_ANCESTOR, 1),
    createGuardianTrial(12, 'Sky Shrine', 44, THEME_SKY_SHRINE, 2),
    createGuardianTrial(13, "Drought's End", 46, THEME_DROUGHT_END, 3),
    createGuardianTrial(14, "Guardian's Return", 48, THEME_RETURN, 4),
];

export const LEVEL_COUNT = LEVELS.length;
export const APPLE_TARGET = LEVELS[0].target; // legacy export for App default

export function getLevel(id: number): LevelDef {
    return LEVELS[Math.min(Math.max(id, 1), LEVEL_COUNT) - 1];
}

// ---------------------------------------------------------------------------
// EVENT BUS — shared React <-> Phaser bridge (named export).
// ---------------------------------------------------------------------------
export const EventBus = new Events.EventEmitter();

// ---------------------------------------------------------------------------
// PROCEDURAL TEXTURE FACTORY — flat vector sprites drawn with Graphics.
// ---------------------------------------------------------------------------
function makeTextures(scene: Scene): void {
    if (scene.textures.exists('frog_idle')) return; // already generated this session
    const g = scene.add.graphics();

    const frogFrame = (key: string, pose: 'idle' | 'run1' | 'run2' | 'jump' | 'fall' | 'double' | 'hit' | 'wall') => {
        g.clear();
        const cx = 16;
        g.fillStyle(COLORS.FROG_DARK, 1);
        if (pose === 'run1') { g.fillRect(cx - 9, 24, 6, 6); g.fillRect(cx + 4, 22, 6, 6); }
        else if (pose === 'run2') { g.fillRect(cx - 9, 22, 6, 6); g.fillRect(cx + 4, 24, 6, 6); }
        else if (pose === 'jump' || pose === 'double' || pose === 'wall') { g.fillRect(cx - 8, 22, 6, 8); g.fillRect(cx + 3, 22, 6, 8); }
        else if (pose === 'fall') { g.fillRect(cx - 9, 25, 7, 5); g.fillRect(cx + 3, 25, 7, 5); }
        else { g.fillRect(cx - 8, 25, 6, 5); g.fillRect(cx + 3, 25, 6, 5); }
        g.fillStyle(COLORS.FROG_BODY, 1);
        g.fillRoundedRect(cx - 10, 10, 20, 18, 6);
        g.fillStyle(COLORS.FROG_BELLY, 1);
        g.fillEllipse(cx, 22, 12, 9);
        g.fillStyle(COLORS.FROG_BODY, 1);
        g.fillRoundedRect(cx - 11, 4, 22, 12, 6);
        g.fillStyle(COLORS.EYE, 1);
        g.fillCircle(cx + 4, 9, 4);
        g.fillStyle(COLORS.PUPIL, 1);
        g.fillCircle(cx + 5, 9, 1.8);
        g.fillStyle(COLORS.SCARF, 1);
        g.fillRect(cx - 11, 14, 22, 3);
        if (pose === 'run1' || pose === 'run2') g.fillRect(cx - 16, 14, 5, 3);
        if (pose === 'hit') {
            g.fillStyle(COLORS.PUPIL, 1);
            g.fillRect(cx + 2, 7, 5, 1.5);
            g.fillRect(cx + 4, 5, 1.5, 5);
        }
        g.generateTexture(key, 32, 32);
    };
    frogFrame('frog_idle', 'idle');
    frogFrame('frog_jump', 'jump');
    frogFrame('frog_fall', 'fall');
    frogFrame('frog_double', 'double');
    frogFrame('frog_hit', 'hit');
    frogFrame('frog_wall', 'wall');
    frogFrame('frog_run0', 'run1');
    frogFrame('frog_run1', 'run2');
    frogFrame('frog_run2', 'idle');
    frogFrame('frog_run3', 'run2');

    // Apple
    g.clear();
    g.fillStyle(COLORS.APPLE_STEM, 1); g.fillRect(15, 4, 2, 5);
    g.fillStyle(0x66bb6a, 1); g.fillEllipse(20, 7, 8, 4);
    g.fillStyle(COLORS.APPLE, 1); g.fillCircle(13, 18, 9); g.fillCircle(19, 18, 9); g.fillCircle(16, 22, 9);
    g.fillStyle(0xffffff, 0.5); g.fillCircle(12, 15, 3);
    g.generateTexture('apple', 32, 32);

    // Coin
    g.clear();
    g.fillStyle(COLORS.COIN_DARK, 1); g.fillCircle(16, 16, 11);
    g.fillStyle(COLORS.COIN, 1); g.fillCircle(16, 16, 8);
    g.lineStyle(2, 0xfff3b0, 0.9); g.strokeCircle(16, 16, 6);
    g.fillStyle(0xfff8dc, 0.85); g.fillRoundedRect(13, 9, 4, 14, 2);
    g.generateTexture('coin', 32, 32);

    // Collect burst
    g.clear();
    g.fillStyle(0xffee58, 1);
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillCircle(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 2.5);
    }
    g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 4);
    g.generateTexture('collect_fx', 32, 32);

    // Saw blade
    g.clear();
    g.fillStyle(COLORS.SAW_DARK, 1);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = 19 + Math.cos(a) * 18, y = 19 + Math.sin(a) * 18;
        g.fillTriangle(x, y, 19 + Math.cos(a + 0.25) * 11, 19 + Math.sin(a + 0.25) * 11, 19 + Math.cos(a - 0.25) * 11, 19 + Math.sin(a - 0.25) * 11);
    }
    g.fillStyle(COLORS.SAW, 1); g.fillCircle(19, 19, 12);
    g.fillStyle(COLORS.SAW_DARK, 1); g.fillCircle(19, 19, 4);
    g.generateTexture('saw', 38, 38);

    // Trampoline
    g.clear();
    g.fillStyle(0x37474f, 1); g.fillRect(2, 20, 24, 6);
    g.fillStyle(0x1e88e5, 1); g.fillRoundedRect(1, 12, 26, 9, 4);
    g.fillStyle(0x90caf9, 1); g.fillRect(3, 13, 22, 2);
    g.fillStyle(0x546e7a, 1); g.fillRect(4, 20, 3, 6); g.fillRect(21, 20, 3, 6);
    g.generateTexture('trampoline', 28, 28);

    // Falling platform
    g.clear();
    g.fillStyle(COLORS.DIRT, 1); g.fillRect(0, 3, 32, 7);
    g.fillStyle(COLORS.GRASS, 1); g.fillRect(0, 0, 32, 4);
    g.fillStyle(COLORS.GRASS_CAP, 1); g.fillRect(0, 0, 32, 2);
    g.generateTexture('fall_plat', 32, 10);

    // Checkpoint flag
    g.clear();
    g.fillStyle(COLORS.FLAG_POLE, 1); g.fillRect(10, 6, 4, 56);
    g.fillStyle(0x90a4ae, 1); g.fillCircle(12, 6, 4);
    g.fillStyle(COLORS.FLAG_CLOTH, 1);
    g.fillTriangle(14, 10, 14, 30, 52, 20);
    g.fillStyle(0xffb300, 1);
    g.fillTriangle(14, 20, 14, 30, 40, 25);
    g.generateTexture('flag', 64, 64);

    // Cloud
    g.clear();
    g.fillStyle(0xffffff, 0.92);
    g.fillCircle(30, 30, 18); g.fillCircle(55, 24, 22); g.fillCircle(82, 30, 16); g.fillRect(30, 30, 52, 16);
    g.generateTexture('cloud', 120, 48);

    g.destroy();
}

function lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t), gg = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (gg << 8) | bl;
}

// ---------------------------------------------------------------------------
// START GAME FACTORY
// ---------------------------------------------------------------------------
const StartGame = (parent: string) => {
    const config: Phaser.Types.Core.GameConfig = {
        type: AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent,
        backgroundColor: COLORS.BACKGROUND,
        roundPixels: true,
        scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
        physics: {
            default: 'arcade',
            arcade: { gravity: { x: 0, y: GRAVITY_Y }, debug: false },
        },
        scene: [Game],
    };
    const game = new PhaserGame(config);
    if (typeof window !== 'undefined') {
        (window as any).__PHASER_GAME__ = game;
        (window as any).__PHASER_EVENT_BUS__ = EventBus;
    }
    return game;
};

// ---------------------------------------------------------------------------
// GAME SCENE
// ---------------------------------------------------------------------------
type Phase = 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'FINISHED';

interface StartOpts { level?: number }

export class Game extends Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private platforms!: Phaser.Physics.Arcade.StaticGroup;
    private apples!: Phaser.Physics.Arcade.StaticGroup;
    private coins!: Phaser.Physics.Arcade.StaticGroup;
    private saws!: Phaser.Physics.Arcade.Group;
    private trampolines!: Phaser.Physics.Arcade.StaticGroup;
    private falling!: Phaser.Physics.Arcade.Group;
    private levelColliders: Phaser.Physics.Arcade.Collider[] = [];

    private levelObjects: Phaser.GameObjects.GameObject[] = [];
    private worldGfx: Phaser.GameObjects.Graphics | null = null;
    private sky: Phaser.GameObjects.Image | null = null;
    private flagObj: Phaser.GameObjects.Image | null = null;

    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keyA!: Phaser.Input.Keyboard.Key;
    private keyD!: Phaser.Input.Keyboard.Key;
    private keyW!: Phaser.Input.Keyboard.Key;
    private keySpace!: Phaser.Input.Keyboard.Key;

    private phase: Phase = 'MENU';
    private levelId = 1;
    private level: LevelDef = LEVELS[0];
    private lives = MAX_LIVES;
    private fruits = 0;
    private coinsCollected = 0;
    private elapsed = 0;
    private invulnUntil = 0;
    private jumpsUsed = 0;
    private coyoteUntil = 0;
    private jumpBufferUntil = 0;
    private wallDir = 0;
    private checkpointX = 80;
    private checkpointY = 400;
    private running = false;
    private finished = false;
    private countdownTimer?: Phaser.Time.TimerEvent;

    private touchLeft = false;
    private touchRight = false;
    private touchJump = false;
    private jumpWasDown = false;

    constructor() { super('Game'); }

    preload() {
        this.load.audio('sfx_jump', 'assets/audio/sfx_jump.mp3');
        this.load.audio('sfx_collect', 'assets/audio/sfx_collect.mp3');
        this.load.audio('sfx_hit', 'assets/audio/sfx_hit.mp3');
        this.load.audio('sfx_win', 'assets/audio/sfx_win.mp3');
        this.load.audio('sfx_gameover', 'assets/audio/sfx_gameover.mp3');
    }

    create() {
        makeTextures(this);

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.keyA = this.input.keyboard!.addKey('A');
        this.keyD = this.input.keyboard!.addKey('D');
        this.keyW = this.input.keyboard!.addKey('W');
        this.keySpace = this.input.keyboard!.addKey('SPACE');
        this.input.keyboard!.on('keydown-ESC', () => this.togglePause());
        this.input.keyboard!.on('keydown-P', () => this.togglePause());
        this.input.keyboard!.on('keydown-SPACE', () => this.onConfirmKey());
        this.input.keyboard!.on('keydown-ENTER', () => this.onConfirmKey());

        EventBus.on(EVT.START_GAME, this.onStartEvent, this);
        EventBus.on(EVT.RESTART_GAME, this.restartGame, this);
        EventBus.on(EVT.GO_MENU, this.goMenu, this);
        EventBus.on(EVT.TOGGLE_PAUSE, this.togglePause, this);
        EventBus.on(EVT.TOUCH_INPUT, this.onTouchInput, this);
        EventBus.on(EVT.SELECT_LEVEL, this.selectLevel, this);

        // Build the player once (camera follows it across levels).
        this.buildPlayer();

        // Build the initial level (Level 1).
        this.buildLevel(1);

        this.setPhase('MENU');
        EventBus.emit(EVT.SCENE_READY, this);

        this.events.once('shutdown', () => {
            this.time.removeAllEvents();
            this.tweens.killAll();
            this.input.keyboard?.removeAllListeners();
            this.sound.stopAll();
            EventBus.off(EVT.START_GAME, this.onStartEvent, this);
            EventBus.off(EVT.RESTART_GAME, this.restartGame, this);
            EventBus.off(EVT.GO_MENU, this.goMenu, this);
            EventBus.off(EVT.TOGGLE_PAUSE, this.togglePause, this);
            EventBus.off(EVT.TOUCH_INPUT, this.onTouchInput, this);
            EventBus.off(EVT.SELECT_LEVEL, this.selectLevel, this);
        });
    }

    // ---- React event adapters ---------------------------------------------
    private onStartEvent(opts?: StartOpts) {
        this.startGame(opts?.level);
    }

    private selectLevel(data: { level: number }) {
        const id = Math.min(Math.max(data.level || 1, 1), LEVEL_COUNT);
        if (id !== this.levelId) {
            this.buildLevel(id);
        }
        EventBus.emit(EVT.LEVEL_CHANGED, { level: id, name: this.level.name });
        // Reset to menu state on the chosen level.
        this.goMenu();
    }

    // ---- World construction ------------------------------------------------
    private buildPlayer() {
        this.player = this.physics.add.sprite(this.checkpointX, this.checkpointY, 'frog_idle');
        this.player.setCollideWorldBounds(true);
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(20, 26).setOffset(6, 4);
        (this.player.body as Phaser.Physics.Arcade.Body).setMaxVelocityY(900);
        this.player.setDepth(10);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    }

    private clearLevel() {
        for (const c of this.levelColliders) {
            if (c && c.active) c.destroy();
        }
        this.levelColliders = [];
        for (const obj of this.levelObjects) {
            if (obj && obj.active) obj.destroy();
        }
        this.levelObjects = [];
        if (this.worldGfx) { this.worldGfx.destroy(); this.worldGfx = null; }
        if (this.sky) { this.sky.destroy(); this.sky = null; }
        if (this.flagObj) { this.flagObj.destroy(); this.flagObj = null; }
        this.platforms?.clear(true, true);
        this.apples?.clear(true, true);
        this.coins?.clear(true, true);
        this.trampolines?.clear(true, true);
        this.saws?.clear(true, true);
        this.falling?.clear(true, true);
    }

    private buildLevel(id: number) {
        this.clearLevel();
        this.levelId = id;
        this.level = getLevel(id);
        const L = this.level;
        const th = L.theme;

        this.physics.world.setBounds(0, 0, L.worldW, WORLD_H + 200);
        this.cameras.main.setBounds(0, 0, L.worldW, WORLD_H);

        // Sky gradient texture (unique per level id).
        const skyKey = `bg_sky_${id}`;
        if (!this.textures.exists(skyKey)) {
            const sg = this.add.graphics();
            for (let y = 0; y < 540; y += 4) {
                sg.fillStyle(lerpColor(th.skyTop, th.skyBottom, y / 540), 1);
                sg.fillRect(0, y, 960, 4);
            }
            sg.generateTexture(skyKey, 960, 540);
            sg.destroy();
        }
        this.sky = this.add.image(0, 0, skyKey).setOrigin(0).setScrollFactor(0).setDepth(-30);
        this.sky.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

        // Parallax hills (theme-colored, drawn to a graphics object).
        const far = this.add.graphics().setScrollFactor(0.2).setDepth(-20);
        far.fillStyle(th.hillFar, 1);
        for (let i = 0; i < Math.ceil(L.worldW / 320) + 1; i++) {
            const bx = i * 320;
            far.fillCircle(bx + 160, 470, 150);
            far.fillCircle(bx + 320, 490, 120);
        }
        const mid = this.add.graphics().setScrollFactor(0.4).setDepth(-15);
        mid.fillStyle(th.hillMid, 1);
        for (let i = 0; i < Math.ceil(L.worldW / 300) + 1; i++) {
            const bx = i * 300;
            mid.fillCircle(bx + 120, 520, 130);
            mid.fillCircle(bx + 260, 540, 110);
        }
        const cloudCount = id === 3 ? 0 : 6;
        for (let i = 0; i < cloudCount; i++) {
            const c = this.add.image(120 + i * 400, 60 + (i % 3) * 45, 'cloud')
                .setScrollFactor(0.15).setDepth(-18).setAlpha(0.9);
            this.levelObjects.push(c);
        }
        // Stars for the night level.
        if (id === 3) {
            const stars = this.add.graphics().setScrollFactor(0.1).setDepth(-19);
            for (let i = 0; i < 60; i++) {
                const sx = Math.random() * GAME_WIDTH;
                const sy = Math.random() * 320;
                stars.fillStyle(0xffffff, 0.5 + Math.random() * 0.5);
                stars.fillRect(sx, sy, 2, 2);
            }
            this.worldGfx = stars;
        } else {
            this.worldGfx = far;
        }
        const near = this.add.graphics().setScrollFactor(0.6).setDepth(-10);
        near.fillStyle(th.hillNear, 1);
        for (let i = 0; i < Math.ceil(L.worldW / 200) + 1; i++) {
            const bx = i * 200;
            near.fillTriangle(bx, 560, bx + 40, 470 + (i % 3) * 20, bx + 80, 560);
        }
        if (id !== 3) this.levelObjects.push(far, mid, near);
        else this.levelObjects.push(far, mid, near);

        // Platform block texture tinted per theme.
        const blockKey = `plat_block_${id}`;
        if (!this.textures.exists(blockKey)) {
            const bg = this.add.graphics();
            bg.fillStyle(th.dirt, 1); bg.fillRect(0, 0, 32, 32);
            bg.fillStyle(th.dirtDark, 1); bg.fillRect(0, 26, 32, 6);
            bg.fillStyle(th.grass, 1); bg.fillRect(0, 0, 32, 8);
            bg.fillStyle(th.grassCap, 1); bg.fillRect(0, 0, 32, 3);
            bg.generateTexture(blockKey, 32, 32);
            bg.destroy();
        }

        this.platforms = this.physics.add.staticGroup();
        this.apples = this.physics.add.staticGroup();
        this.coins = this.physics.add.staticGroup();
        this.trampolines = this.physics.add.staticGroup();
        this.saws = this.physics.add.group({ allowGravity: false, immovable: true });
        this.falling = this.physics.add.group({ allowGravity: false, immovable: true });

        for (const p of L.platforms) {
            const cols = Math.ceil(p.w / 32);
            const rows = Math.ceil(p.h / 32);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const tx = p.x + c * 32 + 16;
                    const ty = p.y + r * 32 + 16;
                    if (tx > L.worldW || ty > WORLD_H) continue;
                    const spr = this.platforms.create(tx, ty, blockKey);
                    spr.setDisplaySize(32, Math.min(32, WORLD_H - p.y - r * 32));
                }
            }
        }

        for (const [ax, ay] of L.apples) {
            const a = this.apples.create(ax, ay, 'apple');
            a.setData('collected', false);
            this.tweens.add({ targets: a, y: ay - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }

        // Place optional bonus coins above alternating platforms. Apples remain
        // the level objective; every coin adds 250 points.
        const coinPositions = L.platforms
            .slice(1, -1)
            .filter((_, index) => index % 2 === 0)
            .map((platform) => [platform.x + platform.w / 2, platform.y - 38] as const);
        for (const [cx, cy] of coinPositions) {
            const coin = this.coins.create(cx, cy, 'coin');
            coin.setData('collected', false);
            this.tweens.add({ targets: coin, scaleX: 0.3, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }

        for (const [sx, sy, rangeX, speed] of L.saws) {
            const s = this.saws.create(sx, sy, 'saw');
            if (s.body) (s.body as Phaser.Physics.Arcade.Body).allowGravity = false;
            this.tweens.add({ targets: s, angle: 360, duration: 500, repeat: -1 });
            this.tweens.add({ targets: s, x: sx + rangeX, duration: speed, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }

        for (const [tx, ty] of L.trampolines) {
            this.trampolines.create(tx, ty, 'trampoline');
        }

        for (const [fx, fy] of L.falling) {
            const fp = this.falling.create(fx, fy, 'fall_plat');
            fp.setData('state', 'idle');
            fp.setData('timer', 0);
            fp.setData('origX', fx);
            fp.setData('origY', fy);
        }

        // Flag on a solid platform near the end of the world.
        const [flx, fly] = L.flag;
        this.flagObj = this.physics.add.staticImage(flx, fly, 'flag').setOrigin(0.5, 1).setDepth(2) as unknown as Phaser.GameObjects.Image;
        this.flagObj.setName('flag');
        this.tweens.add({ targets: this.flagObj, scaleX: { from: 1, to: 0.9 }, duration: 700, yoyo: true, repeat: -1 });
        this.levelColliders.push(
            this.physics.add.overlap(this.player, this.flagObj, () => this.reachFlag(), undefined, this) as unknown as Phaser.Physics.Arcade.Collider,
            this.physics.add.collider(this.player, this.platforms),
            this.physics.add.collider(this.player, this.falling, this.onLandFalling, undefined, this),
            this.physics.add.overlap(this.player, this.apples, this.collectFruit, undefined, this) as unknown as Phaser.Physics.Arcade.Collider,
            this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this) as unknown as Phaser.Physics.Arcade.Collider,
            this.physics.add.overlap(this.player, this.saws, this.handleDamage, undefined, this) as unknown as Phaser.Physics.Arcade.Collider,
            this.physics.add.overlap(this.player, this.trampolines, this.onTrampoline, undefined, this) as unknown as Phaser.Physics.Arcade.Collider,
        );

        // Reset run state to this level's spawn.
        this.checkpointX = L.spawn[0];
        this.checkpointY = L.spawn[1];
        EventBus.emit(EVT.LEVEL_CHANGED, { level: id, name: L.name });
    }

    // ---- Phase / state machine --------------------------------------------
    private setPhase(p: Phase) {
        this.phase = p;
        EventBus.emit(EVT.PHASE_CHANGED, p);
    }

    private onConfirmKey() {
        if (this.phase === 'MENU') this.startGame();
        else if (this.phase === 'FINISHED') this.restartGame();
    }

    private startGame(levelId?: number) {
        if (this.phase === 'COUNTDOWN' || this.phase === 'PLAYING' || this.phase === 'PAUSED') return;
        // If a different level is requested (or we're on a finished one), rebuild it.
        const target = levelId ?? this.levelId;
        if (target !== this.levelId) {
            this.buildLevel(target);
        } else if (this.finished) {
            // Replaying the same level fresh.
            this.buildLevel(this.levelId);
        }
        if (this.countdownTimer) { this.countdownTimer.remove(); this.countdownTimer = undefined; }
        this.resetRun();
        this.setPhase('COUNTDOWN');
        this.running = false;
        this.player.setVelocity(0, 0);
        (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
        let n = 3;
        EventBus.emit(EVT.COUNTDOWN, n);
        this.countdownTimer = this.time.addEvent({
            delay: 800,
            repeat: 2,
            callback: () => {
                n -= 1;
                EventBus.emit(EVT.COUNTDOWN, n);
                if (n <= 0) {
                    if (this.countdownTimer) { this.countdownTimer.remove(); this.countdownTimer = undefined; }
                    (this.player.body as Phaser.Physics.Arcade.Body).enable = true;
                    this.running = true;
                    this.setPhase('PLAYING');
                }
            },
        });
    }

    private restartGame() {
        this.resumeWorld();
        if (this.phase === 'PAUSED') this.setPhase('MENU');
        this.startGame(this.levelId);
    }

    private goMenu() {
        this.resumeWorld();
        if (this.countdownTimer) { this.countdownTimer.remove(); this.countdownTimer = undefined; }
        this.resetRun();
        this.running = false;
        this.player.setVelocity(0, 0);
        (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
        this.setPhase('MENU');
    }

    private resumeWorld() {
        this.physics.world.resume();
        this.tweens.resumeAll();
        this.sound.resumeAll();
    }

    private resetRun() {
        this.lives = MAX_LIVES;
        this.fruits = 0;
        this.coinsCollected = 0;
        this.elapsed = 0;
        this.finished = false;
        this.checkpointX = this.level.spawn[0];
        this.checkpointY = this.level.spawn[1];
        this.invulnUntil = 0;
        this.jumpsUsed = 0;
        EventBus.emit(EVT.SCORE_UPDATED, { fruits: 0, coins: 0, target: this.level.target, score: 0 });
        EventBus.emit(EVT.LIVES_UPDATED, { lives: this.lives });
        EventBus.emit(EVT.TIMER_UPDATED, { time: 0 });
        this.player.enableBody(true, this.checkpointX, this.checkpointY, true, true);
        this.player.setTint(0xffffff);
        this.player.setVisible(true);
        for (const ch of this.apples.getChildren()) {
            const a = ch as Phaser.Physics.Arcade.Sprite;
            a.enableBody(true, a.x, a.y, true, true);
            a.setData('collected', false);
        }
        for (const ch of this.coins.getChildren()) {
            const coin = ch as Phaser.Physics.Arcade.Sprite;
            coin.enableBody(true, coin.x, coin.y, true, true);
            coin.setData('collected', false);
        }
    }

    private togglePause() {
        if (this.phase === 'PLAYING') {
            this.setPhase('PAUSED');
            this.running = false;
            this.physics.world.pause();
            this.tweens.pauseAll();
            this.sound.pauseAll();
        } else if (this.phase === 'PAUSED') {
            this.physics.world.resume();
            this.tweens.resumeAll();
            this.sound.resumeAll();
            this.running = true;
            this.setPhase('PLAYING');
        }
    }

    private onTouchInput(data: { left?: boolean; right?: boolean; jump?: boolean }) {
        if (data.left !== undefined) this.touchLeft = data.left;
        if (data.right !== undefined) this.touchRight = data.right;
        if (data.jump !== undefined) this.touchJump = data.jump;
    }

    // ---- Interactions ------------------------------------------------------
    private collectFruit(_p: unknown, obj: unknown) {
        const a = obj as Phaser.Physics.Arcade.Sprite;
        if (!a || a.getData('collected')) return;
        a.setData('collected', true);
        a.disableBody(true, true);
        this.fruits += 1;
        this.checkpointX = a.x;
        this.checkpointY = Math.min(a.y, 460);
        const burst = this.add.image(a.x, a.y, 'collect_fx').setDepth(11);
        this.levelObjects.push(burst);
        this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 260, onComplete: () => burst.destroy() });
        this.safePlay('sfx_collect');
        EventBus.emit(EVT.SCORE_UPDATED, { fruits: this.fruits, coins: this.coinsCollected, target: this.level.target, score: this.fruits * 100 + this.coinsCollected * 250 });
    }

    private collectCoin(_p: unknown, obj: unknown) {
        const coin = obj as Phaser.Physics.Arcade.Sprite;
        if (!coin || coin.getData('collected')) return;
        coin.setData('collected', true);
        coin.disableBody(true, true);
        this.coinsCollected += 1;
        const burst = this.add.image(coin.x, coin.y, 'collect_fx').setDepth(11);
        this.levelObjects.push(burst);
        this.tweens.add({ targets: burst, scale: 1.7, alpha: 0, duration: 220, onComplete: () => burst.destroy() });
        this.safePlay('sfx_collect');
        EventBus.emit(EVT.SCORE_UPDATED, { fruits: this.fruits, coins: this.coinsCollected, target: this.level.target, score: this.fruits * 100 + this.coinsCollected * 250 });
    }

    private handleDamage(_p: unknown, _obj: unknown) {
        if (this.phase !== 'PLAYING') return;
        if (this.time.now < this.invulnUntil) return;
        this.invulnUntil = this.time.now + INVULN_MS;
        this.lives -= 1;
        this.safePlay('sfx_hit');
        this.cameras.main.shake(180, 0.015);
        this.player.setTint(0xff5252);
        this.player.setVelocity(this.player.flipX ? WALL_JUMP_X : -WALL_JUMP_X, -260);
        EventBus.emit(EVT.LIVES_UPDATED, { lives: this.lives });
        this.time.delayedCall(INVULN_MS, () => {
            if (this.player && this.player.active) this.player.setTint(0xffffff);
        });
        if (this.lives <= 0) this.die();
    }

    private onTrampoline(_p: unknown, obj: unknown) {
        const t = obj as Phaser.Physics.Arcade.Sprite;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (!body) return;
        if (body.blocked.down || body.velocity.y > 0) {
            body.setVelocityY(TRAMPOLINE_VELOCITY);
            this.jumpsUsed = 0;
            this.safePlay('sfx_jump');
            this.tweens.add({ targets: t, scaleY: 0.6, duration: 90, yoyo: true, onComplete: () => t.setScale(1) });
        }
    }

    private onLandFalling(_p: unknown, obj: unknown) {
        const fp = obj as Phaser.Physics.Arcade.Sprite;
        if (fp.getData('state') === 'idle') {
            fp.setData('state', 'shake');
            fp.setData('timer', this.time.now + 500);
        }
    }

    private reachFlag() {
        if (this.phase !== 'PLAYING' || this.finished) return;
        this.finished = true;
        this.running = false;
        this.safePlay('sfx_win');
        const pct = this.fruits / this.level.target;
        const stars = pct >= 1 ? 3 : pct >= 0.7 ? 2 : 1;
        const score = this.fruits * 100 + this.coinsCollected * 250 + Math.max(0, 3000 - Math.floor(this.elapsed)) + stars * 500;
        const hasNextLevel = this.levelId < LEVEL_COUNT;

        const save = loadSave();
        save.bestScore = Math.max(save.bestScore, score);
        if (save.bestTime === 0 || this.elapsed < save.bestTime) save.bestTime = Math.floor(this.elapsed);
        // Per-level stars (keep best).
        const prev = save.stars[this.levelId] ?? 0;
        if (stars > prev) {
            save.stars[this.levelId] = stars;
            save.totalStars = Object.values(save.stars).reduce((a, b) => a + b, 0);
        }
        // Unlock next level on completion.
        if (hasNextLevel && save.unlocked < this.levelId + 1) {
            save.unlocked = this.levelId + 1;
        }
        writeSave(save);

        EventBus.emit(EVT.GAME_WIN, {
            level: this.levelId,
            fruits: this.fruits,
            coins: this.coinsCollected,
            target: this.level.target,
            time: Math.floor(this.elapsed),
            stars,
            score,
            hasNextLevel,
        });
        this.setPhase('FINISHED');
    }

    private die() {
        if (this.finished) return;
        this.finished = true;
        this.running = false;
        this.safePlay('sfx_gameover');
        const save = loadSave();
        const runScore = this.fruits * 100 + this.coinsCollected * 250;
        save.bestScore = Math.max(save.bestScore, runScore);
        writeSave(save);
        EventBus.emit(EVT.GAME_OVER, { score: runScore, level: this.levelId });
        this.setPhase('FINISHED');
    }

    private respawn() {
        this.lives -= 1;
        EventBus.emit(EVT.LIVES_UPDATED, { lives: this.lives });
        if (this.lives <= 0) { this.die(); return; }
        this.player.enableBody(true, this.checkpointX, this.checkpointY - 20, true, true);
        this.player.setVelocity(0, 0);
        this.invulnUntil = this.time.now + INVULN_MS;
        this.cameras.main.shake(120, 0.01);
    }

    // ---- Update loop -------------------------------------------------------
    update(time: number, delta: number) {
        if (!this.player) return;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        if (!body) return;

        if (this.phase === 'PLAYING' && this.falling && typeof this.falling.getChildren === 'function') {
            for (const ch of this.falling.getChildren()) {
                const fp = ch as Phaser.Physics.Arcade.Sprite;
                const fb = fp.body as Phaser.Physics.Arcade.Body | null;
                if (!fb) continue;
                const st = fp.getData('state');
                if (st === 'shake' && time > (fp.getData('timer') as number)) {
                    fp.setData('state', 'falling');
                    fb.allowGravity = true;
                    this.tweens.add({ targets: fp, alpha: 0, duration: 800 });
                    this.time.delayedCall(1200, () => {
                        if (!fp.active) return;
                        fp.enableBody(false, fp.x, fp.y, true, true);
                        fb.allowGravity = false;
                        fb.reset(fp.getData('origX') as number, fp.getData('origY') as number);
                        fp.setAlpha(1);
                        fp.setData('state', 'idle');
                    });
                }
            }
        }

        if (!this.running || this.phase !== 'PLAYING') return;

        this.elapsed += delta / 1000;
        if (Math.floor(this.elapsed * 10) % 5 === 0) EventBus.emit(EVT.TIMER_UPDATED, { time: Math.floor(this.elapsed) });

        const left = this.cursors.left.isDown || this.keyA.isDown || this.touchLeft;
        const right = this.cursors.right.isDown || this.keyD.isDown || this.touchRight;
        const jumpDown = this.cursors.up.isDown || this.keyW.isDown || this.keySpace.isDown || this.touchJump;

        const speed = PLAYER_RUN;
        if (left && !right) { body.setVelocityX(-speed); this.player.setFlipX(true); }
        else if (right && !left) { body.setVelocityX(speed); this.player.setFlipX(false); }
        else { body.setVelocityX(body.velocity.x * 0.6); }

        const onGround = body.blocked.down || body.touching.down;
        if (onGround) { this.jumpsUsed = 0; this.coyoteUntil = time + COYOTE_MS; }

        this.wallDir = 0;
        if (!onGround) {
            if (body.blocked.left) this.wallDir = -1;
            else if (body.blocked.right) this.wallDir = 1;
        }

        const jumpPressed = jumpDown && !this.jumpWasDown;
        if (jumpPressed) this.jumpBufferUntil = time + JUMP_BUFFER_MS;
        this.jumpWasDown = jumpDown;

        const wantJump = time < this.jumpBufferUntil;

        if (wantJump) {
            if (onGround || time < this.coyoteUntil) {
                body.setVelocityY(JUMP_VELOCITY);
                this.jumpsUsed = 1;
                this.jumpBufferUntil = 0;
                this.safePlay('sfx_jump');
            } else if (this.wallDir !== 0) {
                body.setVelocityX(-this.wallDir * WALL_JUMP_X);
                body.setVelocityY(WALL_JUMP_Y);
                this.player.setFlipX(this.wallDir < 0);
                this.jumpsUsed = 1;
                this.jumpBufferUntil = 0;
                this.safePlay('sfx_jump');
            } else if (this.jumpsUsed < 2) {
                body.setVelocityY(DOUBLE_JUMP_VELOCITY);
                this.jumpsUsed = 2;
                this.jumpBufferUntil = 0;
                this.safePlay('sfx_jump');
                this.spawnDoubleJumpRing();
            }
        }

        if (this.wallDir !== 0 && body.velocity.y > 60 && ((this.wallDir < 0 && left) || (this.wallDir > 0 && right))) {
            body.setVelocityY(60);
        }

        this.updateAnim(body, onGround);

        if (this.player.y > KILL_Y) this.respawn();
    }

    private updateAnim(body: Phaser.Physics.Arcade.Body, onGround: boolean) {
        const moving = Math.abs(body.velocity.x) > 20;
        if (this.time.now < this.invulnUntil && Math.floor(this.time.now / 80) % 2 === 0) {
            this.player.setAlpha(0.4);
        } else {
            this.player.setAlpha(1);
        }
        if (!onGround) {
            this.player.anims.stop();
            if (this.wallDir !== 0) this.player.setTexture('frog_wall');
            else if (this.jumpsUsed === 2 && body.velocity.y < 0) this.player.setTexture('frog_double');
            else if (body.velocity.y < -40) this.player.setTexture('frog_jump');
            else this.player.setTexture('frog_fall');
        } else if (moving) {
            const frame = Math.floor(this.time.now / 90) % 4;
            const key = 'frog_run' + frame;
            if (this.player.texture.key !== key) this.player.setTexture(key);
        } else {
            this.player.anims.stop();
            this.player.setTexture('frog_idle');
        }
    }

    private spawnDoubleJumpRing() {
        const ring = this.add.circle(this.player.x, this.player.y + 6, 10, 0xffffff, 0)
            .setStrokeStyle(3, 0xffffff, 0.8).setDepth(9);
        this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    }

    private safePlay(key: string) {
        if (this.cache.audio.exists(key)) this.sound.play(key, { volume: 0.6 });
    }
}

export default StartGame;
