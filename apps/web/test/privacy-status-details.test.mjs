import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPrivacyViewReader} from '../../../packages/domain/index.ts';
import {PrivacyStatusDetails} from '../src/ui/PrivacyStatusDetails.tsx';
import {PrivacyStatusPanel} from '../src/ui/PrivacyStatusPanel.tsx';
import {englishGroup} from '../src/ui/locale/en.ts';
const p=englishGroup('privacy');
test('details consume actual normalized reader projection without exposing URL secrets or creating links',()=>{
 const reader=createPrivacyViewReader({monotonicNow:()=>100,endpoints:{generation:2,read:()=>({version:1,generation:2,observedAt:100,expiresAt:200,endpoints:[{channel:'rpc',id:'node-a',configuredUrl:'https://RPC.example:443/SECRET?key=SECRET',connectionUrl:'https://app.example/rpc?SECRET'}]})}});
 const result=reader.buildPrivacyView(null);assert.equal(result.ok,true);
 const html=renderToStaticMarkup(createElement(PrivacyStatusDetails,{details:result.value.endpointDetails}));
 for(const text of[p.detailsTitle,p.detailsIntro,p.configuredOrigin,p.connectionOrigin,p.walletUnknown,'https://rpc.example','https://app.example'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/SECRET|href=|<button|<input|<form/);assert.equal(result.value.economicPreparationAllowed,false);
});
test('unmounted endpoint services never get inspected or subscribed, including retained positive data',()=>{
 let calls=0;const endpoints={get generation(){calls++;throw Error('SECRET');},read(){calls++;throw Error('SECRET');},subscribeInvalidation(){calls++;throw Error('SECRET');}};
 const html=renderToStaticMarkup(createElement(PrivacyStatusPanel,{endpoints}));assert.equal(calls,0);assert.ok(html.includes(p.detailsUnknown));assert.ok(html.includes(p.walletUnknown));assert.doesNotMatch(html,/SECRET|https:/);
});
test('missing and expired endpoint configuration stays explicit and grants no route coverage',()=>{
 const reader=createPrivacyViewReader({monotonicNow:()=>200,endpoints:{generation:0,read:()=>({version:1,generation:0,observedAt:100,expiresAt:200,endpoints:[{channel:'relay',id:'relay-a',configuredUrl:'wss://relay.example/',connectionUrl:null}]})}});
 const result=reader.buildPrivacyView(null);assert.equal(result.ok,true);assert.equal(result.value.endpointDetails.reason,'expired');
 const html=renderToStaticMarkup(createElement(PrivacyStatusDetails,{details:result.value.endpointDetails}));assert.ok(html.includes(p.detailsUnknown));assert.doesNotMatch(html,/relay.example|Verified private route/);
});
