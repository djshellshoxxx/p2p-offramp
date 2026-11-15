/** Public origin-local rollback metadata only; never shares the encrypted vault database. */
export interface AcceptedRelease {readonly v:1;readonly channel:string;readonly keyId:string;readonly sequence:number;readonly manifestSha256:string;}
export interface AcceptedReleaseStore {
  read(signal:AbortSignal):Promise<AcceptedRelease|null>;
  advance(expected:AcceptedRelease|null,next:AcceptedRelease,signal:AbortSignal,assertCurrent:()=>void):Promise<'written'|'same'|'conflict'>;
  close():void;
}
export function acceptedRelease(input:unknown,channel:string,keyId:string):AcceptedRelease|null{
  if(input===null)return null;
  if(typeof input!=='object'||input===null||Object.getPrototypeOf(input)!==Object.prototype)throw Error('STORAGE_UNAVAILABLE');
  const fields=['v','channel','keyId','sequence','manifestSha256'];const keys=Reflect.ownKeys(input);if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))throw Error('STORAGE_UNAVAILABLE');
  const data:Record<string,unknown>=Object.create(null);for(const field of fields){const d=Object.getOwnPropertyDescriptor(input,field);if(!d||!d.enumerable||!('value'in d))throw Error('STORAGE_UNAVAILABLE');data[field]=d.value;}
  if(data.v!==1||data.channel!==channel||data.keyId!==keyId||typeof data.sequence!=='number'||!Number.isSafeInteger(data.sequence)||data.sequence<1||typeof data.manifestSha256!=='string'||!/^[0-9a-f]{64}$/.test(data.manifestSha256))throw Error('STORAGE_UNAVAILABLE');
  return Object.freeze({v:1,channel,keyId,sequence:data.sequence,manifestSha256:data.manifestSha256});
}
const same=(a:AcceptedRelease|null,b:AcceptedRelease|null)=>a===null?b===null:b!==null&&a.sequence===b.sequence&&a.manifestSha256===b.manifestSha256&&a.keyId===b.keyId&&a.channel===b.channel;
export class IndexedDbAcceptedReleaseStore implements AcceptedReleaseStore {
  #database:Promise<IDBDatabase>|undefined;#closed=false;#transactions=new Set<IDBTransaction>();
  readonly channel:string;readonly keyId:string;readonly factory:IDBFactory|undefined;
  constructor(channel:string,keyId:string,factory:IDBFactory|undefined=globalThis.indexedDB){this.channel=channel;this.keyId=keyId;this.factory=factory;}
  #open():Promise<IDBDatabase>{
    if(this.#closed||!this.factory||globalThis.isSecureContext!==true)return Promise.reject(Error('STORAGE_UNAVAILABLE'));
    if(this.#database)return this.#database;
    this.#database=new Promise((resolve,reject)=>{const request=this.factory!.open('p2p-offramp-accepted-releases',1);let failed=false;
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('accepted'))request.result.createObjectStore('accepted');};
      request.onerror=()=>{failed=true;reject(Error('STORAGE_UNAVAILABLE'));};request.onblocked=()=>{failed=true;reject(Error('STORAGE_UNAVAILABLE'));};
      request.onsuccess=()=>{const db=request.result;if(this.#closed||failed){db.close();reject(Error('STORAGE_UNAVAILABLE'));return;}db.onversionchange=()=>this.close();resolve(db);};});return this.#database;
  }
  async #run<T>(mode:IDBTransactionMode,signal:AbortSignal,work:(store:IDBObjectStore,finish:(value:T)=>void)=>void):Promise<T>{
    if(signal.aborted||this.#closed)throw Error('CANCELLED');const db=await this.#open();if(signal.aborted||this.#closed)throw Error('CANCELLED');
    return new Promise<T>((resolve,reject)=>{const tx=db.transaction('accepted',mode,{durability:'strict'});this.#transactions.add(tx);let output:T,done=false;
      const abort=()=>{try{tx.abort();}catch{}};signal.addEventListener('abort',abort,{once:true});
      const end=()=>{this.#transactions.delete(tx);signal.removeEventListener('abort',abort);};
      tx.oncomplete=()=>{end();if(!done)reject(Error('STORAGE_UNAVAILABLE'));else resolve(output);};
      tx.onerror=tx.onabort=()=>{end();reject(Error(signal.aborted?'CANCELLED':'STORAGE_UNAVAILABLE'));};
      try{if(signal.aborted)abort();else work(tx.objectStore('accepted'),value=>{output=value;done=true;});}catch{abort();}
    });
  }
  read(signal:AbortSignal):Promise<AcceptedRelease|null>{return this.#run('readonly',signal,(store,finish)=>{const get=store.get(this.channel+'\n'+this.keyId);get.onsuccess=()=>{try{finish(acceptedRelease(get.result===undefined?null:get.result,this.channel,this.keyId));}catch{get.transaction?.abort();}};});}
  advance(expected:AcceptedRelease|null,next:AcceptedRelease,signal:AbortSignal,current:()=>void):Promise<'written'|'same'|'conflict'>{
    const before=acceptedRelease(expected,this.channel,this.keyId),after=acceptedRelease(next,this.channel,this.keyId);if(!after)return Promise.reject(Error('STORAGE_UNAVAILABLE'));
    return this.#run('readwrite',signal,(store,finish)=>{const key=this.channel+'\n'+this.keyId,get=store.get(key);get.onsuccess=()=>{try{current();if(signal.aborted)throw Error();const actual=acceptedRelease(get.result===undefined?null:get.result,this.channel,this.keyId);
      if(same(actual,after)){finish('same');return;}if(!same(actual,before)||actual&&after.sequence<=actual.sequence){finish('conflict');return;}
      current();store.put(after,key);finish('written');}catch{get.transaction?.abort();}};});
  }
  close():void{if(this.#closed)return;this.#closed=true;for(const tx of this.#transactions)try{tx.abort();}catch{}void this.#database?.then(db=>db.close(),()=>{});}
}
