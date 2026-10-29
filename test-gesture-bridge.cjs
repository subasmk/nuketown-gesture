const vm=require('vm'),fs=require('fs'),assert=require('assert');let now=1000,shots=0,releases=0,look;const callbacks={};
const ctx={performance:{now:()=>now},document:{hasFocus:()=>true,hidden:false},G:{started:true,paused:false,over:false,player:{alive:true}},IN:{firing:false},mouseSens:.0021,KEY:{},addEventListener:(k,f)=>callbacks[k]=f,pressFire:()=>{shots++;ctx.IN.firing=true},releaseFire:()=>{releases++;ctx.IN.firing=false},applyLook:(...x)=>look=x,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('gesture-bridge.js','utf8')+'\nglobalThis.testGesture=GESTURE;',ctx);const g=ctx.testGesture;g.enabled=true;g.last=now;g.fwd=1;g.ax=1;g.ay=1;g.fire=true;ctx.gestureTick(.016);assert.equal(shots,1);assert(look[0]>0&&look[1]>0) /* ay>0 = hand below neutral = look down, same sign as mouse movementY */;ctx.gestureTick(.016);assert.equal(shots,1);console.log('PASS native aim sign/cap and fire press only once');g.fire=false;ctx.gestureTick(.016);assert.equal(ctx.IN.firing,false);console.log('PASS open pinch releases');g.fire=true;now+=500;ctx.gestureTick(.016);assert.equal(g.fwd,0);assert.equal(ctx.IN.firing,false);console.log('PASS stale stops');now+=10;g.last=now;ctx.G.paused=true;g.fire=true;ctx.gestureTick(.016);assert.equal(ctx.IN.firing,false);console.log('PASS pause stops');console.log('PASS bridge returns neutral while paused');
/* A live phone owns aim+fire: gesture aim and pinch must not fight it. */
ctx.G.paused=false;g.last=now;g.ax=1;g.ay=1;g.fire=true;ctx.PHONE_LIVE=()=>true;
const before=shots;look=null;ctx.gestureTick(.016);
assert.equal(shots,before);assert.equal(look,null);
console.log('PASS live phone overrides gesture aim and pinch');

/* A paired browser controller (CTL_LIVE) also owns aim+fire over gestures. */
ctx.PHONE_LIVE=()=>false;ctx.CTL_LIVE=()=>true;
const before2=shots;look=null;ctx.gestureTick(.016);
assert.equal(shots,before2);assert.equal(look,null);
ctx.CTL_LIVE=undefined;ctx.PHONE_LIVE=()=>false;
console.log('PASS live browser controller overrides gesture aim and pinch');
