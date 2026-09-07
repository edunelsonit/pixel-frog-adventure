import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame, {
    EventBus, EVT, MAX_LIVES, LEVELS, LEVEL_COUNT, hydrateProgress, readProgress,
} from './game/main';

export interface IRefPhaserGame {
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

type Phase = 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'FINISHED';

interface WinResult {
    level: number; fruits: number; target: number; time: number;
    stars: number; score: number; hasNextLevel: boolean;
}

const STORY_PAGES = [
    { eyebrow: 'The Legend of the River Guardian', title: 'When the River Fell Silent', icon: '☀️', text: 'A terrible drought has struck the African heartlands. The sacred river is fading, the grass has turned brittle, and the villages are waiting for a hero.' },
    { eyebrow: 'A Small Hero Steps Forward', title: 'Kito Accepts the Journey', icon: '🐸', text: 'Kito, a brave green frog from the riverbank, answers the elders’ call. To awaken the river, he must cross the ancient path and recover the blessings stolen from the land.' },
    { eyebrow: 'Memories of Rain', title: 'Gather the Sacred Apples', icon: '🍎', text: 'Every apple holds a memory of rain, hope, and life. Kito must collect enough of them while crossing cliffs, moving platforms, falling stones, trampolines, and the deadly saw spirits.' },
    { eyebrow: 'Your Adventure Begins', title: 'Make the River Remember', icon: '🌧️', text: 'Run with courage. Leap with purpose. Gather hope. Reach the shrine flag before time runs out—and restore water and life to the valley.' },
] as const;

function isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function fmtTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    const [phase, setPhase] = useState<Phase>('MENU');
    const [fruits, setFruits] = useState(0);
    const [target, setTarget] = useState(LEVELS[0].target);
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(MAX_LIVES);
    const [time, setTime] = useState(0);
    const [countdown, setCountdown] = useState(3);
    const [win, setWin] = useState<WinResult | null>(null);
    const [overScore, setOverScore] = useState<number | null>(null);
    const [touch] = useState<boolean>(isTouchDevice);
    const [showStory, setShowStory] = useState(true);
    const [storyPage, setStoryPage] = useState(0);

    // Level progression state.
    const [level, setLevel] = useState(1);
    const [levelName, setLevelName] = useState(LEVELS[0].name);
    const [unlocked, setUnlocked] = useState(1);
    const [starsByLevel, setStarsByLevel] = useState<Record<number, number>>({});

    // Load persisted progress on mount.
    useEffect(() => {
        void hydrateProgress().then((save) => {
            setUnlocked(save.unlocked);
            setStarsByLevel(save.stars || {});
        });
    }, []);

    // Mount the Phaser game into #game-container exactly once; destroy on unmount.
    useLayoutEffect(() => {
        if (phaserRef.current === null) {
            const game = StartGame('game-container');
            phaserRef.current = { game, scene: null };
        }
        const readyHandler = (scene: Phaser.Scene) => {
            if (phaserRef.current) phaserRef.current.scene = scene;
        };
        EventBus.on(EVT.SCENE_READY, readyHandler);
        return () => {
            EventBus.removeListener(EVT.SCENE_READY, readyHandler);
            if (phaserRef.current) {
                phaserRef.current.game?.destroy(true);
                phaserRef.current = null;
            }
        };
    }, []);

    // Subscribe to scene -> React state events.
    useEffect(() => {
        const onPhase = (p: Phase) => setPhase(p);
        const onScore = (d: { fruits: number; target: number; score: number }) => {
            setFruits(d.fruits); setTarget(d.target); setScore(d.score);
        };
        const onLives = (d: { lives: number }) => setLives(d.lives);
        const onTimer = (d: { time: number }) => setTime(d.time);
        const onWin = (d: WinResult) => {
            setWin(d); setOverScore(null);
            // Refresh persisted progress (unlocks + stars) after a win.
            const save = readProgress();
            setUnlocked(save.unlocked);
            setStarsByLevel(save.stars || {});
        };
        const onOver = (d: { score: number; level: number }) => { setOverScore(d.score); setWin(null); void d.level; };
        const onCount = (n: number) => setCountdown(n);
        const onLevel = (d: { level: number; name: string }) => { setLevel(d.level); setLevelName(d.name); };

        EventBus.on(EVT.PHASE_CHANGED, onPhase);
        EventBus.on(EVT.SCORE_UPDATED, onScore);
        EventBus.on(EVT.LIVES_UPDATED, onLives);
        EventBus.on(EVT.TIMER_UPDATED, onTimer);
        EventBus.on(EVT.GAME_WIN, onWin);
        EventBus.on(EVT.GAME_OVER, onOver);
        EventBus.on(EVT.COUNTDOWN, onCount);
        EventBus.on(EVT.LEVEL_CHANGED, onLevel);

        return () => {
            EventBus.removeListener(EVT.PHASE_CHANGED, onPhase);
            EventBus.removeListener(EVT.SCORE_UPDATED, onScore);
            EventBus.removeListener(EVT.LIVES_UPDATED, onLives);
            EventBus.removeListener(EVT.TIMER_UPDATED, onTimer);
            EventBus.removeListener(EVT.GAME_WIN, onWin);
            EventBus.removeListener(EVT.GAME_OVER, onOver);
            EventBus.removeListener(EVT.COUNTDOWN, onCount);
            EventBus.removeListener(EVT.LEVEL_CHANGED, onLevel);
        };
    }, []);

