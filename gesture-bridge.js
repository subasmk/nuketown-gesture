/* User-authored gesture layer. Does not send OS input or alter network rules. */
const GESTURE = {enabled:false,fwd:0,strafe:0,ax:0,ay:0,fire:false,mouse:false,last:0,ownsFire:false};
function gesturePhoneLive(){return (typeof PHONE_LIVE==='function'&&PHONE_LIVE())||(typeof CTL_LIVE==='function'&&CTL_LIVE());}
function gestureMoveOnly(){return typeof GestureControl!=='undefined'&&GestureControl.isMoveOnly?.();}
/* Fire is released only when this layer pressed it. Touch FIRE and the
   mouse hold IN.firing for reasons the gesture layer never set; the old
   unconditional release here ran every frame (gestureTick) and every
   100ms (the watchdog), stripping touch fire the frame it was pressed
   and making FIRE on a phone do nothing at all. Phone fire is not
   gesture-owned either, so it is never touched. */
function gestureStop(){GESTURE.fwd=GESTURE.strafe=GESTURE.ax=GESTURE.ay=0;GESTURE.fire=false;if(GESTURE.ownsFire){GESTURE.ownsFire=false;if(!GESTURE.mouse)releaseFire();}}
function gestureAccepts(){return GESTURE.enabled && document.hasFocus()&&!document.hidden&&G.started&&!G.paused&&!G.over&&G.player&&G.player.alive;}
function gestureTick(dt){
  const panel=document.getElementById?.('gesture-panel');if(panel){const ctl=document.getElementById?.('ctl-panel');const top=Math.max(85,(ctl?.getBoundingClientRect?.().bottom||0)+8);panel.style.top=G.started?top+'px':'auto';panel.style.bottom=G.started?'auto':'8px';}
  if(!gestureAccepts()||performance.now()-GESTURE.last>400){gestureStop();return;}
  /* A live phone (native app or paired browser controller) owns aim + fire;
     the webcam hand then drives walking only, so gesture look and pinch
     must not fight the phone. */
  const phoneAim=gesturePhoneLive();
  if(!phoneAim&&!gestureMoveOnly()){
    applyLook(GESTURE.ax*600*Math.min(dt,.05),GESTURE.ay*460*Math.min(dt,.05),mouseSens);
    /* Same ownership as gestureStop: pinch presses, un-pinch releases, and
       nothing else's hold on IN.firing is ever cleared here. */
    if(GESTURE.fire){if(!GESTURE.ownsFire){GESTURE.ownsFire=true;pressFire();}}
    else if(GESTURE.ownsFire){GESTURE.ownsFire=false;if(!GESTURE.mouse)releaseFire();}
  }
}
addEventListener('DOMContentLoaded',()=>{
 const box=document.createElement('section');box.id='gesture-panel';box.style.cssText='position:fixed;left:8px;bottom:8px;z-index:100000;width:230px;padding:8px;background:#182431ed;color:white;font:12px system-ui;border-radius:10px';
 box.innerHTML='<b>GESTURE CONTROL</b><br><details><summary>Camera preview (expand)</summary><video id="gesture-video" autoplay muted playsinline style="width:100%;max-height:130px;transform:scaleX(-1)"></video></details><div id="gesture-note" role="status">Camera off. Click ENABLE CAMERA.</div><button id="gesture-start">ENABLE CAMERA</button> <button id="gesture-neutral">SET NEUTRAL</button> <button id="gesture-moveonly">MOVE ONLY: OFF</button><br>C recenter | F8 pause gestures<br>One hand: fingertip aims, light pinch = FIRE (hold to keep firing)<br>Second hand: palm moves (raise = forward)<br>MOVE ONLY: 1=front 2=back 3=right 4=left; fist/no hand=stop<br>R reload | Space jump | 1/2/3 weapons';document.body.append(box);
 const note=document.getElementById('gesture-note');
 /* One camera flow behind both switches: the floating panel's ENABLE CAMERA
    and the settings row on the pause card. Permission behavior is unchanged -
    the camera is asked for on this click and nowhere else. */
 const startCam=()=>{
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
 document.getElementById('gesture-start').onclick=startCam;
 /* The settings row (#menuCamStart) runs the identical flow and mirrors the
    panel's status line, so the pause card always says what the camera is
    doing without owning any of the logic. */
 const menuBtn=document.getElementById('menuCamStart'),menuNote=document.getElementById('menuCamNote');
 if(menuBtn)menuBtn.onclick=startCam;
 if(menuNote){
  const mirror=()=>{menuNote.textContent='WEBCAM: '+note.textContent;};
  if(typeof MutationObserver==='function'){
    new MutationObserver(mirror).observe(note,{childList:true,characterData:true,subtree:true});
    mirror();
  }
 }
 document.getElementById('gesture-neutral').onclick=()=>{gestureStop();GestureControl.capture();};
 /* Move-only mode: while a phone is connected it aims and fires, so the
    webcam hand switches to finger-count movement. Automatic on phone
    connect/disconnect; the button is a manual override that then owns
    the mode until the page reloads. */
 const moveOnlyBtn=document.getElementById('gesture-moveonly');
 let moveOnlyManual=false, moveOnlyAuto=null;
 const applyMoveOnly=v=>{gestureStop();if(window.GestureControl&&GestureControl.setMoveOnly){GestureControl.setMoveOnly(v);moveOnlyBtn.textContent='MOVE ONLY: '+(v?'ON':'OFF');}};
 moveOnlyBtn.onclick=()=>{moveOnlyManual=true;const next=!(window.GestureControl&&GestureControl.isMoveOnly&&GestureControl.isMoveOnly());applyMoveOnly(next);};
 setInterval(()=>{if(moveOnlyManual)return;const want=!!gesturePhoneLive();if(want!==moveOnlyAuto){moveOnlyAuto=want;applyMoveOnly(want);}},100);
 addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.code==='KeyC'){gestureStop();GestureControl.calibrate();}if(e.code==='F8'){GESTURE.enabled=!GESTURE.enabled;gestureStop();note.textContent=GESTURE.enabled?'Gestures resumed':'Gestures PAUSED, F8 resumes';}});
 addEventListener('blur',()=>{GESTURE.mouse=false;gestureStop();for(const k in KEY)KEY[k]=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){GESTURE.mouse=false;gestureStop();for(const k in KEY)KEY[k]=false;}});
 setInterval(()=>{if(performance.now()-GESTURE.last>400)gestureStop();},100);
});
