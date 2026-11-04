/** Reuses the actual T43/T34 product backup controls; no wallet/signing/transaction composition is imported. */
import {mountLocalJourney} from '../../apps/web/src/journey/screen.ts';
const worker=new Worker('/journey-worker.js',{type:'module'});
mountLocalJourney(document.body,worker,{vaultOnly:true});
document.title='LOCALPROOF · signed two-origin backup migration';
document.querySelector('h1').textContent='LOCALPROOF · signed origin transition and current backup verification';
document.querySelector('h1 + p').textContent='Synthetic compiled public trust key only. Both origins independently verify the same complete signed asset set. This proves local origin separation and fresh-key backup recovery; it does not enable trading, choose maintained keys or certify a production update/rotation/archive policy.';
for(const action of['connect','offer','accept','fund','reconcile','release','refund','watch','list']){const button=document.querySelector(`[data-action="${action}"]`);if(button)button.remove();}
