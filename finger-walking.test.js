const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function hand(n, angle=0, scale=1, tilt=0) {
  const p=Array.from({length:21},()=>({x:.4,y:.6,z:0}));
  p[0]={x:.4,y:.75,z:0};
  [5,9,13,17].forEach((j,i)=>p[j]={x:.34+i*.04,y:.6,z:0});
  [6,10,14,18].forEach((j,i)=>p[j]={x:.34+i*.04,y:.555,z:0});
  [8,12,16,20].forEach((j,i)=>p[j]={x:.34+i*.04,y:i<n?.51:.585,z:0});
  return p.map(a=>{let x=(a.x-.4)*scale,y=(a.y-.75)*scale;return {x:.5+x*Math.cos(angle)-y*Math.sin(angle)*Math.cos(tilt),y:.5+x*Math.sin(angle)+y*Math.cos(angle)*Math.cos(tilt),z:y*Math.sin(tilt)};});
}
function harness(bridge=false) {
  let now=1000, result, aim, move, fire;const events={}, timers=[],elements={};
  class Hands {setOptions(){} onResults(f){result=f;} async send(){}}
  const document={hidden:false,hasFocus:()=>true,body:{append(){}},createElement:()=>({style:{}}),getElementById:id=>elements[id]??=( {style:{},textContent:''} ),addEventListener:(k,f)=>(events[k]??=[]).push(f)};
  const c={document,window:{isSecureContext:true},navigator:{mediaDevices:{getUserMedia(){}}},Hands,Camera:class{start(){return Promise.resolve();}},performance:{now:()=>now},setInterval:f=>timers.push(f),addEventListener:(k,f)=>(events[k]??=[]).push(f),G:{started:true,paused:false,over:false,player:{alive:true}},IN:{firing:false},KEY:{},mouseSens:.0021,console};
  c.pressFire=()=>c.IN.firing=true;c.releaseFire=()=>c.IN.firing=false;c.applyLook=()=>{};
  vm.createContext(c);vm.runInContext(fs.readFileSync('gesture-controller.js','utf8')+'\nglobalThis.GestureControl=window.GestureControl;',c);
  if(bridge){vm.runInContext(fs.readFileSync('gesture-bridge.js','utf8')+'\nglobalThis.g=GESTURE;',c);events.DOMContentLoaded.forEach(f=>f());elements['gesture-start'].onclick();}
  else c.GestureControl.start({}, {onAim:(...v)=>aim=v,onMove:(...v)=>move=v,onFire:v=>fire=v,onStatus:()=>{}});
  return {c,elements,events,timers,frame(n,ms=30,angle=0,scale=1,tilt=0){now+=ms;result({multiHandLandmarks:n===null?[]:[hand(n,angle,scale,tilt)],multiHandedness:[{label:'Right'}]});},get aim(){return aim},get move(){return move},get fire(){return fire},advance(ms){now+=ms;},get now(){return now}};
}
test('finger directions are rotation/scale/depth invariant; aim and pinch stay parked',()=>{
 const h=harness();h.c.GestureControl.setMoveOnly(true);
 for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const scale of [.5,1.5])for(const tilt of [0,1.2])for(const [n,axis,sign] of [[1,1,1],[2,1,-1],[3,0,1],[4,0,-1]]){
  h.c.GestureControl.setMoveOnly(false);h.c.GestureControl.setMoveOnly(true);
  for(let i=0;i<8;i++)h.frame(n,30,a,scale,tilt);
  assert(h.move[axis]*sign>.9,`count ${n} angle ${a} scale ${scale} tilt ${tilt}`);assert.deepEqual(h.aim,[0,0]);assert.equal(h.fire,false);
 }
});
test('directions need 80ms of stable count; intermediate shapes never engage',()=>{
 const h=harness();h.c.GestureControl.setMoveOnly(true);h.frame(1);h.frame(1,79);assert.deepEqual(h.move,[0,0]);h.frame(1,1);assert(h.move[1]>0);
 h.frame(3,10);h.frame(3,70);assert.equal(h.move[0],0);h.frame(2,1);h.frame(2,79);assert.equal(h.move[0],0);h.frame(2,1);for(let i=0;i<6;i++)h.frame(2);assert(h.move[1]<-.9);
});
test('fist/hand loss stop immediately, reacquisition needs fresh stable count, hidden/stalled tracking stops',async()=>{
 const h=harness();await Promise.resolve();h.c.GestureControl.setMoveOnly(true);for(let i=0;i<8;i++)h.frame(1);h.frame(0,1);assert.deepEqual(h.move,[0,0]);
 for(let i=0;i<8;i++)h.frame(3);h.frame(null,1);assert.deepEqual(h.move,[0,0]);h.frame(3,1);assert.deepEqual(h.move,[0,0]);
 for(let i=0;i<8;i++)h.frame(4);h.c.document.hidden=true;h.frame(4);assert.deepEqual(h.move,[0,0]);h.c.document.hidden=false;
 for(let i=0;i<8;i++)h.frame(1);h.advance(1000);h.timers.forEach(f=>f());assert.deepEqual(h.move,[0,0]);
 h.c.GestureControl.calibrate();assert.deepEqual(h.move,[0,0]);
});
for(const source of ['native','browser','both'])test(`${source} phone auto-enables finger walking; camera stop never releases phone fire`,()=>{
 const h=harness(true);let native=source!=='browser',browser=source!=='native';h.c.PHONE_LIVE=()=>native;h.c.CTL_LIVE=()=>browser;
 h.timers.forEach(f=>f());assert.equal(h.c.GestureControl.isMoveOnly(),true);assert.equal(h.elements['gesture-moveonly'].textContent,'MOVE ONLY: ON');
 for(let i=0;i<8;i++)h.frame(1);assert(h.c.g.fwd>.9);h.c.IN.firing=true;h.c.gestureTick(.016);assert.equal(h.c.IN.firing,true);
 h.frame(null,1);assert.equal(h.c.g.fwd,0);h.c.gestureStop();assert.equal(h.c.IN.firing,true);
 native=browser=false;h.timers.forEach(f=>f());assert.equal(h.c.GestureControl.isMoveOnly(),false);
 h.elements['gesture-moveonly'].onclick();assert.equal(h.c.GestureControl.isMoveOnly(),true);h.timers.forEach(f=>f());assert.equal(h.c.GestureControl.isMoveOnly(),true);
 h.elements['gesture-moveonly'].onclick();assert.equal(h.c.GestureControl.isMoveOnly(),false);
});
test('manual move-only OFF cannot override a live phone aim/fire priority',()=>{
 const h=harness(true);h.c.PHONE_LIVE=()=>true;h.timers.forEach(f=>f());h.elements['gesture-moveonly'].onclick();assert.equal(h.c.GestureControl.isMoveOnly(),false);
 h.c.g.fire=true;h.c.g.ax=1;h.c.g.last=h.now;h.c.gestureTick(.016);assert.equal(h.c.IN.firing,false);
});
test('actual PHONE_LIVE and CTL_LIVE implementations both select MOVE ONLY',()=>{
 const h=harness(true);
 vm.runInContext(fs.readFileSync('phone-gyro.js','utf8')+'\n'+fs.readFileSync('phone-bridge.js','utf8')+'\nglobalThis.p=PHONE;globalThis.ctl=CTLP;',h.c);
 h.c.p.enabled=true;h.c.p.ws={readyState:1};h.c.p.last=h.now;h.c.p.liveUntil=h.now+1500;
 h.timers.forEach(f=>f());assert.equal(h.c.GestureControl.isMoveOnly(),true);
 h.c.p.enabled=false;h.c.ctl.on=true;h.c.ctl.connected=true;h.c.ctl.lastMsg=h.now;
 h.timers.forEach(f=>f());assert.equal(h.c.GestureControl.isMoveOnly(),true);for(let i=0;i<8;i++)h.frame(4);assert(h.c.g.strafe<-.9);
 h.advance(1100);h.timers.forEach(f=>f());assert.equal(h.c.GestureControl.isMoveOnly(),false);
});
