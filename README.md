# Webball

A browser basketball game with instant solo shootaround and asynchronous two-player games. On first visiting the home page, shoot right away, catch your own rebounds, and track your shots and baskets. Choose Invite a friend to start a two-player match. In a match, a miss stores a deterministic bounce on the server, and the next player starts that bounce when they return. A catch earns the next shot; a basket earns two points and passes the turn.

## Run

Requires Node.js 22 or newer. Install the pinned Three.js dependency once with `npm ci`. No asset build step or CDN is required.

```sh
npm start
```

Open the server on port 3000 to practice immediately without a name or second player. Solo stats last for the current page session. For two players, choose Invite a friend, enter a player name, and share the invite link. Use separate browsers or browser profiles for the two players. Returning players should use their original browser and game link: an HTTP-only cookie identifies their seat. The home page opens solo mode; Return to your game opens your last match. Solo practice does not change a saved multiplayer match. Player names are display names, not password accounts.

Press and hold the ball, drag upward, then release to shoot. Use touch on a screen or click-and-drag on a mouse or trackpad. Hovering, scrolling, and pressing elsewhere on the court do not shoot. Drag direction sets lateral aim; length and release speed set launch power. A faster flick of the same length launches farther and can overshoot. A smooth upward flick of roughly a third of the court height is a useful starting point. Short, sideways, and overpowered flicks miss; shots can also bounce off the rim or backboard.

In solo mode, a miss automatically continues into your rebound: tap the moving ball to catch it and shoot from that spot, or choose Return to starting spot. In a match, press Play the rebound first. During a rebound, Space also catches the ball when the court is focused. If the ball escapes or you leave, replay the saved bounce when you return.

The court is a real Three.js WebGL scene with textured meshes, lighting, shadows, and a camera at player eye level. The camera follows the ball during a shot or rebound. A catch saves its exact court coordinates for that player; their next shot and view use that location, including after a reload or server restart. The shared simulation uses gravity, sphere/rim and backboard collisions, floor restitution, and friction. Misses store the simulated 3D path after the first impact; replaying it continues exactly where the shooting animation ends. Older saved rebounds remain playable.

```sh
npm test
```

Tests cover solo stats and rebounds, both match seats, turn enforcement, gesture-based scoring, saved rebounds across a server restart, catch validation, replay after timeout, deterministic trajectories, floor bounds, decreasing bounce energy, rim/backboard deflections, saved catch locations, WebGL camera agreement, and flick speed. Browser checks exercise hover and scroll prevention, starting a drag on the ball, mouse/touch shooting, and switching between solo mode and a match.

## Persistence and hosting

`PORT` defaults to `3000`. `DATA_DIR` defaults to `.data` in this checkout. Games and seat credentials are stored in `games.json` using atomic file replacement. Keep that directory on persistent storage, run a single server instance, and use HTTPS when exposing the game publicly. Both players must connect to the same running server; a shared URL must be reachable from their devices. Live games refresh every 2.5 seconds.

This prototype has browser-based seats rather than account recovery: clearing cookies loses access to your seat. It does not provide production authentication, rate limiting, or multi-server database coordination. Back up the data directory to retain games.

## Browser-only deployment

`render.yaml` describes a single Render web service with a persistent disk. The starter service and disk are paid resources; review current pricing before creating them. Once the source is available in your GitHub repository, use Render's Blueprint workflow to select that repository. Render builds the Dockerfile, mounts the game disk, and assigns an HTTPS URL. Send that public URL to players; no installation is needed on their devices.

The hosting configuration enables secure cookies, including when TLS terminates at the hosting proxy. Seats remain in their browser for up to a year. `/healthz` provides a health check. The Docker image excludes local games and seat credentials. This configuration has been prepared locally; it is not evidence of an actual deployed service.
