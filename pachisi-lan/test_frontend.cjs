// Run with Node.js: node test_frontend.cjs (no npm packages required).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const handlers={},elements={},oscillators=[],contexts=[],buffers=[],musicSources=[],gains=[];let gesture=false,tick,now=400;
function element(){return {open:false,attributes:{},style:{setProperty(){}},children:[],setAttribute(key,value){this.attributes[key]=value},replaceChildren(){this.children=[]},appendChild(child){this.children.push(child)},showModal(){this.open=true;this.shown=(this.shown||0)+1},close(){this.open=false}}}
const ctx=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{}});
elements.board={getContext:()=>ctx};
class AudioContext{
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination={};contexts.push(this)}
 async resume(){if(gesture)this.state='running'}
 createBuffer(){return {}}
 createBufferSource(){const source={connect(target){source.destination=target},disconnect(){},start(){source.started=true},stop(){source.stopped=true}};buffers.push(source);return source}
 async decodeAudioData(){return {decoded:true}}
 createOscillator(){const o={frequency:{},connect(){return this},disconnect(){},start(){assert.equal(contexts[0].state,'running');o.started=true},stop(){o.stopped=true}};oscillators.push(o);return o}
 createGain(){const events=[],node={gain:{setValueAtTime(value,time){events.push({kind:'set',value,time})},exponentialRampToValueAtTime(value,time){events.push({kind:'ramp',value,time})}},events,connect(){},disconnect(){}};gains.push(node);return node}
 createAnalyser(){return {fftSize:256,connect(){},getByteTimeDomainData(samples){samples.fill(144)}}}
 createMediaElementSource(element){const source={element,connect(){}};musicSources.push(source);return source}
}
class LobbyAudio{
 constructor(src){this.src=src;this.paused=true;this.plays=0;this.currentTime=0;this.readyState=4;this.ended=false}
 play(){this.plays++;if(this.blocked){const e=new Error('blocked');e.name='NotAllowedError';return Promise.reject(e)}this.paused=false;return Promise.resolve()}
 pause(){this.paused=true}
 addEventListener(){}
}
const motion={matches:false,addEventListener(){}};
const sandbox=vm.createContext({console,document:{body:element(),hidden:false,getElementById:id=>elements[id]||(elements[id]=id==='lobbyTrack'?new LobbyAudio('/music2.mp3?v=2'):element()),createElement:tag=>tag==='canvas'?{getContext:()=>ctx}:element(),addEventListener:(type,fn)=>handlers[type]=fn},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),window:{Audio:LobbyAudio,AudioContext,matchMedia:()=>motion,addEventListener(){}},performance:{now:()=>now},location:{protocol:'http:',host:'localhost'},WebSocket:class{},setTimeout(){},setInterval(fn,ms){if(ms===20)tick=fn},clearInterval(){}});
const source=fs.readFileSync(__dirname+'/index.html','utf8').split('<script>')[1].split('</script>')[0];
vm.runInContext(source,sandbox);
vm.runInContext(`homeArrows.forEach((points,p)=>{
 const [a,b,tip]=points,last=lanes[p].at(-1),mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
 if(tip[0]!==375||tip[1]!==375)throw Error('Arrow tip misses HOME');
 if(Math.abs(Math.hypot(mx-last[0],my-last[1])-unit/2)>1e-8)throw Error('Arrow does not meet lane end');
 if(Math.abs((mx-375)*(last[1]-375)-(my-375)*(last[0]-375))>1e-8)throw Error('Arrow is rotated away from lane');
 if((mx-375)*(last[0]-375)+(my-375)*(last[1]-375)<=0)throw Error('Arrow on wrong side');
})`,sandbox);
// Check the full pawn disk, including border and idle-shiver clearance, against
// every triangle edge. Each numbered piece has a stable slot as others arrive.
vm.runInContext(`homeArrows.forEach((triangle,p)=>{
 const slots=Array.from({length:4},(_,i)=>xy(p,i,71)),clearance=9.2;
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const orientation=Math.sign(cross(...triangle));
 for(const slot of slots)for(let edge=0;edge<3;edge++){
  const a=triangle[edge],b=triangle[(edge+1)%3];
  const distance=orientation*cross(a,b,slot)/Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(distance<clearance)throw Error('HOME pawn spills out of its own color triangle');
 }
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
  if(Math.hypot(slots[i][0]-slots[j][0],slots[i][1]-slots[j][1])<clearance*2)throw Error('HOME pawns overlap');
 }
})`,sandbox);
const homeCircles=[];ctx.arc=(x,y,r)=>{if(Math.abs(r-7*1.05)<1e-8)homeCircles.push([x,y])};
motion.matches=true;
for(let player=0;player<4;player++)for(let mask=1;mask<16;mask++){
 homeCircles.length=0;
 vm.runInContext(`state={game:{started:false,pieces:Array.from({length:4},(_,p)=>Array.from({length:4},(_,i)=>p===${player}&&(${mask}&(1<<i))?71:-1))}};draw()`,sandbox);
 const expected=vm.runInContext(`Array.from({length:4},(_,i)=>i).filter(i=>${mask}&(1<<i)).map(i=>xy(${player},i,71))`,sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(homeCircles)),JSON.parse(JSON.stringify(expected)),'Rendered HOME slots stay fixed for every arrival order and subset');
}
vm.runInContext('state=null',sandbox);motion.matches=false;
(async()=>{
 assert.equal(contexts.length,0,'No blocked audio context created during page load');
 assert.match(fs.readFileSync(__dirname+'/index.html','utf8'),/id="musicEnabled" type="checkbox">/);
 vm.runInContext('state={game:{started:false}};ws={readyState:1};syncLobbyMusic()',sandbox);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true,'Lobby stays silent before opting in');
 assert.equal(elements.musicEnabled.checked,false,'Lobby music is unchecked by default');
 handlers.click({target:{id:'nickname'}});assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true,'Ordinary clicks do not enable music');
 gesture=true;await handlers.pointerdown();gesture=false;
 assert.equal(contexts[0].state,'running','First gesture unlocks default-on sound');
 await vm.runInContext('beep(440)',sandbox);assert.equal(oscillators.length,1);assert.ok(oscillators[0].started);
 assert.equal(gains[0].events[1].value,.38,'Movement and dice have a stronger peak');
 assert.equal(gains[0].events[2].value,.38,'Effects sustain briefly instead of immediately fading');
 assert.equal(gains[0].events[2].time,.1*.55);
 assert.equal(vm.runInContext('lobbyMusic.volume',sandbox),.25,'Music leaves room for the game effects');
 elements.sound.onclick();assert.ok(oscillators[0].stopped);await vm.runInContext('beep(440)',sandbox);assert.equal(oscillators.length,1,'Muted sounds are suppressed');
 gesture=true;elements.sound.onclick();gesture=false;await vm.runInContext('beep(440)',sandbox);assert.equal(oscillators.length,2);
 contexts[0].state='suspended';gesture=true;await handlers.keydown();gesture=false;assert.equal(contexts[0].state,'running','Keyboard resumes interrupted audio');
 vm.runInContext(`for(let p=0;p<4;p++)for(let i=0;i<4;i++){
 let animated=false;for(let t=0;t<11000;t+=25){const w=pawnWiggle(p,i,t);if(Math.abs(w)>.01)animated=true;if(Math.abs(w)>1)throw Error('Excess motion')}
 if(!animated)throw Error('Pawn missing animation');
 }`,sandbox);
 motion.matches=true;assert.equal(vm.runInContext('pawnWiggle(0,0,400)',sandbox),0);
 motion.matches=false;vm.runInContext('state={game:{pieces:Array.from({length:4},()=>[-1,-1,-1,-1]),dice:null,winner:null}}',sandbox);tick();
 vm.runInContext(`sound=false;state={game:{winner:0},seats:[{name:'Champion <3'}]};syncVictory()`,sandbox);
 assert.equal(elements.winnerName.textContent,'Champion <3 wins!');assert.equal(elements.victory.open,true);assert.equal(elements.fireworks.children.length,126);
 vm.runInContext('syncVictory()',sandbox);assert.equal(elements.victory.shown,1,'No duplicate celebration on broadcasts');
 elements.dismissVictory.onclick();assert.equal(elements.victory.open,false);vm.runInContext('syncVictory()',sandbox);assert.equal(elements.victory.open,false,'Dismissal persists');
 vm.runInContext('state.game.winner=null;syncVictory();state.game.winner=0;syncVictory()',sandbox);assert.equal(elements.victory.shown,2,'New match celebrates same winner again');
 vm.runInContext('state.game.winner=null;syncVictory()',sandbox);assert.equal(elements.victory.open,false);
 const before=buffers.length;await vm.runInContext('sound=true;victoryFanfare()',sandbox);
 assert.equal(buffers.length-before,1,'Winner uses provided WAV buffer');assert.ok(buffers.at(-1).buffer.decoded);assert.ok(buffers.at(-1).started);
 assert.equal(buffers.at(-1).destination.events[0].value,.65,'Victory WAV passes through its quieter gain control');
 elements.sound.onclick();assert.ok(buffers.at(-1).stopped,'Mute stops winner WAV');
 vm.runInContext(`state={game:{started:true,winner:null,pieces:[[0,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]]}};
 const next={game:{started:true,winner:null,pieces:[[2,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]]},event:{kind:'move'}};queueMoves(state,next);state=next`,sandbox);
 const first=vm.runInContext('jumpPosition(0,0,400)',sandbox),mid=vm.runInContext('jumpPosition(0,0,455)',sandbox);
 const route=vm.runInContext('[xy(0,0,0),xy(0,0,1)]',sandbox);
 assert.equal(first.x,route[0][0]);assert.ok(Math.abs(mid.y-((route[0][1]+route[1][1])/2-13))<.001,'Each step lifts into a jump arc');
 assert.equal(vm.runInContext('jumpPosition(0,0,620)',sandbox),null,'Lands exactly at end');
 vm.runInContext(`queueMoves({game:{started:true,pieces:[[2]]}},{game:{started:true,pieces:[[4]]},event:{kind:'move'}});queueMoves({game:{started:true,pieces:[[4]]}},{game:{started:true,pieces:[[-1]]},event:{kind:'move'}})`,sandbox);assert.equal(vm.runInContext('jumps.size',sandbox),0,'Capture cancels pending jump');
 now=700;vm.runInContext(`queueMoves({game:{started:true,pieces:[[70,71,71,71]]}},{game:{started:true,pieces:[[71,71,71,71]]},event:{kind:'win'}})`,sandbox);
 vm.runInContext(`state={game:{winner:0},seats:[{name:'Finisher'}]};syncVictory()`,sandbox);assert.equal(elements.victory.open,false,'Winner waits for final jump');
 vm.runInContext('jumpPosition(0,0,900);syncVictory()',sandbox);assert.ok(elements.victory.open);
 vm.runInContext('jumps.clear()',sandbox);motion.matches=true;
 vm.runInContext(`queueMoves({game:{started:true,pieces:[[0]]}},{game:{started:true,pieces:[[3]]},event:{kind:'move'}})`,sandbox);assert.equal(vm.runInContext('jumps.size',sandbox),0,'Reduced motion disables jumps');
 motion.matches=false;vm.runInContext(`queueMoves({game:{started:true,pieces:[[0]]}},{game:{started:true,pieces:[[3]]},event:{kind:'move'}});queueMoves(state,{game:{started:false}})`,sandbox);assert.equal(vm.runInContext('jumps.size',sandbox),0,'Reset clears movement');
 vm.runInContext(`state={game:{started:true,turn:0,winner:null,rolled:true},options:[{piece:0,steps:2,enter:false},{piece:2,steps:5,enter:true}]};seat=0;renderMobileControls(options())`,sandbox);
 assert.equal(elements.mobileChoices.hidden,false);assert.equal(elements.mobileMove.children.length,2);assert.equal(elements.mobileMove.value,'0:2:false');
 elements.mobileMove.value='2:5:true';vm.runInContext('renderMobileControls(options())',sandbox);assert.equal(elements.mobileMove.value,'2:5:true','Keep chosen move on repeated broadcasts');
 vm.runInContext(`ws={readyState:1,send:value=>{window.lastMove=JSON.parse(value)}}`,sandbox);elements.mobileMoveBtn.onclick();assert.equal(vm.runInContext('window.lastMove.piece',sandbox),2);assert.equal(vm.runInContext('window.lastMove.enter',sandbox),true);
 vm.runInContext('state.game.turn=1;renderMobileControls(options())',sandbox);assert.equal(elements.mobileChoices.hidden,true);assert.equal(elements.mobileMoveBtn.disabled,true);
 vm.runInContext('state.game.started=false;renderMobileControls([])',sandbox);assert.equal(elements.playControls.attributes['data-playing'],'false');
 vm.runInContext(`sound=true;state={game:{started:false}};ws={readyState:1};musicBlocked=false;musicWanted=true;syncLobbyMusic()`,sandbox);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),false);const lobbyPlays=vm.runInContext('lobbyMusic.plays',sandbox);
 vm.runInContext('syncLobbyMusic();state.seats=[{name:"Joined player"}];syncLobbyMusic()',sandbox);assert.equal(vm.runInContext('lobbyMusic.plays',sandbox),lobbyPlays,'Joining does not restart music');
 vm.runInContext('state.game.started=true;syncLobbyMusic()',sandbox);assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true);assert.equal(vm.runInContext('lobbyMusic.currentTime',sandbox),0);
 vm.runInContext('state.game.started=false;syncLobbyMusic()',sandbox);await new Promise(resolve=>setImmediate(resolve));assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),false);
 vm.runInContext('sound=false;syncLobbyMusic()',sandbox);assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true);
 vm.runInContext('sound=true;document.hidden=true;syncLobbyMusic()',sandbox);assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true);
 vm.runInContext('document.hidden=false;ws.readyState=3;syncLobbyMusic()',sandbox);assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true);
 vm.runInContext(`ws.readyState=1;lobbyMusic.blocked=true;syncLobbyMusic()`,sandbox);await new Promise(resolve=>setImmediate(resolve));
 assert.doesNotMatch(elements.musicStatus.textContent,/Tap anywhere/i);assert.match(elements.musicStatus.textContent,/Toggle Lobby music/);
 vm.runInContext('lobbyMusic.blocked=false',sandbox);elements.musicEnabled.checked=false;elements.musicEnabled.onchange();elements.musicEnabled.checked=true;elements.musicEnabled.onchange();await new Promise(resolve=>setImmediate(resolve));assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),false,'Checking the checkbox starts playback');
 elements.musicEnabled.checked=false;elements.musicEnabled.onchange();assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true);
 vm.runInContext('syncLobbyMusic()',sandbox);assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),true,'Joining does not override manual pause');
 elements.musicEnabled.checked=true;elements.musicEnabled.onchange();await new Promise(resolve=>setImmediate(resolve));assert.equal(vm.runInContext('lobbyMusic.paused',sandbox),false);
 now=3000;motion.matches=false;
 vm.runInContext(`jumps.clear();syncDice(null,{game:{started:true,turn:1,rolled:false,winner:null,dice:null},event:{id:30,kind:'start'}})`,sandbox);
 const dock=vm.runInContext('dicePose(3000)',sandbox),home=vm.runInContext('diceBase(1)',sandbox);assert.equal(dock.x,home.x);assert.equal(dock.y,home.y);
 vm.runInContext(`var diceBefore={game:{started:true,turn:1,rolled:false,winner:null},event:{id:30,kind:'start'}};var diceAfter={game:{started:true,turn:1,rolled:true,winner:null,dice:[3,4]},event:{id:31,kind:'roll',player:1,dice:[3,4]}};syncDice(diceBefore,diceAfter)`,sandbox);
 const flight=vm.runInContext('dicePose(3115)',sandbox);assert.equal(flight.mode,'jump');assert.ok(Math.abs(flight.y-((home.y+375)/2-65))<.001);
 const roll=vm.runInContext('dicePose(3230)',sandbox);assert.equal(roll.mode,'roll');assert.equal(roll.x,375);assert.equal(roll.y,375);
 const landed=vm.runInContext('dicePose(3610)',sandbox);assert.equal(landed.mode,'rest');assert.equal(landed.x,375);assert.equal(landed.values[0],3);
 now=3650;vm.runInContext(`var diceNext={game:{started:true,turn:2,rolled:false,winner:null},event:{id:32,kind:'move'}};syncDice(diceAfter,diceNext);state=diceNext;seat=2`,sandbox);
 assert.equal(vm.runInContext('canRoll()',sandbox),false,'Cannot roll again while dice are travelling');
 const nextBase=vm.runInContext('dicePose(3880)',sandbox),yellow=vm.runInContext('diceBase(2)',sandbox);assert.equal(nextBase.x,yellow.x);assert.equal(nextBase.y,yellow.y);assert.equal(vm.runInContext('canRoll()',sandbox),true);
 vm.runInContext('syncDice(diceNext,diceNext)',sandbox);assert.equal(vm.runInContext('diceTimeline.length',sandbox),0,'Repeated broadcasts do not replay travel');
 now=3900;vm.runInContext(`syncDice(diceNext,{game:{started:true,turn:2,rolled:false,winner:null},event:{id:33,kind:'roll',player:2,dice:[2,2]}})`,sandbox);
 assert.equal(vm.runInContext('dicePose(4510).x',sandbox),375,'Doubles keep dice at center');
 motion.matches=true;vm.runInContext(`syncDice(diceNext,{game:{started:true,turn:3,rolled:false,winner:null},event:{id:34,kind:'penalty',player:2,dice:[2,2]}})`,sandbox);assert.equal(vm.runInContext('diceTimeline.length',sandbox),0,'Reduced motion skips travel');
 vm.runInContext('syncDice(state,{game:{started:false}})',sandbox);assert.equal(vm.runInContext('diceTimeline.length',sandbox),0);
 motion.matches=false;
 vm.runInContext(`state={game:{started:false}};ws={readyState:1};sound=true;musicWanted=true;lobbyMusic.paused=false;drawPathGlows(10000);drawPathGlows(10500)`,sandbox);
 assert.equal(musicSources.length,1,'Audio is routed once, avoiding duplicate playback');
 assert.equal(vm.runInContext('pathGlows.length',sandbox),8,'More random squares join each slow wave');
 assert.ok(vm.runInContext('musicEnvelope>0&&musicEnvelope<.625',sandbox),'Audio brightness changes smoothly');
 vm.runInContext(`for(let t=11000;t<60000;t+=20)drawPathGlows(t)`,sandbox);
 assert.ok(vm.runInContext('pathGlows.length>=20&&pathGlows.length<=48&&new Set(pathGlows.map(g=>g.cell)).size===pathGlows.length',sandbox),'More random squares glow together without duplicates or lighting the whole board');
 assert.ok(vm.runInContext('pawnGlows.length>=4&&pawnGlows.length<=12&&new Set(pawnGlows.map(g=>g.pawn)).size===pawnGlows.length',sandbox),'Random pieces pulse without duplicate highlights');
 vm.runInContext('pawnGlows.length=0;pawnGlows.push({pawn:0,start:60000,duration:3000})',sandbox);
 assert.equal(vm.runInContext('pawnGlow(0,0,60000)',sandbox),0);
 assert.ok(vm.runInContext('pawnGlow(0,0,61500)',sandbox)>.33,'Pieces brighten gradually with the music');
 assert.equal(vm.runInContext('pawnGlow(0,0,63000)',sandbox),0,'Piece pulse fades completely');
 for(const condition of ['lobbyMusic.paused=true','state.game.started=true','musicWanted=false','sound=false','document.hidden=true','ws.readyState=3','lobbyMusic.readyState=1']){
  vm.runInContext(`state.game.started=false;musicWanted=true;sound=true;document.hidden=false;ws.readyState=1;lobbyMusic.paused=false;lobbyMusic.readyState=4;drawPathGlows(61000);${condition};drawPathGlows(62000)`,sandbox);
  assert.equal(vm.runInContext('pathGlows.length',sandbox),0,`Clear highlights when ${condition}`);
  assert.equal(vm.runInContext('pawnGlows.length',sandbox),0,`Clear piece highlights when ${condition}`);
  assert.equal(vm.runInContext('pawnGlow(0,0,61500)',sandbox),0,`Pieces stay unlit when ${condition}`);
 }
 vm.runInContext('lobbyMusic.readyState=4',sandbox);motion.matches=true;
 assert.equal(vm.runInContext('lobbyGlowActive()',sandbox),false,'Reduced motion disables lobby shimmer');
 vm.runInContext(`sound=true;seat=null;ws={readyState:1};
 function resultSnapshot(winner,id){return {game:{started:true,turn:1,winner,rolled:false,dice:null,remaining:[],message:'Result test',pieces:Array.from({length:4},(_,p)=>Array.from({length:4},()=>p===winner?71:-1))},seats:[{name:'Human',bot:false},{name:'Computer 2',bot:true},null,null],options:[],can_reset:winner!==null,event:{id,kind:winner===null?'start':'win',player:1}}}
 receiveState(resultSnapshot(1,100),true)`,sandbox);
 const restoredShown=elements.victory.shown||0,restoredBuffers=buffers.length;
 assert.equal(elements.victory.open,false,'Restoring a finished game does not replay the banner');
 assert.equal(elements.reset.disabled,false,'Refreshed spectator can reset a completed game');
 vm.runInContext('receiveState(resultSnapshot(1,100));receiveState(resultSnapshot(1,100),true)',sandbox);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements.victory.shown||0,restoredShown,'Repeated snapshots and reconnect do not replay victory');
 assert.equal(buffers.length,restoredBuffers,'Restored results do not replay winner audio');
 vm.runInContext('sound=false;receiveState(resultSnapshot(null,101),true)',sandbox);
 assert.equal(elements.reset.disabled,true,'Spectators cannot reset an active human match');
 vm.runInContext('receiveState(resultSnapshot(1,102))',sandbox);
 assert.equal(elements.victory.open,true,'A live computer win still celebrates');
 assert.equal(elements.victory.shown,restoredShown+1);
 elements.dismissVictory.onclick();vm.runInContext('receiveState(resultSnapshot(1,102))',sandbox);
 assert.equal(elements.victory.open,false,'Dismissal survives later broadcasts');
 assert.equal(elements.reset.disabled,false,'Reset stays enabled after dismissing a computer win');
 vm.runInContext(`var resetSnapshot=resultSnapshot(null,103);resetSnapshot.game.started=false;resetSnapshot.event.kind='reset';receiveState(resetSnapshot);seat=0;render()`,sandbox);
 assert.equal(elements.start.disabled,false,'Reset returns a seated player to a playable lobby');
 vm.runInContext('receiveState(resultSnapshot(1,104))',sandbox);
 assert.equal(elements.victory.shown,restoredShown+2,'A computer can celebrate again in the next game');
 console.log('PASS: restored results stay silent, live computer wins celebrate once, reset remains enabled after dismissal, lobby can start another game.');
 console.log('PASS: random lobby path shimmer follows audio, routes music once, clears on pause/start/mute/hide/disconnect/buffering, respects reduced motion.');
 console.log('PASS: dice dock, jump arc, center roll and hold, next-player return, doubles, repeat broadcasts, reduced motion.');
 console.log('PASS: music off by default, ordinary clicks stay silent, checkbox starts/stops music, no tap-anywhere prompt.');
 console.log('PASS: lobby music starts after interaction, continues while joining, stops at game start, resets, mutes, pauses when hidden/disconnected.');
 console.log('PASS: mobile legal move selector, selection preserved, selected move sent, waiting-turn controls, lobby cleanup.');
 console.log('PASS: winner WAV playback/mute, winner announcement and dismissal, first-gesture audio, all 16 idle animations, jump arcs and landing, final-jump celebration timing, reduced motion, reset.');
})().catch(e=>{console.error(e);process.exitCode=1});
