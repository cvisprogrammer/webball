# Webball

A two-player browser basketball game. Invite a friend, aim a shot, and tap the moving ball to catch a rebound. You do not need to play at the same time: a miss stores a deterministic bounce on the server, and the next player starts that bounce when they return. A catch earns the next shot; a basket earns two points and passes the turn.

## Run

Requires Node.js 22 or newer. No third-party runtime dependencies or build step.

```sh
npm start
```

Open the server on port 3000, enter a player name, and share the invite link with your friend. Use separate browsers or browser profiles for the two players. Returning players should use their original browser and game link: an HTTP-only cookie identifies their seat. Player names are display names, not password accounts.

Swipe upward starting on the ball, using your finger or a mouse/trackpad click-and-drag. Swipe direction sets lateral aim; length and release speed set launch power. A smooth upward flick of roughly a third of the court height is a useful starting point. Short, sideways, and overpowered swipes miss; shots can also bounce off the rim or backboard.

For rebounds, press Play the rebound and tap the moving ball. Keyboard players can focus the court, adjust aim with Left/Right, then hold and release Space to charge and shoot. During a rebound, Space catches the ball. If the ball escapes or you leave, replay the saved bounce when you return.

The court, basket, ball, and shadow use perspective projection from 3D world coordinates. The shared simulation uses gravity, sphere/rim and backboard collisions, floor restitution, and friction. Misses store the simulated 3D path after the first impact; replaying it continues exactly where the shooting animation ends. Older saved rebounds remain playable.

```sh
npm test
```

Tests cover both seats, turn enforcement, gesture-based scoring, saved rebounds across a server restart, catch validation, replay after timeout, deterministic trajectories, floor bounds, decreasing bounce energy, and rim/backboard deflections.

## Persistence and hosting

`PORT` defaults to `3000`. `DATA_DIR` defaults to `.data` in this checkout. Games and seat credentials are stored in `games.json` using atomic file replacement. Keep that directory on persistent storage, run a single server instance, and use HTTPS when exposing the game publicly. Both players must connect to the same running server; a shared URL must be reachable from their devices. Live games refresh every 2.5 seconds.

This prototype has browser-based seats rather than account recovery: clearing cookies loses access to your seat. It does not provide production authentication, rate limiting, or multi-server database coordination. Back up the data directory to retain games.

## Browser-only deployment

`render.yaml` describes a single Render web service with a persistent disk. The starter service and disk are paid resources; review current pricing before creating them. Once the source is available in your GitHub repository, use Render's Blueprint workflow to select that repository. Render builds the Dockerfile, mounts the game disk, and assigns an HTTPS URL. Send that public URL to players; no installation is needed on their devices.

The hosting configuration enables secure cookies, including when TLS terminates at the hosting proxy. Seats remain in their browser for up to a year. `/healthz` provides a health check. The Docker image excludes local games and seat credentials. This configuration has been prepared locally; it is not evidence of an actual deployed service.