    const startGame = () => { setWin(null); setOverScore(null); EventBus.emit(EVT.START_GAME, { level }); };
    const openStory = () => { setStoryPage(0); setShowStory(true); };
    const closeStory = () => { setShowStory(false); setStoryPage(0); };
    const advanceStory = () => {
        if (storyPage < STORY_PAGES.length - 1) setStoryPage((page) => page + 1);
        else { closeStory(); startGame(); }
    };
    const startLevel = (id: number) => {
        setWin(null); setOverScore(null);
        setLevel(id); setLevelName(LEVELS[id - 1].name);
        EventBus.emit(EVT.START_GAME, { level: id });
    };
    const selectLevel = (id: number) => {
        if (id > unlocked) return;
        setLevel(id); setLevelName(LEVELS[id - 1].name);
        EventBus.emit(EVT.SELECT_LEVEL, { level: id });
    };
    const nextLevel = () => {
        const next = Math.min(level + 1, LEVEL_COUNT);
        startLevel(next);
    };
    const restart = () => { setWin(null); setOverScore(null); EventBus.emit(EVT.RESTART_GAME); };
    const goMenu = () => { setWin(null); setOverScore(null); EventBus.emit(EVT.GO_MENU); };
    const togglePause = () => EventBus.emit(EVT.TOGGLE_PAUSE);

    const sendTouch = (data: { left?: boolean; right?: boolean; jump?: boolean }) =>
        EventBus.emit(EVT.TOUCH_INPUT, data);

