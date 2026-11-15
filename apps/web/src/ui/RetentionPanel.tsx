/** DATA01 explicit selected-profile review. Only opaque Worker previews and fixed counts reach this component. */
import {useEffect,useRef,useState} from 'react';
import type {AppServices} from '../app-services.ts';
import type {RuntimeRetentionPreview} from '../../../../packages/schemas/index.ts';
import {messages as m} from './messages.ts';
import {errorMessage} from './routes.ts';
export function RetentionPanel({services}:{readonly services:AppServices|null}){
 const generation=useRef(0),request=useRef<AbortController|null>(null),mounted=useRef(false),selection=useRef(0);
 const [unlocked,setUnlocked]=useState(false),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
 const [preview,setPreview]=useState<{owner:AppServices;scope:number;value:RuntimeRetentionPreview}|null>(null);
 const [notice,setNotice]=useState<{error:boolean;text:string}|null>(null);
 useEffect(()=>{
  mounted.current=true;generation.current++;selection.current=services?.selectionScope()??0;
  setUnlocked(services?.current.state==='unlocked');setBusy(false);setConsent(false);setPreview(null);setNotice(null);
  const update=()=>{const next=services?.selectionScope()??0;setUnlocked(services?.current.state==='unlocked');if(next===selection.current)return;selection.current=next;generation.current++;request.current?.abort();request.current=null;setBusy(false);setPreview(null);setConsent(false);setNotice(null);};
  const stop=services?.subscribe(update);update();
  return()=>{mounted.current=false;generation.current++;request.current?.abort();request.current=null;stop?.();};
 },[services]);
 const visible=services&&preview?.owner===services&&preview.scope===services.selectionScope()?preview.value:null;
 async function run(kind:'plan'|'review'|'delete'){
  if(!services||!unlocked||request.current)return;
  const current=visible;if(kind==='delete'&&(!current||!consent||current.reviewedDeleteCount<1||current.reviewedDeleteCount>256))return;
  const controller=new AbortController(),mine=++generation.current,scope=services.selectionScope();request.current=controller;setBusy(true);setNotice(null);setPreview(null);setConsent(false);
  const owns=()=>mounted.current&&mine===generation.current&&services.selectionScope()===scope&&services.current.state==='unlocked'&&!controller.signal.aborted;
  try{
   if(kind==='delete'&&current){
    const result=await services.deleteReviewedRecords({previewId:current.previewId,expectedRevision:current.revision,consentRevision:current.revision,reviewed:true,logicalOnly:true,backupAndRemoteLimitsAcknowledged:true},controller.signal);
    if(!owns())return;
    setNotice(result.ok?{error:false,text:m.retentionDeleted(result.value.deletedCount,result.value.revision)}:{error:true,text:errorMessage(result.error.code)});
   }else{
    const result=await(kind==='plan'?services.planRetention(controller.signal):services.reviewRetention(controller.signal));
    if(!owns())return;
    if(result.ok)setPreview({owner:services,scope,value:result.value});else setNotice({error:true,text:errorMessage(result.error.code)});
   }
  }catch{if(owns())setNotice({error:true,text:errorMessage('PROTOCOL_ERROR')});}
  finally{if(mine===generation.current){request.current=null;if(mounted.current)setBusy(false);}}
 }
 return <section className="panel" aria-labelledby="retention-title">
  <h2 id="retention-title">{m.retentionTitle}</h2><p>{m.retentionHelp}</p>
  <p className="warning">{m.retentionLimits}</p><p><a href="#/recovery">{m.openRecovery}</a></p><p>{m.retentionRestoreWarning}</p><p>{m.retentionProtected}</p>
  {!services||!unlocked?<p>{m.retentionLocked}</p>:<>
   <div className="actions"><button type="button" disabled={busy} onClick={()=>{void run('plan');}}>{m.retentionPlan}</button>
    {visible?.nativeReviewAvailable?<button type="button" disabled={busy} onClick={()=>{void run('review');}}>{m.retentionReview}</button>:null}
    {busy?<button type="button" onClick={()=>request.current?.abort()}>{m.retentionCancel}</button>:null}
   </div>
   {visible?<><p role="status">{m.retentionCounts(visible.archiveReviewCount,visible.reviewedDeleteCount,visible.protectedCount,visible.revision)}</p>
    {!visible.nativeReviewAvailable?<p>{m.retentionUnavailable}</p>:null}
    {visible.reviewedDeleteCount>256?<p className="warning">{m.retentionTooLarge}</p>:null}
    {visible.reviewedDeleteCount>0&&visible.reviewedDeleteCount<=256?<div>
     <label><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.currentTarget.checked)} /> {m.retentionConsent}</label>
     <button type="button" disabled={busy||!consent} onClick={()=>{void run('delete');}}>{m.retentionDelete}</button>
    </div>:null}
   </>:null}
  </>}
  {busy?<p role="status">{m.retentionBusy}</p>:null}
  {notice?<p className={notice.error?'notice error':'notice'} role={notice.error?'alert':'status'}>{notice.text}</p>:null}
 </section>;
}
