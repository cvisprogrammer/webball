# Webball

A browser basketball game with instant solo shootaround and asynchronous two-player games. On first visiting the home page, shoot right away, catch your own rebounds, and track your shots and baskets. Choose Invite a friend to start a two-player match. In a match, a miss stores a deterministic bounce on the server, and the next player starts that bounce when they return. A catch earns the next shot; a basket earns two points and passes the turn.

## Run

Requires Node.js 22 or newer. Install the pinned Three.js dependency once with `npm ci`. No asset build step or CDN is required.

```sh
npm start
```

Open the server on port 3000 to practice immediately without a name or second player. Solo stats last for the current page session. For two players, choose Invite a friend, enter a player name, and share the invite link. Use separate browsers or browser profiles for the two players. Returning players should use their original browser and game link: an HTTP-only cookie identifies their seat. The home page opens solo mode; Return to your game opens your last match. Solo practice does not change a saved multiplayer match. Player names are display names, not password accounts.

Press the ball, flick upward, then release while moving to shoot. Use touch on a screen or click-and-drag on a mouse or trackpad. Hovering, scrolling, and pressing elsewhere on the court do not shoot. Drag direction sets lateral aim; length and swipe velocity set launch power. A faster flick of the same length launches farther and can overshoot. Velocity follows the last 80 milliseconds of pointer movement, so your final flick is not diluted by an earlier slow drag. A 100-millisecond lift-off allowance preserves the previewed velocity while you lift your finger or mouse button; a longer pause still lowers the velocity. Start with a gentle upward swipe of roughly a third of the court height. The range guide on the right shows a green target line and scoring zone calibrated against the actual shot physics for your current catch location. Its white line previews the same power that will launch the ball on release. Moderate release assistance compresses power errors around a successful throw calibrated for the exact catch location. The starting scoring window spans 5.4 m/s of swipe power: it stays forgiving, but weak or excessively quick releases miss. Small sideways drift is corrected automatically. Faster flicks still launch farther, and extreme power or sideways errors still miss. Near-basket assistance and physical rim/backboard bounces remain in place. On target checks the actual scoring simulation, including sideways aim. Keep your drag straight and aim for the green zone; the guide suggests swiping faster, swiping slower, or straighter aim. Stopping your movement lowers the live velocity. Shoot within two seconds of pressing the ball. Short, sideways, and overpowered flicks miss; shots can also bounce off the rim or backboard.

In solo mode, a miss automatically continues into your rebound: tap the moving ball to catch it and shoot from that spot, or choose Return to starting spot. In a match, press Play the rebound first. During a rebound, Space also catches the ball when the court is focused. If the ball escapes or you leave, replay the saved bounce when you return.

The court is a real Three.js WebGL scene with textured meshes, lighting, and a camera at player eye level. Desktop rendering uses shadows; phones use smaller textures, a single-resolution framebuffer, a simple contact shadow, and at most 30 moving frames per second. If 3D initialization, rendering, or its graphics context fails, a lightweight Canvas 2D court takes over using the same camera projection, swipe input and simulated 3D path. Play and stats continue, and the 3D view returns if the context recovers.

The camera follows the ball during a shot or rebound and stays inside the room. Rebounds bounce within the playable court at every height, including high shots, so catches cannot leave players in the stands or behind the room walls. A catch saves its exact safe court coordinates for the next shot and view, including after a reload or server restart. The shared simulation uses gravity, sphere/rim and backboard collisions, floor restitution, and friction. Made shots lose downward and horizontal speed as they pass through the hanging net, then accelerate freely below it. The cords stretch, open and sway briefly from the recorded basket entry while their rim attachments stay fixed. This response settles back to the resting shape and stays synchronized in both the 3D and lightweight courts, including a graphics context switch during a shot. Misses store the simulated 3D path after the first impact; replaying it continues exactly where the shooting animation ends. Older saved rebounds remain playable: their replay and catch coordinates are constrained to the safe court, and previously saved out-of-bounds player positions are repaired on server startup without losing scores, seats, or turns. Guide calibration runs scoring-only simulations without allocating complete bounce paths.

```sh
npm test
```

Tests cover solo stats and rebounds, both match seats, turn enforcement, gesture-based scoring, saved rebounds across a server restart, catch validation, replay after timeout, deterministic trajectories, floor and court bounds, decreasing bounce energy, rim/backboard deflections, saved catch locations and out-of-bounds repair, WebGL camera agreement, recent flick velocity, agreement between guide and release power through a normal lift-off delay, forgiving shots at different catch locations, net drag after a basket, fixed net attachments, and damped net motion. Browser checks exercise gradual mouse/touch swipes that score with normal release delays, practice-to-match transitions, live range feedback, mobile rendering limits, forced graphics loss, playable fallback, restoration with preserved stats, and starting without WebGL.

## Persistence and hosting

`PORT` defaults to `3000`. `DATA_DIR` defaults to `.data` in this checkout. Games and seat credentials are stored in `games.json` using atomic file replacement. Keep that directory on persistent storage, run a single server instance, and use HTTPS when exposing the game publicly. Both players must connect to the same running server; a shared URL must be reachable from their devices. Live games refresh every 2.5 seconds.

This prototype has browser-based seats rather than account recovery: clearing cookies loses access to your seat. It does not provide production authentication, rate limiting, or multi-server database coordination. Back up the data directory to retain games.

## Browser-only deployment

`render.yaml` describes a single Render web service with a persistent disk. The starter service and disk are paid resources; review current pricing before creating them. Once the source is available in your GitHub repository, use Render's Blueprint workflow to select that repository. Render builds the Dockerfile, mounts the game disk, and assigns an HTTPS URL. Send that public URL to players; no installation is needed on their devices.

The hosting configuration enables secure cookies, including when TLS terminates at the hosting proxy. Seats remain in their browser for up to a year. `/healthz` provides a health check. The Docker image excludes local games and seat credentials. This configuration has been prepared locally; it is not evidence of an actual deployed service.
