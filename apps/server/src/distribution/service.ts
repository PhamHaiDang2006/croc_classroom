import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createCrocEngine,type CrocEngine,type Transfer} from '@croc-classroom/croc-engine';
import {verifyDirectory} from '@croc-classroom/shared/node';
import {endpoints,isTerminalTicketStatus,ticketLifetimeMs,type FetchResponse,type IssuedTicket,type Manifest,type TicketInfo,type TicketResultReport,type TransferFailureReason} from '@croc-classroom/shared';
import type {ServerConfig} from '../config.js';
import type {Db} from '../db/index.js';
import {appError} from '../http/errors.js';
import {registerEndpoint} from '../http/route.js';
import type {RouteModule} from '../app.js';
import type {AuthContext} from '../ports/sessions.js';
import {requireAvailableAssignment,withAssignmentLock} from '../ports/assignment-lifecycle.js';
import type {TicketIssuer,TransferOutcomeHandler} from '../ports/transfers.js';
import {toReceipt,type SubmissionRow} from '../submissions/queries.js';
import {PayloadStore} from '../vps-worker/store.js';
import {Peers,type Peer} from './peers.js';

interface Operation {ticket:IssuedTicket;sender:string|null;receiver:string|null;submission:string|null;peer?:Peer;transfer?:Transfer;sent:boolean}
interface Row {id:string;kind:IssuedTicket['kind'];assignment_id:string;sender_user_id:string|null;receiver_user_id:string|null;submission_id:string|null;status:TicketInfo['status'];failure_reason:TransferFailureReason|null;created_at:string;expires_at:string;finished_at:string|null}
interface Demand {auth:AuthContext;id:string;ip:string;nets:string[]}
const now=()=>new Date().toISOString();
function workerEngine(){
  const name=process.platform==='win32'?'croc.exe':'croc';
  const bundled=fileURLToPath(new URL('../../../../packages/croc-engine/bin/'+process.platform+'-'+process.arch+'/'+name,import.meta.url));
  return createCrocEngine(process.env.CROC_BINARY || (existsSync(bundled)?bundled:'croc'));
}

