import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export interface ProgressRecord {
    bestScore: number;
    bestTime: number;
    totalStars: number;
    unlocked: number;
    stars: Record<number, number>;
}

const databasePath = path.resolve(process.cwd(), 'data/game.sqlite');
mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);

database.exec(`
    CREATE TABLE IF NOT EXISTS game_progress (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        best_score INTEGER NOT NULL DEFAULT 0,
        best_time INTEGER NOT NULL DEFAULT 0,
        total_stars INTEGER NOT NULL DEFAULT 0,
        unlocked INTEGER NOT NULL DEFAULT 1,
        stars TEXT NOT NULL DEFAULT '{}'
    )
`);

database.prepare('INSERT OR IGNORE INTO game_progress (id) VALUES (1)').run();

const readProgress = database.prepare(`
    SELECT best_score, best_time, total_stars, unlocked, stars
    FROM game_progress WHERE id = 1
`);

const writeProgress = database.prepare(`
    UPDATE game_progress
    SET best_score = @bestScore,
        best_time = @bestTime,
        total_stars = @totalStars,
        unlocked = @unlocked,
        stars = @stars
    WHERE id = 1
`);

export function getProgress(): ProgressRecord {
    const row = readProgress.get() as {
        best_score: number;
        best_time: number;
        total_stars: number;
        unlocked: number;
        stars: string;
    };

    return {
        bestScore: row.best_score,
        bestTime: row.best_time,
        totalStars: row.total_stars,
        unlocked: row.unlocked,
        stars: JSON.parse(row.stars) as Record<number, number>,
    };
}

export function saveProgress(progress: ProgressRecord): ProgressRecord {
    writeProgress.run({
        bestScore: progress.bestScore,
        bestTime: progress.bestTime,
        totalStars: progress.totalStars,
        unlocked: progress.unlocked,
        stars: JSON.stringify(progress.stars),
    });
    return getProgress();
}