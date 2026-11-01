import test from 'node:test';
import assert from 'node:assert/strict';
import { createTooltipRegistry, TooltipRegistry } from '../src/ui/help-registry.ts';
const entry = () => ({ controlId:'unlock-profile',messageKey:'help.profile',severity:'warning',helpLink:'#unlock-profile-help',interactionTests:['hover','focus','tap','escape','blur'] });
test('fixed help registry detaches its metadata and exposes no mutation capability', () => {
  const item=entry(), registry=createTooltipRegistry([item]); item.messageKey='shell.appName'; item.interactionTests[0]='changed';
  assert.equal(registry.get('unlock-profile').messageKey,'help.profile');assert.equal(registry.get('unlock-profile').interactionTests[0],'hover');
  assert.ok(Object.isFrozen(registry));assert.ok(Object.isFrozen(registry.get('unlock-profile')));assert.equal(registry.set,undefined);
  assert.equal(TooltipRegistry.size,9);
});
test('duplicates, unknown/dynamic copy, unsafe links and incomplete interaction evidence are refused', () => {
  for(const input of [[entry(),entry()], [{...entry(),helpLink:'https://evil.invalid/'}], [{...entry(),helpLink:'#other'}],
    [{...entry(),messageKey:'unknown.key'}],[{...entry(),messageKey:'help.show'}],[{...entry(),interactionTests:['hover']}], [{...entry(),extra:'PRIVATE'}]]) {
    assert.throws(()=>createTooltipRegistry(input),{message:'Invalid local help registry.'});
  }
  let touched=0;const item=entry();Object.defineProperty(item,'messageKey',{enumerable:true,get(){touched++;return 'PRIVATE';}});
  assert.throws(()=>createTooltipRegistry([item]));assert.equal(touched,0);
});
