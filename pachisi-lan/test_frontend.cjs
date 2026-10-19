// Run with Node.js: node test_frontend.cjs (no npm packages required).
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const handlers={},windowHandlers={},elements={},oscillators=[],contexts=[],buffers=[],musicSources=[],gains=[];let gesture=false,tick,now=400;
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
const sandbox=vm.createContext({console,document:{body:element(),hidden:false,getElementById:id=>elements[id]||(elements[id]=id==='lobbyTrack'?new LobbyAudio('/music2.mp3?v=2'):element()),createElement:tag=>tag==='canvas'?{getContext:()=>ctx}:element(),addEventListener:(type,fn)=>handlers[type]=fn},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}),window:{Audio:LobbyAudio,AudioContext,matchMedia:()=>motion,addEventListener:(type,fn)=>windowHandlers[type]=fn},performance:{now:()=>now},location:{protocol:'http:',host:'localhost',origin:'http://localhost'},WebSocket:class{},setTimeout(){},setInterval(fn,ms){if(ms===20)tick=fn},clearInterval(){}});
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
 const hallLink=fs.readFileSync(__dirname+'/index.html','utf8').match(/<a id="openHall"[^>]*>/)[0];
 assert.doesNotMatch(hallLink,/target=/,'Victory Hall defaults to the current tab');
 const existingSocket=vm.runInContext('ws',sandbox);let hallPrevented=false;
 elements.hallFrame=Object.assign(element(),{contentWindow:{}});
 elements.openHall.onclick({button:0,preventDefault(){hallPrevented=true}});
 assert.ok(hallPrevented);assert.equal(elements.hallDialog.open,true);assert.equal(elements.hallFrame.src,'/victory-hall?embedded=1');
 assert.equal(vm.runInContext('ws',sandbox),existingSocket,'Opening the hall preserves the game connection');
 windowHandlers.message({origin:'https://unrelated.example',source:elements.hallFrame.contentWindow,data:'close-victory-hall'});
 assert.equal(elements.hallDialog.open,true,'Unrelated origins cannot control the hall');
 windowHandlers.message({origin:'http://localhost',source:{},data:'close-victory-hall'});
 assert.equal(elements.hallDialog.open,true,'Unrelated frames cannot close the hall');
 windowHandlers.message({origin:'http://localhost',source:elements.hallFrame.contentWindow,data:'close-victory-hall'});
 assert.equal(elements.hallDialog.open,false,'The hall return link closes the panel without loading another game');
 elements.openHall.onclick({button:0,preventDefault(){}});elements.closeHall.onclick();assert.equal(elements.hallDialog.open,false);
 console.log('PASS: Victory Hall opens in the same tab, keeps the game connection, and returns without another game page.');
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
 const firstRoll=vm.runInContext('dicePose(3115)',sandbox);assert.equal(firstRoll.mode,'roll');assert.equal(firstRoll.x,home.x);assert.equal(firstRoll.y,home.y);
 const roll=vm.runInContext('dicePose(3230)',sandbox);assert.equal(roll.mode,'roll');assert.equal(roll.x,home.x);assert.equal(roll.y,home.y);
 const landed=vm.runInContext('dicePose(3610)',sandbox);assert.equal(landed.mode,'rest');assert.equal(landed.x,home.x);assert.equal(landed.y,home.y);assert.equal(landed.values[0],3);
 now=3650;vm.runInContext(`var diceNext={game:{started:true,turn:2,rolled:false,winner:null},event:{id:32,kind:'move'}};syncDice(diceAfter,diceNext);state=diceNext;seat=2`,sandbox);
 assert.equal(vm.runInContext('canRoll()',sandbox),false,'Cannot roll again while dice are travelling');
 const nextBase=vm.runInContext('dicePose(3880)',sandbox),yellow=vm.runInContext('diceBase(2)',sandbox);assert.equal(nextBase.x,yellow.x);assert.equal(nextBase.y,yellow.y);assert.equal(vm.runInContext('canRoll()',sandbox),true);
 vm.runInContext('syncDice(diceNext,diceNext)',sandbox);assert.equal(vm.runInContext('diceTimeline.length',sandbox),0,'Repeated broadcasts do not replay travel');
 now=3900;vm.runInContext(`syncDice(diceNext,{game:{started:true,turn:2,rolled:false,winner:null},event:{id:33,kind:'roll',player:2,dice:[2,2]}})`,sandbox);
 assert.equal(vm.runInContext('dicePose(4510).x',sandbox),yellow.x,'Doubles keep dice in the active base');
 motion.matches=true;vm.runInContext(`syncDice(diceNext,{game:{started:true,turn:3,rolled:false,winner:null},event:{id:34,kind:'penalty',player:2,dice:[2,2]}})`,sandbox);assert.equal(vm.runInContext('diceTimeline.length',sandbox),0,'Reduced motion skips travel');
 vm.runInContext('syncDice(state,{game:{started:false}})',sandbox);assert.equal(vm.runInContext('diceTimeline.length',sandbox),0);
 motion.matches=false;
 for(let p=0;p<4;p++){
  now=5000+p*1000;
  vm.runInContext(`var baseStart={game:{started:true,turn:${p},winner:null,rolled:false,dice:null},event:{id:200,kind:'start'}};var baseRoll={game:{started:true,turn:${p},winner:null,rolled:true,dice:[3,4]},event:{id:201,kind:'roll',player:${p},dice:[3,4]}};syncDice(null,baseStart);syncDice(baseStart,baseRoll)`,sandbox);
  const base=vm.runInContext(`diceBase(${p})`,sandbox);
  for(let elapsed=0;elapsed<=500;elapsed+=20){const pose=vm.runInContext(`dicePose(${now+elapsed})`,sandbox);assert.equal(pose.x,base.x);assert.equal(pose.y,base.y)}
  vm.runInContext('syncDice(null,baseRoll)',sandbox);assert.equal(vm.runInContext('diceRest.x',sandbox),base.x,'A refreshed roll stays in its own base');
 }
 motion.matches=false;
 vm.runInContext(`state={game:{started:false}};ws={readyState:1};sound=true;musicWanted=true;lobbyMusic.paused=false;drawPathGlows(10000);drawPathGlows(10500)`,sandbox);
 assert.equal(musicSources.length,1,'Audio is routed once, avoiding duplicate playback');
 assert.equal(vm.runInContext('pathGlows.length',sandbox),8,'More random squares join each slow wave');
 assert.ok(vm.runInContext('musicEnvelope>0&&musicEnvelope<.625',sandbox),'Audio brightness changes smoothly');
 const floatingStart=vm.runInContext('floatingDicePose(0,11000)',sandbox);
 let floated=false;const lobbyFaces=new Set();
 for(let time=11000;time<70000;time+=100){
  for(let die=0;die<2;die++){
   const pose=vm.runInContext(`floatingDicePose(${die},${time})`,sandbox);
   assert.ok(pose.x>=30&&pose.x<=720&&pose.y>=30&&pose.y<=720,'Lobby dice stay fully inside the board');
   const faces=vm.runInContext(`diceCubeGeometry(${pose.tumble},${pose.angle})`,sandbox);
   for(const face of faces)lobbyFaces.add(face.value);
   if(Math.hypot(pose.x-floatingStart.x,pose.y-floatingStart.y)>30)floated=true;
  }
 }
 assert.ok(floated,'Lobby dice wander to random positions while music plays');
 assert.equal(lobbyFaces.size,6,'Tumbling shows all six faces');
 let threeFacesVisible=false;
 for(let angle=0;angle<40;angle+=.37){
  const faces=vm.runInContext(`diceCubeGeometry(${angle},${angle*.43})`,sandbox);
  assert.ok(faces.length>=1&&faces.length<=3,'Only camera-facing cube surfaces are rendered');
  if(faces.length===3)threeFacesVisible=true;
  for(const face of faces){
   assert.equal(face.pips.length,face.value,'Each physical cube face has the correct pip count');
   assert.ok(face.brightness>=.58&&face.brightness<=.98,'Cube lighting stays shaded and visible');
   assert.ok(!faces.some(other=>other.value!==face.value&&other.value+face.value===7),'Opposite faces cannot face the camera together');
   for(const point of [...face.corners,...face.pips.flat()])assert.ok(Number.isFinite(point[0])&&Number.isFinite(point[1])&&Math.hypot(...point)<30,'Projected geometry fits within the collision radius');
   const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const sign=Math.sign(cross(...face.corners.slice(0,3)));
   for(const pip of face.pips)for(const point of pip)for(let edge=0;edge<4;edge++)assert.ok(sign*cross(face.corners[edge],face.corners[(edge+1)%4],point)>=-1e-6,'Perspective pips stay on their own cube face');
  }
 }
 assert.ok(threeFacesVisible,'The floating dice display three-dimensional depth');
 console.log('PASS: perspective cube projection, three visible shaded faces, correct pips, opposite-face layout, collision bounds.');
 vm.runInContext(`state.game.pieces=Array.from({length:4},()=>[-1,-1,-1,-1]);
 var lobbyPiecesBefore=JSON.stringify(state.game.pieces);
 var hitPawn=xy(0,0,-1);
 Object.assign(lobbyDiceBodies[0],{x:hitPawn[0]-46,y:hitPawn[1],vx:70,vy:0,spin:.6,cruiseSpin:.6,nextSteer:Infinity});
 Object.assign(lobbyDiceBodies[1],{x:650,y:375,vx:0,vy:0,nextSteer:Infinity});lobbyDiceTime=89984;updateLobbyDice(90000)`,sandbox);
 assert.ok(vm.runInContext('lobbyDiceBodies[0].vx<0&&lobbyDiceBodies[0].spin>3',sandbox),'Hitting a piece bounces the die and boosts spin');
 assert.ok(vm.runInContext('Math.hypot(lobbyDiceBodies[0].x-hitPawn[0],lobbyDiceBodies[0].y-hitPawn[1])>=47',sandbox),'Dice separate from pieces');
 vm.runInContext(`Object.assign(lobbyDiceBodies[0],{x:300,y:375,vx:70,vy:0,spin:.6});Object.assign(lobbyDiceBodies[1],{x:358,y:375,vx:-70,vy:0,spin:.6});lobbyDiceTime=90984;updateLobbyDice(91000)`,sandbox);
 assert.ok(vm.runInContext('lobbyDiceBodies[0].vx<0&&lobbyDiceBodies[1].vx>0&&lobbyDiceBodies.every(b=>b.spin>3)',sandbox),'Dice collide with one another and both spin faster');
 vm.runInContext(`Object.assign(lobbyDiceBodies[0],{x:47.9,y:375,vx:-70,vy:0,spin:.6});Object.assign(lobbyDiceBodies[1],{x:650,y:375,vx:0,vy:0});lobbyDiceTime=91984;updateLobbyDice(92000)`,sandbox);
 assert.ok(vm.runInContext('lobbyDiceBodies[0].x>=48&&lobbyDiceBodies[0].vx>0',sandbox),'Dice bounce off the board edge');
 vm.runInContext(`Object.assign(lobbyDiceBodies[0],{x:300,y:375,vx:0,vy:0,speed:0,spin:9,cruiseSpin:.6});Object.assign(lobbyDiceBodies[1],{x:650,y:375,vx:0,vy:0,speed:0});lobbyDiceTime=93000;for(let t=93000;t<98000;t+=50)updateLobbyDice(t)`,sandbox);
 assert.ok(vm.runInContext('lobbyDiceBodies[0].spin>.6&&lobbyDiceBodies[0].spin<1.5',sandbox),'Collision spin slows smoothly back to its cruising rate');
 assert.equal(vm.runInContext('JSON.stringify(state.game.pieces)',sandbox),vm.runInContext('lobbyPiecesBefore',sandbox),'Lobby collisions do not move actual game pieces');
 vm.runInContext('lobbyTints[0]={from:0,to:120,start:0,end:10000}',sandbox);
 assert.equal(vm.runInContext('lobbyTint(0,5000,52)',sandbox),'hsl(60,64%,52%)','Base and path colors fade gradually');
 for(let tint=0;tint<72;tint++)assert.match(vm.runInContext(`lobbyTint(${tint},5500,52)`,sandbox),/^hsl\([\d.]+,64%,52%\)$/,'All lobby colors retain a bright lightness floor');
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
  assert.equal(vm.runInContext('floatingDicePose(0,62000)',sandbox),null,`Floating stops when ${condition}`);
  assert.equal(vm.runInContext('lobbyDiceBodies.length',sandbox),0);
  assert.equal(vm.runInContext('lobbyTint(0,62000,52)',sandbox),null,`Normal board colors return when ${condition}`);
 }
 vm.runInContext('lobbyMusic.readyState=4',sandbox);motion.matches=true;
 assert.equal(vm.runInContext('lobbyGlowActive()',sandbox),false,'Reduced motion disables lobby shimmer');
 assert.equal(vm.runInContext('floatingDicePose(0,63000)',sandbox),null,'Reduced motion disables floating dice');
 assert.equal(vm.runInContext('lobbyTint(0,63000,52)',sandbox),null,'Reduced motion disables color cycling');
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
 console.log('PASS: piece/dice/wall collisions, spin boost and damping, all six tumbling faces, colorful fades, unchanged game pieces and restored game colors.');
 console.log('PASS: rolls stay inside all four player bases, turn handoff, doubles, restored rolls, bounded random lobby floating, stop/mute/reduced motion.');
 console.log('PASS: music off by default, ordinary clicks stay silent, checkbox starts/stops music, no tap-anywhere prompt.');
 console.log('PASS: lobby music starts after interaction, continues while joining, stops at game start, resets, mutes, pauses when hidden/disconnected.');
 console.log('PASS: mobile legal move selector, selection preserved, selected move sent, waiting-turn controls, lobby cleanup.');
 console.log('PASS: winner WAV playback/mute, winner announcement and dismissal, first-gesture audio, all 16 idle animations, jump arcs and landing, final-jump celebration timing, reduced motion, reset.');
})().catch(e=>{console.error(e);process.exitCode=1});