export class Distribution implements TicketIssuer {
  readonly peers:Peers; readonly store:PayloadStore;
  outcomes!:TransferOutcomeHandler;
  private live=new Map<string,Operation>();
  private workers=new Set<Promise<void>>();
  private queue=new Map<string,Demand & {queuedAt:number}>();
  private timer?:NodeJS.Timeout;
  private draining=false;
  private closed=false;
  private unavailable=new Map<string,{failures:number;until:number}>();
  constructor(readonly db:Db,readonly config:ServerConfig,readonly engine:CrocEngine=workerEngine()){
    this.store=new PayloadStore(db,join(config.dataDir,'payloads'));
    this.peers=new Peers(db);
    this.peers.onResult=(peer,m)=>{
      const op=this.live.get(m.ticketId);
      if(op?.peer!==peer || !op)return;
      if(m.ok)op.sent=true;else this.fail(op,m.reason??'peer_disconnected');
    };
    this.peers.onDisconnect=peer=>{
      for(const op of this.live.values())if(op.peer===peer && !op.sent)this.fail(op,'peer_disconnected');
      for(const [key,d] of this.queue)if(d.auth.sessionId===peer.auth.sessionId)this.queue.delete(key);
    };
  }
  seedingCount(id:string){return this.peers.available(id).length;}
  async start(){await this.store.recover();this.timer=setInterval(()=>void this.tick().catch(()=>{}),500);}
  async close(){
    this.closed=true;clearInterval(this.timer);this.peers.close();
    for(const op of this.live.values())this.fail(op,'server_restart');
    while(this.draining)await new Promise(r=>setTimeout(r,20));
    await Promise.all(this.workers);
  }
  private row(id:string){return this.db.prepare('SELECT * FROM tickets WHERE id=?').get(id) as Row|undefined;}
  private info(row:Row,user:string):TicketInfo {
    const submission=row.kind==='nop_bai' && row.status==='xong' && row.sender_user_id===user ?
      this.db.prepare('SELECT * FROM submissions WHERE id=?').get(row.submission_id) as SubmissionRow:undefined;
    return {ticketId:row.id,kind:row.kind,assignmentId:row.assignment_id,status:row.status,failureReason:row.failure_reason,createdAt:row.created_at,expiresAt:row.expires_at,finishedAt:row.finished_at,receipt:submission?toReceipt(submission):null};
  }
  private authorized(id:string,user:string){
    const r=this.row(id);if(!r || (r.sender_user_id!==user && r.receiver_user_id!==user))throw appError('NOT_FOUND');return r;
  }
  private release(op:Operation){
    if(!this.live.delete(op.ticket.ticketId))return;
    if(op.peer)op.peer.busy--;
    const r=this.row(op.ticket.ticketId);
    if(r)for(const user of [op.sender,op.receiver])if(user){
      const {ticketId,kind,assignmentId,status,failureReason,receipt}=this.info(r,user);
      this.peers.notify(user,{type:'ticket.updated',ticketId,kind,assignmentId,status,failureReason,receipt});
    }
  }
  private fail(op:Operation,reason:TransferFailureReason){
    const {ticketId}=op.ticket;
    const status=reason==='timeout'?'het_han':['cancelled','superseded','assignment_deleted','server_restart'].includes(reason)?'huy':'loi';
    const changed=this.db.prepare("UPDATE tickets SET status=?,failure_reason=?,finished_at=? WHERE id=? AND status IN ('cho','dang_chay')").run(status,reason,now(),ticketId).changes;
    if(changed){
      if(op.peer && ['peer_disconnected','verify_failed','timeout'].includes(reason)) {
        const key=op.ticket.assignmentId+'/'+op.peer.auth.userId;
        const failures=(this.unavailable.get(key)?.failures??0)+1;
        this.unavailable.set(key,{failures,until:Date.now()+60000});
      }
      op.transfer?.cancel();
      for(const user of [op.sender,op.receiver])if(user)this.peers.notify(user,{type:'ticket.cancel',ticketId,reason});
    }
    this.release(op);
  }
  private issue(kind:IssuedTicket['kind'],id:string,total:number,sender:string|null,receiver:string|null,submission:string|null=null,peer?:Peer){
    if(this.closed)throw appError('CAPACITY_EXHAUSTED');
    for(const op of this.live.values())if(op.ticket.kind===kind && op.ticket.assignmentId===id &&
      (kind==='gv_tai_len' || (kind==='nop_bai' && op.sender===sender) || (kind==='phat_de' && op.receiver===receiver) || (kind==='gv_thu_bai' && op.submission===submission)))this.fail(op,'superseded');
    if(!peer && [...this.live.values()].filter(x=>!x.peer).length>=this.config.limits.vpsTransferSlots)throw appError('CAPACITY_EXHAUSTED',undefined,{retryAfterSeconds:2});
    let code=this.engine.generateCode();
    while([...this.live.values()].some(x=>x.ticket.crocCode.slice(0,4)===code.slice(0,4)))code=this.engine.generateCode();
    const ticket:IssuedTicket={ticketId:randomUUID(),kind,assignmentId:id,crocCode:code,totalBytes:total,expiresAt:new Date(Date.now()+ticketLifetimeMs(total,this.config.limits)).toISOString()};
    this.db.prepare("INSERT INTO tickets(id,kind,assignment_id,sender_kind,sender_user_id,receiver_kind,receiver_user_id,submission_id,status,bytes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,'dang_chay',?,?,?)")
      .run(ticket.ticketId,kind,id,sender?'user':'vps',sender,receiver?'user':'vps',receiver,submission,total,now(),ticket.expiresAt);
    const op:Operation={ticket,sender,receiver,submission,peer,sent:false};
    this.live.set(ticket.ticketId,op);if(peer){peer.busy++;peer.lastUsed=Date.now();}
    return op;
  }
  private spawnWork(op:Operation,manifest?:Manifest,ref?:string){
    const task=this.work(op,manifest,ref).catch(()=>this.fail(op,'internal'));
    this.workers.add(task);void task.finally(()=>this.workers.delete(task));
    return op.ticket;
  }
  private hold(id:string,user:string){
    this.db.prepare('INSERT INTO holdings(assignment_id,user_id,verified_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(id,user,now());
  }
  private async work(op:Operation,manifest?:Manifest,ref?:string){
    const {assignmentId:id,ticketId,kind,totalBytes,expiresAt,crocCode}=op.ticket;
    const receive=manifest!==undefined;
    let keep=false;
    try{
      const path=receive?await this.store.create(id,ticketId):this.store.path(id,ref!);
      if(!this.live.has(ticketId))return;
      const options={relay:{...this.config.relay,address:process.env.WORKER_RELAY_ADDRESS||this.config.relay.address},code:crocCode,timeoutMs:Date.parse(expiresAt)-Date.now()};
      op.transfer=receive?this.engine.receive({...options,outDir:path,maxBytes:totalBytes}):this.engine.send({...options,payloadDir:path});
      const result=await op.transfer.done;
      if(!this.live.has(ticketId))return;
      if(!result.ok){this.fail(op,result.error.code==='TIMEOUT'?'timeout':result.error.code==='SIZE_LIMIT_EXCEEDED'?'size_exceeded':'peer_disconnected');return;}
      if(!receive){op.sent=true;return;}
      if(!(await verifyDirectory(path,manifest)).ok){this.fail(op,'verify_failed');return;}
      const event={ticketId,assignmentId:id,storageRef:ticketId,verifiedAt:now()};
      if(kind==='gv_tai_len'){
        const saved=await this.outcomes.onUploadStored(event);
        if(saved.accepted){keep=true;this.hold(id,op.sender!);this.peers.notify(op.sender!,{type:'assignment.published',assignmentId:id});}
      }else{
        const saved=await this.outcomes.onSubmissionStored({...event,studentId:op.sender!,manifest});
        if(saved.accepted){
          keep=true;
          const gv=this.db.prepare("SELECT id FROM users WHERE role='lecturer'").get() as {id:string};
          this.peers.notify(gv.id,{type:'submission.new',assignmentId:id,submissionId:saved.receipt.submissionId,version:saved.receipt.version});
        }
      }
      if(!keep)this.fail(op,'timeout');else this.release(op);
    }finally{
      if(receive && !keep)await this.store.remove(id,ticketId);
      if(kind==='nop_bai' || kind==='gv_thu_bai')await this.store.gc(id);
    }
  }
  async openUpload(r:Parameters<TicketIssuer['openUpload']>[0]){return this.spawnWork(this.issue('gv_tai_len',r.assignmentId,r.totalBytes,r.lecturerId,null),r.manifest);}
  async openSubmission(r:Parameters<TicketIssuer['openSubmission']>[0]){return this.spawnWork(this.issue('nop_bai',r.assignmentId,r.totalBytes,r.studentId,null),r.manifest);}
  async openCollect(r:Parameters<TicketIssuer['openCollect']>[0]){return this.spawnWork(this.issue('gv_thu_bai',r.assignmentId,r.totalBytes,null,r.lecturerId,r.submissionId),undefined,r.storageRef);}
  async purgeAssignment(id:string){
    for(const op of this.live.values())if(op.ticket.assignmentId===id)this.fail(op,'assignment_deleted');
    for(const [key,d] of this.queue)if(d.id===id)this.queue.delete(key);
    for(const p of this.peers.online){
      if(p.auth.role==='lecturer' || this.db.prepare('SELECT 1 FROM participants WHERE assignment_id=? AND student_id=?').get(id,p.auth.userId))this.peers.send(p,{type:'assignment.deleted',assignmentId:id});
      p.sharing.delete(id);
    }
    await this.store.purge(id);
  }
  private async select(d:Demand):Promise<IssuedTicket|undefined>{
    const {id,auth}=d;
    requireAvailableAssignment(this.db,id);
    const row=this.db.prepare("SELECT a.total_size,a.storage_ref FROM assignments a JOIN participants p ON p.assignment_id=a.id WHERE a.id=? AND p.student_id=? AND a.status='da_phat_hanh'").get(id,auth.userId) as {total_size:number;storage_ref:string}|undefined;
    if(!row?.storage_ref)throw appError('NOT_PARTICIPANT');
    const sources=this.peers.available(id).filter(p=>p.auth.userId!==auth.userId && p.busy<4 && (this.unavailable.get(id+'/'+p.auth.userId)?.failures??0)<2).sort((a,b)=>a.lastUsed-b.lastUsed);
    const lan=(p:Peer)=>!!p.ip && p.ip===d.ip && p.subnets.some(s=>d.nets.includes(s));
    const tryPeers=async(list:Peer[])=>{
      for(const p of list){
        if(!this.peers.online.has(p) || p.busy>=4)continue;
        const op=this.issue('phat_de',id,row.total_size,p.auth.userId,auth.userId,null,p);
        if(await this.peers.offer(p,op.ticket,this.config.limits.serveAcceptTimeoutSeconds*1000) && this.live.has(op.ticket.ticketId))return op.ticket;
        this.fail(op,'source_rejected');
      }
    };
    const local=await tryPeers(sources.filter(lan));if(local)return local;
    const vps=[...this.live.values()].filter(o=>!o.peer);
    if(vps.length<this.config.limits.vpsTransferSlots && vps.filter(o=>o.ticket.kind==='phat_de').length<this.config.limits.vpsDistributionSlots)
      return this.spawnWork(this.issue('phat_de',id,row.total_size,null,auth.userId),undefined,row.storage_ref);
    return tryPeers(sources.filter(p=>!lan(p)));
  }
  private async fetch(d:Demand):Promise<FetchResponse>{
    return withAssignmentLock(this.db,d.id,async()=>{
      const key=d.id+'/'+d.auth.userId;
      for(const op of this.live.values())if(op.ticket.assignmentId===d.id && op.ticket.kind==='phat_de' && op.receiver===d.auth.userId)this.fail(op,'superseded');
      // A newcomer must not jump ahead of an existing demand for this assignment.
      const occupied=[...this.queue.entries()].some(([k,v])=>k!==key && v.id===d.id);
      if(occupied){requireAvailableAssignment(this.db,d.id);if(!this.db.prepare('SELECT 1 FROM participants WHERE assignment_id=? AND student_id=?').get(d.id,d.auth.userId))throw appError('NOT_PARTICIPANT');}
      const ticket=occupied?undefined:await this.select(d);
      if(ticket){this.queue.delete(key);return {status:'ticket',ticket};}
      this.queue.set(key,{...d,queuedAt:Date.now()});return {status:'queued',position:[...this.queue.keys()].indexOf(key)+1};
    });
  }
  private async tick(){
    if(this.draining || this.closed)return;this.draining=true;
    try{
      for(const {assignment_id} of this.db.prepare('SELECT DISTINCT assignment_id FROM payload_gc').all() as {assignment_id:string}[]){await this.store.gc(assignment_id);}
      for(const [key,state] of this.unavailable) if(state.until<Date.now())this.unavailable.delete(key);
      for(const op of this.live.values())if(op.ticket.expiresAt<=now())this.fail(op,'timeout');
      for(const [key,d] of this.queue){
        const peer=[...this.peers.online].find(p=>p.auth.sessionId===d.auth.sessionId && this.peers.valid(p));
        if(!peer){if(Date.now()-d.queuedAt>30000)this.queue.delete(key);continue;}
        await withAssignmentLock(this.db,d.id,async()=>{
          if(this.closed || this.queue.get(key)!==d)return;
          try{
            const ticket=await this.select(d);
            if(ticket){this.queue.delete(key);if(!this.peers.send(peer,{type:'ticket.ready',ticket}))this.fail(this.live.get(ticket.ticketId)!,'peer_disconnected');}
            else this.peers.send(peer,{type:'queue.position',assignmentId:d.id,position:[...this.queue.keys()].indexOf(key)+1});
          }catch{this.queue.delete(key);}
        });
      }
    }finally{this.draining=false;}
  }
  private async report(ticketId:string,user:string,report:TicketResultReport){
    const r=this.authorized(ticketId,user);
    const op=this.live.get(ticketId);
    if(isTerminalTicketStatus(r.status)){
      if((report.outcome==='succeeded')!==(r.status==='xong') || (report.outcome==='failed' && report.reason!==r.failure_reason))throw appError('TICKET_STATE_INVALID');
      return this.info(r,user);
    }
    if(!op)throw appError('TICKET_STATE_INVALID');
    if(op.ticket.expiresAt<=now())this.fail(op,'timeout');
    else if(report.outcome==='failed')this.fail(op,report.reason);
    else if(op.receiver===user){
      // A receiver can finish before the VPS sender's process closes.
      if(op.transfer && !(await op.transfer.done).ok) this.fail(op,'peer_disconnected');
      else if(op.ticket.kind==='gv_thu_bai'){
        await this.outcomes.onCollectConfirmed({ticketId,submissionId:op.submission!,confirmedAt:now()});
        if(this.row(ticketId)?.status==='xong')this.release(op);
        await this.store.gc(r.assignment_id);
      }else if(op.ticket.kind==='phat_de'){
        await withAssignmentLock(this.db,r.assignment_id,async()=>{
          requireAvailableAssignment(this.db,r.assignment_id);
          if(!this.live.has(ticketId) || op.ticket.expiresAt<=now())return;
          await this.outcomes.onFetchVerified({ticketId,assignmentId:r.assignment_id,studentId:user,source:op.peer?(op.peer.auth.role==='lecturer'?'lecturer':'peer'):'vps',verifiedAt:now()});
          this.hold(r.assignment_id,user);
          this.db.prepare("UPDATE tickets SET status='xong',finished_at=? WHERE id=?").run(now(),ticketId);this.release(op);
        });
      }
    }
    return this.info(this.authorized(ticketId,user),user);
  }
  routes:RouteModule=(app,deps)=>{
    registerEndpoint(app,endpoints.fetch,({auth,params,request,body})=>this.fetch({auth,id:params.id,ip:request.ip.replace(/^::ffff:/,''),nets:body.localSubnets}),deps);
    registerEndpoint(app,endpoints.leaveFetchQueue,async({auth,params})=>{await withAssignmentLock(this.db,params.id,async()=>{this.queue.delete(params.id+'/'+auth.userId);});},deps);
    registerEndpoint(app,endpoints.getTicket,async({auth,params})=>this.info(this.authorized(params.id,auth.userId),auth.userId),deps);
    registerEndpoint(app,endpoints.ticketResult,({auth,params,body})=>this.report(params.id,auth.userId,body),deps);
  };
}
