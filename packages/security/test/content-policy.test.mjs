import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/content-policy.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const fn=name=>{assert.equal(typeof api[name],'function',`missing ${name}`);return api[name];};
const invalid=(work,code='INVALID_INPUT')=>assert.throws(work,error=>error.code===code&&error.message==='Content boundary input unavailable.'&&error.messageKey===`content.error.${code.toLowerCase()}`);
test('plain text keeps hostile markup inert and preserves international text without normalization',()=>{
 const parse=fn('validatePlainText');for(const value of ['<script>alert(1)</script>','<svg onload="alert(1)">','<img src=x onerror=alert(1)>','[tracking](javascript:alert(1))','![pixel](https://tracker.invalid/a)','العربية 日本語 café e\u0301 👩‍💻','line one\nline two\r\n\ttab']){assert.equal(parse(value,'order'),value);assert.equal(parse(value,'chat'),value);}
 assert.equal(parse('','order'),'');invalid(()=>parse('hello','receipt'));invalid(()=>parse({toString(){throw Error('SECRET');}},'order'));
});
test('order and chat UTF8 caps are inclusive and checked before unbounded encoding allocations',()=>{
 const parse=fn('validatePlainText');assert.equal(api.MAX_ORDER_TEXT_BYTES,4096);assert.equal(api.MAX_CHAT_TEXT_BYTES,16384);
 for(const[kind,max]of[['order',4096],['chat',16384]]){assert.equal(parse('x'.repeat(max),kind).length,max);invalid(()=>parse('x'.repeat(max+1),kind),'LIMIT_EXCEEDED');assert.equal(parse('é'.repeat(max/2),kind).length,max/2);invalid(()=>parse('é'.repeat(max/2+1),kind),'LIMIT_EXCEEDED');assert.equal(parse('😀'.repeat(max/4),kind).length,max/2);}
 const original=globalThis.TextEncoder;let constructed=0;globalThis.TextEncoder=class{constructor(){constructed++;throw Error('SECRET encoder');}};
 try{invalid(()=>parse('x'.repeat(16385),'chat'),'LIMIT_EXCEEDED');assert.equal(constructed,0);}finally{globalThis.TextEncoder=original;}
});
test('UTF8 accounting agrees with an independent native encoder at mixed-script boundary cases',()=>{
 const parse=fn('validatePlainText');for(const[kind,max]of[['order',4096],['chat',16384]])for(const unit of ['x','é','漢','😀','e\u0301','👩‍💻','\u200c'])for(const offset of [-1,0,1]){
  const unitBytes=new TextEncoder().encode(unit).length,sample=unit.repeat(Math.max(0,Math.floor(max/unitBytes)+offset));const count=new TextEncoder().encode(sample).length;
  if(count<=max)assert.equal(parse(sample,kind),sample);else invalid(()=>parse(sample,kind),'LIMIT_EXCEEDED');
 }
});
test('malformed Unicode, disallowed controls and bidi formatting cannot enter text or link labels',()=>{
 const parse=fn('validatePlainText');for(const character of ['\ud800','\udfff','a\ud800b','\u0000','\u0001','\u000b','\u007f','\u0085','\u061c','\u200e','\u200f','\u202e','\u2066','\ufeff','\u200b'])invalid(()=>parse(character,'order'));
 for(let code=0;code<=0x9f;code++){if(code>=0x20&&code<0x7f||[9,10,13].includes(code))continue;invalid(()=>parse(String.fromCharCode(code),'chat'));}
});
test('UTF8 byte decoding is strict, bounded before decoding, and ignores hostile shadow properties',()=>{
 const decode=fn('decodePlainText');const good=new TextEncoder().encode('日本語\nالعربية');assert.equal(decode(good,'order'),'日本語\nالعربية');
 for(const bytes of [new Uint8Array([0xff]),new Uint8Array([0xc0,0xaf]),new Uint8Array([0xed,0xa0,0x80]),new Uint8Array([0xf0,0x9f]),new Uint8Array([0xef,0xbb,0xbf,0x61])])invalid(()=>decode(bytes,'chat'));
 let touched=0;Object.defineProperty(good,'byteLength',{get(){touched++;throw Error('SECRET');}});assert.equal(decode(good,'order'),'日本語\nالعربية');assert.equal(touched,0);
 invalid(()=>decode({get byteLength(){touched++;throw Error('SECRET');}},'order'));assert.equal(touched,0);
 const revoked=Proxy.revocable(new Uint8Array(1),{});revoked.revoke();invalid(()=>decode(revoked.proxy,'order'));
 const original=globalThis.TextDecoder;let constructed=0;globalThis.TextDecoder=class{constructor(){constructed++;throw Error('SECRET decoder');}};
 try{invalid(()=>decode(new Uint8Array(4097),'order'),'LIMIT_EXCEEDED');assert.equal(constructed,0);}finally{globalThis.TextDecoder=original;}
});
test('external link parser returns only explicit HTTPS link data with fixed opener/referrer protection',()=>{
 const parse=fn('parseSafeExternalLink');assert.deepEqual(parse({href:'https://example.org/docs',label:'Public documentation'}),{href:'https://example.org/docs',label:'Public documentation',rel:'noopener noreferrer',referrerPolicy:'no-referrer'});
 const parsed=parse({href:'https://EXAMPLE.org/docs',label:'日本語 documentation'});assert.equal(parsed.href,'https://example.org/docs');assert.equal(Object.isFrozen(parsed),true);
 assert.equal(parse({href:'https://example.org/a%20b',label:'<script>inert text</script>'}).label,'<script>inert text</script>');
});
test('unsafe links, credential/query/fragment capabilities and ambiguous URL forms fail with fixed diagnostics',()=>{
 const parse=fn('parseSafeExternalLink');for(const href of ['javascript:alert(1)','data:text/html,SECRET','file:///SECRET','intent://SECRET','http://example.org/','//example.org/','/relative','https:example.org','https://user:SECRET@example.org/','https://@example.org/','https://example.org/?secret=SECRET','https://example.org/?','https://example.org/#SECRET','https://example.org/#','https://example.org/\\SECRET',' https://example.org/','https://example.org/a\nb','https://example.org/%00','https://example.org/%0d%0a','https://example.org/%E2%80%AE','https://example.org/%zz'])invalid(()=>parse({href,label:'Link'}));
 for(const value of [{href:'https://example.org/',label:'line\nbreak'},{href:'https://example.org/',label:'\u202eSECRET'},{href:'https://example.org/',label:'x'.repeat(257)},{href:'https://example.org/',label:'ok',target:'_blank'}])invalid(()=>parse(value),value.label.length>256?'LIMIT_EXCEEDED':'INVALID_INPUT');
 invalid(()=>parse({href:'https://example.org/'+'x'.repeat(2048),label:'Link'}),'LIMIT_EXCEEDED');
});
test('external link labels cannot be blank and canonical URL expansion must fit the same byte cap',()=>{
 const parse=fn('parseSafeExternalLink');for(const label of ['',' ','\u00a0'])invalid(()=>parse({href:'https://example.org/',label}));
 invalid(()=>parse({href:'https://example.org/'+'é'.repeat(600),label:'Public link'}),'LIMIT_EXCEEDED');
});
test('offline policy construction is deterministic, sorted and cannot authorize external origins',()=>{
 const build=fn('buildOfflineContentPolicy');const input={version:1,releaseId:'local-test-v1',delivery:'header'};const output=build(input);assert.deepEqual(build(input),output);
 assert.deepEqual(output.manifest,{version:1,releaseId:'local-test-v1',connectOrigins:[],delivery:'header',framingProtected:false});
 const directives=output.csp.split('; ');assert.deepEqual(directives,[...directives].sort());
 const expected={'base-uri':"'none'",'connect-src':"'none'",'default-src':"'none'",'font-src':"'self'",'form-action':"'none'",'frame-ancestors':"'none'",'frame-src':"'none'",'img-src':"'self'",'manifest-src':"'self'",'object-src':"'none'",'script-src':"'self'",'style-src':"'self'",'worker-src':"'self'"};assert.equal(output.csp,Object.entries(expected).map(([key,value])=>`${key} ${value}`).join('; '));
 assert.deepEqual(output.headers,{'Content-Security-Policy':output.csp,'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});assert.deepEqual(output.meta,[]);
 assert.doesNotMatch(output.csp,/unsafe-|blob:|data:|\*|https?:|report-uri|report-to/);assert.equal(Object.isFrozen(output.manifest.connectOrigins),true);
 for(const changed of [{...input,connectOrigins:['https://SECRET.invalid']},{...input,framingProtected:true},{...input,delivery:'report-only'},{...input,version:2},{...input,releaseId:'x'.repeat(65)}])invalid(()=>build(changed));
});
test('meta profile omits unsupported framing directive and exposes only safe attribute records before resources',()=>{
 const build=fn('buildOfflineContentPolicy'),meta=build({version:1,releaseId:'local-test-v1',delivery:'meta'}),header=build({version:1,releaseId:'local-test-v1',delivery:'header'});
 assert.equal(meta.manifest.framingProtected,false);assert.equal(header.manifest.framingProtected,false);assert.deepEqual(meta.headers,{});assert.doesNotMatch(meta.csp,/frame-ancestors|sandbox|report-uri/);
 assert.deepEqual(meta.meta,[{httpEquiv:'Content-Security-Policy',content:meta.csp},{name:'referrer',content:'no-referrer'}]);assert.ok(meta.notices.includes('content.policy.meta-before-resources-required'));assert.ok(meta.notices.includes('content.policy.framing-unverified'));assert.ok(header.notices.includes('content.policy.framing-unverified'));
 assert.equal('html'in meta,false);assert.equal('render'in api,false);assert.equal('navigate'in api,false);
});
test('content object boundaries reject accessors, symbols, inherited fields and revoked proxies without raw diagnostics',()=>{
 const build=fn('buildOfflineContentPolicy'),parse=fn('parseSafeExternalLink');let touched=0;
 invalid(()=>parse({get href(){touched++;throw Error('SECRET');},label:'Link'}));assert.equal(touched,0);
 invalid(()=>build(Object.defineProperty({version:1,releaseId:'local-test-v1'},'delivery',{get(){touched++;throw Error('SECRET');}})));assert.equal(touched,0);
 invalid(()=>parse({...{href:'https://example.org/',label:'Link'},[Symbol('SECRET')]:1}));
 invalid(()=>parse(Object.assign(Object.create({inherited:true}),{href:'https://example.org/',label:'Link'})));
 const revoked=Proxy.revocable({},{});revoked.revoke();invalid(()=>build(revoked.proxy));
});
