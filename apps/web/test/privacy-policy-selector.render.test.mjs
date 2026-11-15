import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const api=await import('../src/ui/PrivacyPolicySelector.tsx').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const copy={policyTitle:'Transport policy for brokered app connections',policyIntro:'Choose a policy for the app connections listed below.',policyOrdinary:'Ordinary',policyStrict:'Strict',policyApply:'Apply policy',policyRelaxConsent:'I choose Ordinary and understand that explicitly permitted direct connections may be used.',policySelected:'Selected policy',policyUnavailable:'No transport policy is available from this connection owner.',policyLoading:'Reading the current transport policy…',policyBusy:'Applying the selected transport policy…',policyChanged:'The connection owner or policy changed. Read the current policy before trying again.',policyUnknownCoverage:'Selecting Strict does not prove private routing. RPC and external wallet routing remain unknown unless separately observed.',policyChannels:'Connections controlled by this policy',policyNoChannels:'No brokered connections are configured.',policyBytesSent:'A policy change cannot retract bytes already sent. Existing connections may still be closing.',policyRetry:'Read current policy',channelLabels:{rpc:'RPC',relay:'Relays',map:'Maps',proof:'Proof services',update:'Updates'}};
function render(props={}){assert.equal(typeof api.PrivacyPolicySelector,'function','missing selector');return renderToStaticMarkup(createElement(api.PrivacyPolicySelector,{services:null,messages:copy,...props}));}
test('an unavailable owner renders named disabled controls and no invented selected policy',()=>{
 const html=render();assert.match(html,/<select[^>]+disabled/);assert.match(html,/<button[^>]+disabled/);assert.ok(html.includes(copy.policyUnavailable));assert.ok(html.includes(copy.policyUnknownCoverage));assert.ok(html.includes(copy.policyBytesSent));assert.doesNotMatch(html,/checked=""|verified-private|data-coverage/);
});
test('server rendering never inspects a supplied owner or turns its callbacks into coverage',()=>{
 let calls=0;const source={selectionScope(){calls++;throw Error('SECRET');},subscribe(){calls++;throw Error('SECRET');},getTransportSelection(){calls++;throw Error('SECRET');},selectTransportMode(){calls++;throw Error('SECRET');}};
 const html=render({services:source,scope:1});assert.equal(calls,0);assert.ok(html.includes(copy.policyUnavailable));assert.doesNotMatch(html,/SECRET|checked=""/);
});
test('selector copy is rendered as text and labels retain distinct control associations',()=>{
 const html=render({messages:{...copy,policyIntro:'<script>PRIVATE_SENTINEL</script>'}});assert.ok(html.includes('&lt;script&gt;PRIVATE_SENTINEL&lt;/script&gt;'));assert.doesNotMatch(html,/<script>/);const match=html.match(/<label for="([^"]+)"/);assert.ok(match);assert.ok(html.includes(`id="${match[1]}"`));
});
