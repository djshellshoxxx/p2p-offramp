/** Read the maintained literal definitions without importing or executing historical source. */
import {createScanner,tokenIsIdentifierOrKeyword} from 'typescript/unstable/ast/scanner';
import {SyntaxKind as K,TokenFlags} from 'typescript/unstable/ast';
import {CLAIM_COPY_BINDINGS} from '../../packages/claims/index.ts';

const refuse=()=>{throw Error('DOCS_STALE');};
export function claimCopyTextsFromSource(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>1048576)return refuse();
 let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return refuse();}
 const scanner=createScanner(true,undefined,source);let token,steps=0,properties=0;
 const next=()=>{if(++steps>65536)return refuse();token=scanner.scan();if(scanner.getTokenFlags()&(TokenFlags.Unterminated|TokenFlags.ContainsInvalidEscape|TokenFlags.Octal))return refuse();return token;};
 const expect=kind=>{if(token!==kind)return refuse();next();};
 function literal(depth){
  if(depth>4)return refuse();
  if(token===K.StringLiteral){const value=scanner.getTokenValue();if(value.length>8192)return refuse();next();return value;}
  if(token!==K.OpenBraceToken)return refuse();next();
  const value=Object.create(null);
  while(token!==K.CloseBraceToken){
   if(++properties>4096||!(token===K.StringLiteral||tokenIsIdentifierOrKeyword(token)))return refuse();
   const key=scanner.getTokenValue();if(!key||key.length>160||Object.hasOwn(value,key))return refuse();
   next();expect(K.ColonToken);value[key]=literal(depth+1);
   if(token!==K.CommaToken){if(token!==K.CloseBraceToken)return refuse();break;}next();
  }
  next();return value;
 }
 let previous;
 while(next()!==K.EndOfFile){
  if(previous===K.ConstKeyword&&token===K.Identifier&&scanner.getTokenValue()==='definitions')break;
  previous=token;
 }
 if(token===K.EndOfFile)return refuse();next();expect(K.EqualsToken);
 const definitions=literal(0);expect(K.AsKeyword);expect(K.ConstKeyword);expect(K.SemicolonToken);
 const texts=Object.create(null);
 for(const key of Object.keys(CLAIM_COPY_BINDINGS)){
  const [group,name]=key.split('.'),entry=definitions[group]?.[name];
  const value=typeof entry==='string'?entry:entry?.source;
  if(typeof value!=='string'||!value.length||value.length>8192)return refuse();
  texts[key]=value;
 }
 return Object.freeze(texts);
}
