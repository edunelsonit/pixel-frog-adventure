# Pixel Frog Adventure

## The Legend of the River Guardian

Pixel Frog Adventure is a fast, skill-based platform game starring Kito, a small green frog on a mission to restore water and hope to his drought-stricken homeland. It combines arcade precision, handcrafted challenges, collectible objectives, and an African-inspired story.

## The Story

In the warm heartlands of Africa, where golden savanna rises toward misty highlands, Kito listens beside the sacred river as the elders recount the memories carried by its water. Every apple growing near the river is said to be a blessing from the sky.

Then a terrible drought strikes. The river shrinks, the grass turns brittle, and the villages grow anxious. The elders declare that the river spirit has fallen silent and that only a brave traveller can cross the ancient path to recover the stolen blessings.

Kito steps forward. His route winds across steep cliffs, thorny ridges, shifting stones, falling platforms, and saw spirits that spin like angry blades. The sacred apples hidden along the way are more than fruit: each holds a memory of rain, hope, and life.

Using the strength of the earth, the timing of the wind, and the courage of his ancestors, Kito must gather the apples and reach the flag at the river shrine. If he succeeds, the rain will return and the river will remember his name.

> Run with courage. Leap with purpose. Gather hope. Reach the flag. The river will remember your name.

## Core Gameplay

- Run left and right using keyboard or touch controls.
- Master standard jumps, double jumps, and wall jumps.
- Cross floating platforms, elevated terrain, and vertical challenge sections.
- Avoid moving saw blades and other hazards that remove a life.
- Use trampolines to reach higher ground.
- Move quickly across falling platforms before they disappear.
- Collect the required number of sacred apples in every level.
- Reach the shrine flag before time expires or all lives are lost.
- Earn up to three stars based on performance.
- Unlock new levels and improve earlier results through persistent progress tracking.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | `A` / `D` or arrow keys | Left/right buttons |
| Jump | `Space`, `W`, or up arrow | Jump button |
| Pause | `Esc` or `P` | Pause button |

## Technology

- Phaser 4
- React 19
- TypeScript
- Vite
- Tailwind CSS and shadcn/ui
- SQLite progress storage with local-storage fallback

## Run Locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

The development and preview servers run on port `3000`.

## Project Structure

```text
src/App.tsx           React interface, HUD, menus, and story screens
src/game/main.ts      Phaser game, levels, mechanics, and progression
public/style.css      Game and story presentation styles
server/               Progress API and SQLite persistence
data/game.sqlite      Local progress database
```

Built with Gebeya Dala and developed for Nelsonict Services Limited.
