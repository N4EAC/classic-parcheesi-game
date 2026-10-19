# Classic Parcheesi Game

A 2–4 player LAN game with optional computer opponents. Run `sudo bash install-pachisi.sh` from the package root on Ubuntu/Debian, or install `requirements.txt` and run `python server.py`. Open `http://SERVER-LAN-IP:8080`. Static files resolve relative to the server, so it can run from any working directory.

Each player joins with a nickname. Start with humans only or fill empty seats with computers. Opening two-dice rolls choose the first player, with tied leaders rerolling. Disconnected players become computers while other humans remain. When the last human disconnects, the match resets and all computer seats clear, even if spectators remain. Closing or refreshing the only human browser therefore resets the match. Reconnecting browsers can spectate an ongoing match with other humans; seats are not automatically reclaimed. Silent network failures are detected by the WebSocket heartbeat.

## Rules

Separate printable HTML summaries, based on the supplied 2007 Winning Moves rule sheet:

- English: `/rules/en`
- Portuguese (Brazil): `/rules/pt-BR`
- Spanish (Spain): `/rules/es-ES`
- French (France): `/rules/fr-FR`
- Italian: `/rules/it-IT`
- Russian: `/rules/ru-RU`
- Japanese: `/rules/ja-JP`
- Chinese (Simplified): `/rules/zh-CN`
- Hindi: `/rules/hi-IN`

The server validates mandatory entry on five, separate die landings, using both dice when possible, safe spaces and entry captures, shared-track and private-lane blockades, blockade relocation restrictions, exact HOME arrival, individual 20/10-space bonuses, all-or-nothing 14-point doubles movement, and the third-doubles penalty. Each pawn visits 64 shared spaces, then seven private lane spaces, then HOME. There are 68 unique shared board coordinates.

## Verification

Install the runtime requirements, then run from this directory:

```sh
python -m unittest -v
```

The suite includes deterministic rule regressions, 20 seeded complete four-player games, and HTTP/WebSocket tests for synchronized multiplayer turns, malformed messages, disconnect replacement, last-human abandonment, recovery of old computer-only games, spectator reset restrictions, winner WAV delivery, reset, and all nine rules pages. Integration tests open temporary localhost ports.

The canvas restores text alignment on each frame, centers starting-area pawns, separates stacked and finished pawns, and keeps dice clear of completed pieces. The layout adapts to narrow screens. Manual browser testing covers joining, starting with computers, and rolling. Automated tests reduce risk but do not establish that all possible gameplay sequences are defect-free.

## Piece animation and sound

All 16 pawns have brief staggered shivers, about once every 11 seconds per pawn. Moving pawns hop over each successive square, including entry and HOME. Successive moves queue without changing the server's authoritative positions. Animation pauses in background tabs and honours the device's reduced-motion preference.

Sound is enabled by default and unlocks on the first click, tap, or keypress. Browser autoplay rules still require that initial interaction. Sound off stops scheduled notes immediately; turning it back on resumes audio. Verify the frontend behaviour with `node test_frontend.cjs` (Node.js is only needed for this development test, not the game server).

## Copy to Ubuntu over SSH

Copy the root `install-pachisi.sh` and the entire `pachisi-lan` directory, including its `rules` directory, `winner.wav`, and `music2.mp3`. The source PDF, review screenshots, Python caches, and test files are not required to run the game. The GitHub release `classic-parcheesi-game.tar.gz` contains the installer, runtime files, winner WAV, lobby MP3, rules, README, and tests.

On Ubuntu, install SSH if necessary:

```sh
sudo apt update
sudo apt install openssh-server
sudo systemctl enable --now ssh
hostname -I
```

If UFW is enabled and blocks SSH, allow `OpenSSH` with `sudo ufw allow OpenSSH`.

On the Mac, replace `USER` and `UBUNTU_IP` with the Ubuntu login and LAN IP:

```sh
scp classic-parcheesi-game.tar.gz USER@UBUNTU_IP:~/
ssh USER@UBUNTU_IP
```

Then, in the Ubuntu SSH session:

