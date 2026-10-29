// Portable equivalent of upstream build.sh. No Bash/GNU base64 needed.
import fs from 'node:fs';
const read=f=>fs.readFileSync(f,'utf8');
let out='<!doctype html>\n<html lang="en">\n'+read('src/00-head.html')+'\n<style>\n';
for(const [selector,file] of [['.hud-scene,.mode-card-art','art/nuketown-street.webp'],['#mapCard[data-map="terminal"] .mode-card-art','art/terminal-apron.webp']])out+=`${selector}{background-image:url("data:image/webp;base64,${fs.readFileSync(file).toString('base64')}")}\n`;
out+='</style>\n<body>\n'+read('src/01-body.html')+'\n<script src="/vendor/three.min.js"></script>\n<script src="/vendor/hands/hands.js"></script>\n<script src="/vendor/camera_utils/camera_utils.js"></script>\n';
for(const f of ['mapspec.js','terminal-mapspec.js','map-registry.js','bots.js','net-protocol.js','src/10-core.js','src/20-world.js','src/25-terminal-world.js','src/30-physics.js','src/35-map-runtime.js','src/40-weapons.js','src/50-actors.js','src/60-fx.js','src/70-game.js','src/72-pickups.js','src/75-network.js','src/78-touch.js','src/80-ui.js','src/82-store.js','gesture-controller.js','gesture-bridge.js','phone-gyro.js','src/90-main.js'])out+=`<script>\n/* ${f} */\n${read(f)}\n</script>\n`;
fs.writeFileSync('index.html',out+'</body>\n</html>\n');console.log('Built Windows-compatible gesture client');
