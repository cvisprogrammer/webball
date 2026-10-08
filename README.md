# Webball

A two-player browser basketball game. Invite a friend, aim a shot, and tap the moving ball to catch a rebound. You do not need to play at the same time: a miss stores a deterministic bounce on the server, and the next player starts that bounce when they return. A catch earns the next shot; a basket earns two points and passes the turn.

## Run

Requires Node.js 22 or newer. No third-party runtime dependencies or build step.

```sh
npm start
```

Open the server on port 3000, enter a player name, and share the invite link with your friend. Use separate browsers or browser profiles for the two players. Returning players should use their original browser and game link: an HTTP-only cookie identifies their seat. Player names are display names, not password accounts.

Use the aim slider and Shoot button. For rebounds, press Play the rebound and tap the moving ball. Keyboard players can focus the court and press Space to catch. If the ball escapes or you leave, replay the saved bounce when you return.

```sh
npm test
```

Tests cover both seats, turn enforcement, scoring, saved rebounds across a server restart, catch validation, and replay after timeout.

## Persistence and hosting

`PORT` defaults to `3000`. `DATA_DIR` defaults to `.data` in this checkout. Games and seat credentials are stored in `games.json` using atomic file replacement. Keep that directory on persistent storage, run a single server instance, and use HTTPS when exposing the game publicly. Both players must connect to the same running server; a shared URL must be reachable from their devices. Live games refresh every 2.5 seconds.

This prototype has browser-based seats rather than account recovery: clearing cookies loses access to your seat. It does not provide production authentication, rate limiting, or multi-server database coordination. Back up the data directory to retain games.

## Browser-only deployment

`render.yaml` describes a single Render web service with a persistent disk. The starter service and disk are paid resources; review current pricing before creating them. Once the source is available in your GitHub repository, use Render's Blueprint workflow to select that repository. Render builds the Dockerfile, mounts the game disk, and assigns an HTTPS URL. Send that public URL to players; no installation is needed on their devices.

The hosting configuration enables secure cookies, including when TLS terminates at the hosting proxy. Seats remain in their browser for up to a year. `/healthz` provides a health check. The Docker image excludes local games and seat credentials. This configuration has been prepared locally; it is not evidence of an actual deployed service.
