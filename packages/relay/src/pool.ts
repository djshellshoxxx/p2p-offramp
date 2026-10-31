/** Injected local relay boundary. No global network driver, endpoint discovery or privacy assertion. */
import { parseStrictJsonBytes } from '../../schemas/index.ts';
import { AdvertisementBook, MAX_EVENT_BYTES, validateAdvertisement, type OrderAdvertisement, type RelayResult } from './advertisement.ts';

export const MAX_RELAYS = 4, MAX_SUBSCRIPTIONS_PER_RELAY = 4, MAX_OUTBOUND_QUEUED_EVENTS = 32;
const utf8 = new TextEncoder();
export interface RelaySocket { send(frame: string): void; close(): void | Promise<void>; }
export interface RelayHandlers { message(bytes: Uint8Array): void; closed(): void; }
export interface RelayConnector {
  /** The caller provides approved relay IDs. Implementations must honor transport policy and never fall back. */
  connect(relayId: string, handlers: RelayHandlers, signal: AbortSignal): Promise<RelaySocket>;
}
export interface RelayPoolOptions {
  readonly relayIds: readonly string[]; readonly connector: RelayConnector;
  readonly nowSeconds: () => bigint | null; readonly nowMs?: () => number; readonly random?: () => number;
  readonly ackTimeoutMs?: number;
}
export interface OrderFilter {readonly since: number; readonly limit: number;}
export interface RelayPublishOutcome {readonly relayId: string; readonly eventId: string; readonly status: 'accepted' | 'rejected' | 'unknown';}
interface Subscription {readonly id:string; readonly filter:OrderFilter; readonly listener:(orders:readonly OrderAdvertisement[])=>void;}
interface PendingAck {readonly finish:(status:RelayPublishOutcome['status'])=>void;}
interface Connection {
  readonly id:string; controller:AbortController; socket:RelaySocket|undefined;
  pending:Promise<void>|undefined; stopped:boolean; unsafe:boolean; draining:boolean; attempts:number; stableAt:number|null;
  drain:Promise<void>|undefined;
  retry:ReturnType<typeof setTimeout>|undefined; tokens:number; tokenAt:number; overloadWindow:number; overloads:number;
  connectTimer:ReturnType<typeof setTimeout>|undefined;
  readonly acks:Map<string,PendingAck>;
}
const failure = (code:'INVALID_INPUT'|'LIMIT_EXCEEDED'|'CANCELLED'|'UNAVAILABLE'):RelayResult<never> => ({ok:false,code});

