import {createRelayServer} from './server.mjs';
import selfsigned from 'selfsigned';
import os from 'node:os';
const cert=selfsigned.generate([{name:'commonName',value:'nuketown-local-expo'}],{days:7,keySize:2048});
const relay=createRelayServer({tls:{key:cert.private,cert:cert.cert}}); // no accounts/store payment backend
const port=Number(process.env.PORT||8080);
relay.listen(port,'0.0.0.0',()=>{
  console.log('HOST (this laptop): https://localhost:'+port);
  const addrs=[];
  for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)addrs.push(a.address);
  /* The friend's laptop needs exactly one link and it is almost never
     the VPN/virtual adapter. Rank: the Windows mobile-hotspot address
     first, then ordinary private LAN ranges, then everything else. */
  const rank=a=>a==='192.168.137.1'?0:/^192\.168\./.test(a)?1:/^10\./.test(a)?2:/^172\.(1[6-9]|2\d|3[01])\./.test(a)?3:4;
  addrs.sort((x,y)=>rank(x)-rank(y));
  if(addrs.length){
    console.log('FRIEND OPENS (same hotspot/Wi-Fi): https://'+addrs[0]+':'+port);
    for(const a of addrs.slice(1))console.log('  (other adapter, usually ignore: https://'+a+':'+port+')');
    console.log('PHONE AIM (native Android app): connect to '+addrs[0]+':'+port+' - or open https://'+addrs[0]+':'+port+'/gyro-controller on the phone browser');
    console.log('PHONE CONTROLLER (browser, no install): open https://'+addrs[0]+':'+port+'/controller on the phone and enter the 4-letter code shown on the laptop panel.');
    console.log('Friend browser shows a certificate warning: Advanced -> Proceed. Expected — it is your own laptop.');
    console.log('If the page does not load at all: Windows Firewall -> allow Node.js on PRIVATE networks, and use https:// (not http://).');
  } else {
    console.log('No LAN address found — connect this laptop to the hotspot/Wi-Fi first.');
  }
});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await relay.close();process.exit(0);});
