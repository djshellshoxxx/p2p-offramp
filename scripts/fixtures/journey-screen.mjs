import {mountLocalJourney} from '../../apps/web/src/journey/screen.ts';
mountLocalJourney(document.body,new Worker('/journey-worker.js',{type:'module'}));