```sh
mkdir -p ~/parcheesi-update
tar -xzf ~/classic-parcheesi-game.tar.gz -C ~/parcheesi-update
cd ~/parcheesi-update/classic-parcheesi-game
sudo bash install-pachisi.sh
sudo systemctl status pachisi-lan --no-pager
```

The installer updates `/opt/pachisi-lan`, installs all nine rules pages, and starts the systemd service. Updating restarts the service and clears the current in-memory game. Open `http://UBUNTU_IP:8080` and refresh already-open game pages to load the new client.

## Winner celebration

When the match ends, a large winner announcement opens with seven colourful firework bursts and the supplied `winner.wav` recording (served at `/winner.wav`). The announcement waits for the final pawn to land. The celebration respects mute and reduced-motion settings. Close it with “Back to the board” or Escape. Repeated state broadcasts do not replay it; resetting prepares it for the next match.

## Mobile turn controls

During a match, screens up to 850px wide show a fixed action bar with turn status, dice, Roll dice, a legal-move selector, and Move piece. Choose a move and tap Move piece without scrolling below the board. The bar accounts for phone safe areas; short landscape screens place it beside the board. Joining and starting remain in the player panel. Desktop move buttons are unchanged. Responsive browser checks covered 390×844, 320×568, and 844×390 viewports.


## Wooden board and lobby music

The compact header reads “🎲 Classic Parcheesi Game”. The board uses a cached, procedurally drawn wood surface with grain beneath the coloured paint.

The supplied `music2.mp3` plays in the lobby only after the user checks Lobby music. It is off by default. Player joins do not interrupt or restart it. Starting a match stops the music and rewinds it. Resetting returns to lobby music. Sound off mutes both music and effects; background tabs and disconnected browsers pause music. Browsers may block playback until the user interacts with the page. The installer copies and the server serves `/music2.mp3`, including byte-range requests.


## Lobby music checkbox

The small Lobby music checkbox is unchecked on every page load. Checking it starts lobby music; unchecking it pauses the track. Clicking elsewhere does not enable music, and no “tap anywhere” prompt is shown. Music continues through player joins while checked, and stops and rewinds when the match starts. Sound off mutes music and effects.

All nine translated rules pages include the credit: Music: “Signal To Noise” by [@ScottBuckley](https://www.youtube.com/@ScottBuckley). “Indu” is implemented as Hindi (हिन्दी); Chinese uses Simplified Chinese (中文（简体）).

## Travelling dice

One pair of dice rests at the lower center of the active player's base. Clicking the pair or Roll dice rolls and settles the faces inside that base, keeping the HOME triangles clear. The pair stays there while dice, bonuses, and doubles are played. At the end of the turn it travels to the next occupied player's base after the moving pawn lands. Reduced-motion preferences skip the animation. Late-joining spectators see the current base without replaying previous rolls.

While lobby music plays, both dice float, rotate, and tumble through all six faces. They bounce off pieces, board edges, and each other. Impacts boost spin, which gradually slows to its cruising rate. Lobby collisions never change game-piece positions. Bases and paths fade through bright random colors, excluding black. Pausing music, muting, or starting a match ends these effects and restores normal board colors; reduced-motion preferences disable them.

## Victory Hall

Open **🏆 Victory Hall** below the board in its same-tab panel; the standalone `/victory-hall` address also remains available. Return links and Escape close the panel without disconnecting the player or opening another game. It lists Player and Wins, highest first, with alphabetical ordering for ties. Human wins are grouped by nickname without case distinctions; computer players are counted separately and labelled. Each match awards one win. Browser disconnects, abandoned matches, and game resets do not clear the ranking. Use Refresh scores to update only the hall panel.

The updated Ubuntu installer configures `/run/pachisi-lan/victory-hall.json` as a RAM-backed checkpoint using systemd's preserved runtime directory. Scores survive service stops, restarts and game updates, and clear when the machine reboots. The runtime service owns this directory; application code remains read-only. A direct development launch without `PARCHEESI_HALL_FILE` keeps scores only in Python process memory, so restarting that process clears them.

Validation includes winner counting exactly once, sorting and safe nickname rendering, keeping scores across game resets and abandonment, checkpoint restore across service restarts, and dice travel/rolling/turn changes/doubles/reduced motion.
