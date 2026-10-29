/* User-authored gesture layer. Does not send OS input or alter network rules. */
const GESTURE = {enabled:false,fwd:0,strafe:0,ax:0,ay:0,fire:false,mouse:false,last:0};
function gestureStop(){GESTURE.fwd=GESTURE.strafe=GESTURE.ax=GESTURE.ay=0;GESTURE.fire=false;if(!GESTURE.mouse)releaseFire();}
function gestureAccepts(){return GESTURE.enabled && document.hasFocus()&&!document.hidden&&G.started&&!G.paused&&!G.over&&G.player&&G.player.alive;}
function gestureTick(dt){
  const panel=document.getElementById?.('gesture-panel');if(panel){panel.style.top=G.started?'85px':'auto';panel.style.bottom=G.started?'auto':'8px';}
  if(!gestureAccepts()||performance.now()-GESTURE.last>400){gestureStop();return;}
  applyLook(GESTURE.ax*700*Math.min(dt,.05),GESTURE.ay*550*Math.min(dt,.05),mouseSens);
  if(GESTURE.fire&&!IN.firing)pressFire();
  if(!GESTURE.fire&&!GESTURE.mouse&&IN.firing)releaseFire();
}
addEventListener('DOMContentLoaded',()=>{
 const box=document.createElement('section');box.id='gesture-panel';box.style.cssText='position:fixed;left:8px;bottom:8px;z-index:100000;width:230px;padding:8px;background:#182431ed;color:white;font:12px system-ui;border-radius:10px';
 box.innerHTML='<b>GESTURE CONTROL</b><br><details><summary>Camera preview (expand)</summary><video id="gesture-video" autoplay muted playsinline style="width:100%;max-height:130px;transform:scaleX(-1)"></video></details><div id="gesture-note" role="status">Camera off. Click ENABLE CAMERA.</div><button id="gesture-start">ENABLE CAMERA</button> <button id="gesture-neutral">SET NEUTRAL</button><br>C recenter | F8 pause gestures<br>One hand: fingertip aims, pinch = fire<br>Second hand: palm moves (raise = forward)<br>R reload | Space jump | 1/2/3 weapons';document.body.append(box);
 const note=document.getElementById('gesture-note');
 document.getElementById('gesture-start').onclick=()=>{
  GESTURE.enabled=true;
  if(!window.GestureControl){note.textContent='Gesture script missing';return;}
  GestureControl.start(document.getElementById('gesture-video'),{
   onAim:(x,y)=>{GESTURE.last=performance.now();GESTURE.ax=x;GESTURE.ay=y;},
   onMove:(x,z)=>{GESTURE.strafe=x;GESTURE.fwd=z;},
   onFire:v=>{GESTURE.fire=!!v&&gestureAccepts();},
   /* Status text is display only. It must never gate input: ordinary
      status lines legitimately contain words like "STOP" (not moving),
      and stopping on them cut aim/fire mid-gesture. The controller
      stops input by emitting zeros, and the watchdog below covers a
      dead controller. */
   onStatus:t=>{note.textContent=t;}
  });
 };
 document.getElementById('gesture-neutral').onclick=()=>{gestureStop();GestureControl.capture();};
 addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='KeyC'){gestureStop();GestureControl.calibrate();}if(e.code==='F8'){GESTURE.enabled=!GESTURE.enabled;gestureStop();note.textContent=GESTURE.enabled?'Gestures resumed':'Gestures PAUSED, F8 resumes';}});
 addEventListener('blur',()=>{GESTURE.mouse=false;gestureStop();for(const k in KEY)KEY[k]=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){GESTURE.mouse=false;gestureStop();for(const k in KEY)KEY[k]=false;}});
 setInterval(()=>{if(performance.now()-GESTURE.last>400)gestureStop();},100);
});