    const holdBtn = (key: 'left' | 'right' | 'jump') => ({
        onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); sendTouch({ [key]: true }); },
        onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); sendTouch({ [key]: false }); },
        onPointerLeave: () => sendTouch({ [key]: false }),
        onPointerCancel: () => sendTouch({ [key]: false }),
    });

    const hearts = Array.from({ length: MAX_LIVES }, (_, i) => i < lives);
    const allBeaten = win && !win.hasNextLevel;

    return (
        <div id="app">
            <div id="game-container"></div>

            <div id="hud">
                {/* ---- In-game HUD (top bar) ---- */}
                {(phase === 'PLAYING' || phase === 'PAUSED' || phase === 'COUNTDOWN') && (
                    <div className="hud-top">
                        <div className="hud-left">
                            <div className="hud-level-badge">
                                <span className="lvl-num">LVL {level}</span>
                                <span className="lvl-name">{levelName}</span>
                            </div>
                            <div className="hud-hearts" aria-label={`${lives} lives`}>
                                {hearts.map((full, i) => (
                                    <span key={i} className={full ? 'heart full' : 'heart'}>♥</span>
                                ))}
                            </div>
                            <div className="hud-fruit">
                                <span className="fruit-dot" /> {fruits}
                                <span className="hud-dim"> / {target}</span>
                            </div>
                        </div>
                        <div className="hud-center">
                            <span className="hud-score">{score}</span>
                        </div>
                        <div className="hud-right">
                            <div className="hud-time">⏱ {fmtTime(time)}</div>
                            <button className="icon-btn" onClick={togglePause} aria-label="Pause">
                                {phase === 'PAUSED' ? '▶' : '❚❚'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ---- Countdown overlay ---- */}
                {phase === 'COUNTDOWN' && countdown > 0 && (
                    <div className="overlay center">
                        <div className="countdown-num">{countdown}</div>
                    </div>
                )}

                {/* ---- MENU ---- */}
                {phase === 'MENU' && showStory && (
                    <div className="overlay center story-overlay">
                        <div className="panel story-panel">
                            <button className="story-skip" onClick={closeStory}>Skip story</button>
                            <div className="story-art" aria-hidden="true">{STORY_PAGES[storyPage].icon}</div>
                            <p className="story-eyebrow">{STORY_PAGES[storyPage].eyebrow}</p>
                            <h1 className="title story-title">{STORY_PAGES[storyPage].title}</h1>
                            <p className="story-copy">{STORY_PAGES[storyPage].text}</p>
                            <div className="story-progress" aria-label={`Story page ${storyPage + 1} of ${STORY_PAGES.length}`}>
                                {STORY_PAGES.map((_, index) => <span key={index} className={index === storyPage ? 'active' : ''} />)}
                            </div>
                            <div className="story-actions">
                                {storyPage > 0 && <button className="btn" onClick={() => setStoryPage((page) => page - 1)}>← Back</button>}
                                <button className="btn primary" onClick={advanceStory}>
                                    {storyPage === STORY_PAGES.length - 1 ? `Begin Level ${level} ▶` : 'Continue →'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {phase === 'MENU' && !showStory && (
                    <div className="overlay center menu">
                        <div className="panel">
                            <h1 className="title">Pixel Frog <span>Adventure</span></h1>
                            <p className="subtitle">A precision platformer. Collect apples, dodge saws, reach the flag.</p>

                            <div className="level-select">
                                <div className="level-select-label">Select Level</div>
                                <div className="level-tabs">
                                    {LEVELS.map((lv) => {
                                        const isLocked = lv.id > unlocked;
                                        const earned = starsByLevel[lv.id] ?? 0;
                                        const active = lv.id === level;
                                        return (
                                            <button
                                                key={lv.id}
                                                className={`level-tab${active ? ' active' : ''}${isLocked ? ' locked' : ''}`}
                                                disabled={isLocked}
                                                onClick={() => selectLevel(lv.id)}
                                                aria-label={`Level ${lv.id}${isLocked ? ' locked' : ''}`}
                                            >
                                                <span className="lt-num">{isLocked ? '🔒' : lv.id}</span>
                                                <span className="lt-name">{lv.name}</span>
                                                <span className="lt-stars">
                                                    {[0, 1, 2].map((i) => (
                                                        <span key={i} className={i < earned ? 'star on' : 'star'}>★</span>
                                                    ))}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rules">
                                <div className="rule"><b>Move</b> A / D or ← →</div>
                                <div className="rule"><b>Jump</b> Space / W / ↑ (double jump, wall jump)</div>
                                <div className="rule"><b>Pause</b> Esc / P</div>
                            </div>
                            <button className="btn primary big" onClick={startGame}>▶ Start Level {level}</button>
                            <button className="btn story-button" onClick={openStory}>📖 Read Kito’s Story</button>
                        </div>
                    </div>
                )}

                {/* ---- PAUSED ---- */}
                {phase === 'PAUSED' && (
                    <div className="overlay center">
                        <div className="panel">
                            <h2 className="title small">Paused</h2>
                            <button className="btn primary" onClick={togglePause}>▶ Resume</button>
                            <button className="btn" onClick={restart}>↻ Restart</button>
                            <button className="btn" onClick={goMenu}>Menu</button>
                        </div>
                    </div>
                )}

                {/* ---- WIN ---- */}
                {phase === 'FINISHED' && win && (
                    <div className="overlay center">
                        <div className="panel">
                            <h2 className="title small">
                                {allBeaten ? 'Game Completed! 🏆' : `Level ${win.level} Complete! 🎉`}
                            </h2>
                            <div className="level-badge-inline">LVL {win.level}: {LEVELS[win.level - 1].name}</div>
                            <div className="stars">
                                {[0, 1, 2].map((i) => (
                                    <span key={i} className={i < win.stars ? 'star on' : 'star'}>★</span>
                                ))}
                            </div>
                            <div className="stat-row"><span>Apples</span><b>{win.fruits} / {win.target}</b></div>
                            <div className="stat-row"><span>Time</span><b>{fmtTime(win.time)}</b></div>
                            <div className="stat-row"><span>Score</span><b>{win.score}</b></div>
                            {allBeaten ? (
                                <>
                                    <p className="subtitle">You mastered all seven levels. Champion frog! 🐸</p>
                                    <button className="btn primary" onClick={() => startLevel(1)}>↻ Play Again</button>
                                    <button className="btn" onClick={goMenu}>Menu</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn primary big" onClick={nextLevel}>Next Level ➜</button>
                                    <button className="btn" onClick={restart}>↻ Replay Level</button>
                                    <button className="btn" onClick={goMenu}>Menu</button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ---- GAME OVER ---- */}
                {phase === 'FINISHED' && overScore !== null && (
                    <div className="overlay center">
                        <div className="panel">
                            <h2 className="title small danger">Game Over</h2>
                            <div className="level-badge-inline">LVL {level}: {levelName}</div>
                            <div className="stat-row"><span>Score</span><b>{overScore}</b></div>
                            <p className="subtitle">The frog ran out of lives. Try again!</p>
                            <button className="btn primary" onClick={restart}>↻ Retry Level</button>
                            <button className="btn" onClick={goMenu}>Menu</button>
                        </div>
                    </div>
                )}

                {/* ---- Touch controls ---- */}
                {touch && (phase === 'PLAYING') && (
                    <div className="touch-controls">
                        <div className="touch-left">
                            <button className="tbtn" {...holdBtn('left')} aria-label="Left">◀</button>
                            <button className="tbtn" {...holdBtn('right')} aria-label="Right">▶</button>
                        </div>
                        <button className="tbtn jump" {...holdBtn('jump')} aria-label="Jump">⤒</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