export class RelayPool {
  readonly #options:RelayPoolOptions;
  readonly #connections=new Map<string,Connection>();
  readonly #subscriptions=new Map<string,Subscription>();
  readonly #book=new AdvertisementBook();
  readonly #publications=new Set<object>();
  #sequence=0; #disposed=false; #lastTime=-Infinity;
  #disposal:Promise<void>|undefined;
  constructor(options:RelayPoolOptions) {
    if (!Array.isArray(options.relayIds) || options.relayIds.length>MAX_RELAYS || new Set(options.relayIds).size!==options.relayIds.length ||
      options.relayIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) ||
      (options.ackTimeoutMs!==undefined&&(!Number.isSafeInteger(options.ackTimeoutMs)||options.ackTimeoutMs<1||options.ackTimeoutMs>30000))) throw new Error('Invalid local relay configuration.');
    this.#options=options;
    for(const id of options.relayIds) this.#connections.set(id,{id,controller:new AbortController(),socket:undefined,pending:undefined,stopped:false,unsafe:false,draining:false,drain:undefined,attempts:0,stableAt:null,retry:undefined,connectTimer:undefined,tokens:20,tokenAt:0,overloadWindow:-1,overloads:0,acks:new Map()});
  }
  #time():number {
    const time=(this.#options.nowMs??(()=>performance.now()))();
    if(!Number.isFinite(time)||time<0||time<this.#lastTime) throw new Error('Clock unavailable.');
    this.#lastTime=time;return time;
  }
  #wanted():boolean {return !this.#disposed&&this.#subscriptions.size>0;}
  #req(subscription:Subscription):string {return JSON.stringify(['REQ',subscription.id,{kinds:[30078],since:subscription.filter.since,limit:subscription.filter.limit}]);}
  #send(connection:Connection,frame:string):boolean {
    if(!connection.socket||connection.draining||connection.stopped||this.#disposed)return false;
    try{connection.socket.send(frame);return true;}catch{void this.#stop(connection,true);return false;}
  }
  #open(connection:Connection):void {
    if(!this.#wanted()||connection.pending||connection.draining||connection.socket||connection.stopped||connection.unsafe)return;
    connection.controller=new AbortController();
    connection.stableAt=null;
    const controller=connection.controller;
    connection.connectTimer=setTimeout(()=>{if(connection.controller===controller)void this.#stop(connection,true);},30000);
    const work=(async()=>{
      let socket:RelaySocket;
      try{
        socket=await this.#options.connector.connect(connection.id,{message:bytes=>{
          if(controller!==connection.controller||controller.signal.aborted||!connection.socket)return;
          this.#receive(connection,bytes);
        },closed:()=>{if(controller===connection.controller)void this.#stop(connection,true);}},controller.signal);
      }catch{
        connection.pending=undefined;
        if(!controller.signal.aborted)this.#retry(connection);
        return;
      }
      if(controller.signal.aborted||!this.#wanted()||connection.draining){
        // A connector ignoring abort remains physically owned until its eventual socket drains.
        try{await socket.close();}catch{connection.unsafe=true;connection.stopped=true;}
        return;
      }
      connection.socket=socket;connection.stableAt=this.#time();connection.tokenAt=connection.stableAt;connection.tokens=20;
      for(const subscription of this.#subscriptions.values())this.#send(connection,this.#req(subscription));
    })();
    connection.pending=work;
    void work.finally(()=>{
      if(connection.controller===controller&&connection.connectTimer!==undefined)clearTimeout(connection.connectTimer);
      if(connection.pending===work)connection.pending=undefined;
    }).catch(()=>{connection.stopped=true;void this.#stop(connection,false);});
  }
  #retry(connection:Connection):void {
    if(!this.#wanted()||connection.stopped||connection.unsafe||connection.retry!==undefined||connection.attempts>=6)return;
    let sample:number;
    try{sample=(this.#options.random??Math.random)();if(!Number.isFinite(sample)||sample<0||sample>=1)throw new Error();}catch{connection.stopped=true;return;}
    const delay=Math.floor(Math.min(30000,1000*2**connection.attempts)*sample);connection.attempts++;
    connection.retry=setTimeout(()=>{connection.retry=undefined;this.#open(connection);},delay);
  }
  #stop(connection:Connection,reconnect:boolean):Promise<void> {
    if(connection.draining)return connection.drain??Promise.resolve();
    connection.draining=true;connection.controller.abort();
    if(connection.connectTimer!==undefined)clearTimeout(connection.connectTimer);connection.connectTimer=undefined;
    if(connection.retry!==undefined)clearTimeout(connection.retry);connection.retry=undefined;
    for(const ack of [...connection.acks.values()])ack.finish('unknown');
    const pending=connection.pending,socket=connection.socket,establishedAt=connection.stableAt;
    connection.socket=undefined;connection.stableAt=null;
    // Only actual, continuously established socket uptime can replenish the reconnect budget.
    // Waiting for a connection (including a timed-out one) is not a stable connection.
    if(reconnect&&socket&&establishedAt!==null){try{if(this.#time()-establishedAt>=60000)connection.attempts=0;}catch{connection.stopped=true;}}
    const draining=(async()=>{
      try{if(socket)await socket.close();if(pending)await pending;}catch{connection.stopped=true;connection.unsafe=true;}
      finally{connection.draining=false;connection.drain=undefined;if(reconnect)this.#retry(connection);else if(this.#wanted())this.#open(connection);}
    })();
    connection.drain=draining;return draining;
  }
  #admit(connection:Connection):boolean {
    const now=this.#time();
    connection.tokens=Math.min(20,connection.tokens+(now-connection.tokenAt)*.002);connection.tokenAt=now;
    if(connection.tokens>=1){connection.tokens--;return true;}
    const window=Math.floor(now/10000);
    if(window!==connection.overloadWindow){connection.overloads=window===connection.overloadWindow+1?connection.overloads+1:1;connection.overloadWindow=window;}
    if(connection.overloads>=3)void this.#stop(connection,true);
    return false;
  }
  #receive(connection:Connection,bytes:Uint8Array):void {
    if(this.#disposed||connection.draining||connection.stopped)return;
    try{
      if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_EVENT_BYTES){void this.#stop(connection,true);return;}
      if(!this.#admit(connection))return;
      const frame=parseStrictJsonBytes(bytes,MAX_EVENT_BYTES);
      if(!Array.isArray(frame))return;
      if(frame[0]==='OK'&&frame.length===4&&typeof frame[1]==='string'&&typeof frame[2]==='boolean'&&typeof frame[3]==='string'){
        connection.acks.get(frame[1])?.finish(frame[2]?'accepted':'rejected');return;
      }
      if(frame[0]!=='EVENT'||frame.length!==3||typeof frame[1]!=='string'||!this.#subscriptions.has(frame[1]))return;
      const result=this.#book.ingest(utf8.encode(JSON.stringify(frame[2])),this.#options.nowSeconds());
      if(!result.ok||result.value==='duplicate'||result.value==='stale')return;
      const snapshot=this.#book.snapshot(this.#options.nowSeconds());
      for(const subscription of [...this.#subscriptions.values()]){
        if(this.#disposed||!this.#subscriptions.has(subscription.id))break;
        try{subscription.listener(Object.freeze(snapshot.filter(item=>item.value.event.created_at>=subscription.filter.since).slice(-subscription.filter.limit)));}catch{/* observers cannot disrupt other subscriptions */}
      }
    }catch{/* fixed rejection; never forward frame contents or parser exceptions */}
  }
  subscribe(filter:OrderFilter,listener:(orders:readonly OrderAdvertisement[])=>void):RelayResult<()=>void> {
    if(this.#disposed)return failure('CANCELLED');
    if(this.#subscriptions.size>=MAX_SUBSCRIPTIONS_PER_RELAY)return failure('LIMIT_EXCEEDED');
    let now:bigint|null;try{now=this.#options.nowSeconds();}catch{return failure('UNAVAILABLE');}
    let copy:OrderFilter;
    try{
      if(typeof filter!=='object'||filter===null||Object.getPrototypeOf(filter)!==Object.prototype||Reflect.ownKeys(filter).sort().join(',')!=='limit,since')throw new Error();
      const since=Object.getOwnPropertyDescriptor(filter,'since'),limit=Object.getOwnPropertyDescriptor(filter,'limit');
      if(!since||!('value'in since)||!limit||!('value'in limit))throw new Error();
      copy={since:since.value as number,limit:limit.value as number};
      if(now===null||!Number.isSafeInteger(copy.since)||copy.since<0||BigInt(copy.since)>now||now-BigInt(copy.since)>86400n||
        !Number.isSafeInteger(copy.limit)||copy.limit<1||copy.limit>100||typeof listener!=='function')throw new Error();
    }catch{return failure('INVALID_INPUT');}
    const id=`orders-${++this.#sequence}`,subscription={id,filter:Object.freeze(copy),listener};
    this.#subscriptions.set(id,subscription);
    for(const connection of this.#connections.values()){if(connection.socket)this.#send(connection,this.#req(subscription));else this.#open(connection);}
    let active=true;
    return {ok:true,value:()=>{
      if(!active)return;active=false;this.#subscriptions.delete(id);
      for(const connection of this.#connections.values())this.#send(connection,JSON.stringify(['CLOSE',id]));
      if(this.#subscriptions.size===0){this.#book.clear();for(const connection of this.#connections.values())void this.#stop(connection,false);}
    }};
  }
  async publish(bytes:Uint8Array,signal?:AbortSignal):Promise<RelayResult<readonly RelayPublishOutcome[]>> {
    if(this.#disposed||signal?.aborted)return failure('CANCELLED');
    if(this.#publications.size>=MAX_OUTBOUND_QUEUED_EVENTS)return failure('LIMIT_EXCEEDED');
    let now:bigint|null;try{now=this.#options.nowSeconds();}catch{return failure('UNAVAILABLE');}
    const checked=validateAdvertisement(bytes,now);if(!checked.ok)return checked;
    const event=checked.value.event,job={};this.#publications.add(job);
    try{
      const outcomes=await Promise.all([...this.#connections.values()].map(connection=>new Promise<RelayPublishOutcome>(resolve=>{
        const result=(status:RelayPublishOutcome['status'])=>Object.freeze({relayId:connection.id,eventId:event.id,status});
        if(!connection.socket||connection.draining||connection.acks.has(event.id)){resolve(result('unknown'));return;}
        let finished=false;const abort=()=>finish('unknown');
        const timer=setTimeout(()=>finish('unknown'),this.#options.ackTimeoutMs??10000);
        const finish=(status:RelayPublishOutcome['status'])=>{
          if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);connection.acks.delete(event.id);resolve(result(status));
        };
        connection.acks.set(event.id,{finish});signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted){finish('unknown');return;}
        if(!this.#send(connection,JSON.stringify(['EVENT',event])))finish('unknown');
      })));
      return {ok:true,value:Object.freeze(outcomes)};
    }finally{this.#publications.delete(job);}
  }
  snapshot():readonly OrderAdvertisement[] {try{return this.#book.snapshot(this.#options.nowSeconds());}catch{return Object.freeze([]);}}
  /** Explicit retry only after automatic attempts exhaust; never picks a new relay. */
  retry():void {if(this.#disposed)return;for(const connection of this.#connections.values()){if(connection.unsafe)continue;connection.attempts=0;connection.stopped=false;this.#open(connection);}}
  dispose():Promise<void> {
    if(this.#disposal)return this.#disposal;
    this.#disposed=true;this.#subscriptions.clear();this.#book.clear();
    this.#disposal=Promise.all([...this.#connections.values()].map(connection=>this.#stop(connection,false))).then(()=>undefined);
    return this.#disposal;
  }
  get retainedOrders():number {return this.#book.retainedOrders;}
  get dedupIds():number {return this.#book.dedupIds;}
  /** Failed native close remains uncertain, rather than claiming resource cleanup. */
  get unsettledSlots():number {return [...this.#connections.values()].filter(connection=>connection.pending!==undefined||connection.draining||connection.socket!==undefined||connection.unsafe).length;}
}
