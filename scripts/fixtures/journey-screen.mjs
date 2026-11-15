import {mountLocalJourney} from '../../apps/web/src/journey/screen.ts';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivacyPolicySelector} from '../../apps/web/src/ui/PrivacyPolicySelector.tsx';
import {englishGroup} from '../../apps/web/src/ui/locale/en.ts';
const p=englishGroup('privacy');
mountLocalJourney(document.body,new Worker('/journey-worker.js',{type:'module'}),{mountTransportPolicy(port){
 const host=document.createElement('div');host.dataset.role='native-policy-selector';document.body.append(host);
 const root=createRoot(host);root.render(createElement(PrivacyPolicySelector,{services:port,messages:{...p,channelLabels:{rpc:p.rpc,relay:p.relay,map:p.map,proof:p.proofChannel,update:p.update}}}));
 return()=>root.unmount();
}});
