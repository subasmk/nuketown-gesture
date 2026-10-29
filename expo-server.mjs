import {createRelayServer} from './server.mjs';
import selfsigned from 'selfsigned';
import os from 'node:os';
const cert=selfsigned.generate([{name:'commonName',value:'nuketown-local-expo'}],{days:7,keySize:2048});
const relay=createRelayServer({tls:{key:cert.private,cert:cert.cert}}); // no accounts/store payment backend
const port=Number(process.env.PORT||8080);
relay.listen(port,'0.0.0.0',()=>{console.log('HOST: https://localhost:'+port);for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)console.log('LAN: https://'+a.address+':'+port);});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await relay.close();process.exit(0);});
