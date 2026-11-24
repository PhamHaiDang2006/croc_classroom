/* global window */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
import {_electron} from 'playwright';

const root=await mkdtemp(join(tmpdir(),'classroom-e2e-'));
const binary=resolve('packages/croc-engine/bin',process.platform+'-'+process.arch,process.platform==='win32'?'croc.exe':'croc');
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;await new Promise(r=>probe.close(r));
const url='http://127.0.0.1:'+port;
const env={...process.env,CROC_BINARY:binary,DB_PATH:join(root,'db.sqlite'),DATA_DIR:root,HOST:'127.0.0.1',PORT:String(port),RELAY_ADDRESS:'127.0.0.1:29881',RELAY_PASS:randomBytes(24).toString('hex'),LOG_LEVEL:'silent',DEV_FAKE_TRANSFERS:'false',LIMIT_VPS_TRANSFER_SLOTS:'1',LIMIT_TICKET_MIN_SECONDS:'12'};
const password=randomBytes(20).toString('hex');
const children=[],desktops=[];
function start(bin,args,env){const child=spawn(bin,args,{env,stdio:'ignore',windowsHide:true});children.push({child,closed:new Promise(r=>child.once('close',r))});}
async function client(role){
  const runtime=await _electron.launch({args:['--user-data-dir='+join(root,role),resolve('apps/desktop')]});
  desktops.push(runtime);
  const page=await runtime.firstWindow();
  await page.waitForFunction(()=>!!window.croc);
  await page.evaluate(()=>{window.events=[];window.croc.on('transfer',e=>window.events.push(e));});
  async function call(channel,input){
    const res=await page.evaluate(([channel,input])=>window.croc.invoke(channel,input),[channel,input]);
    assert.equal(res.ok,true,channel+': '+res.error?.code);
    return res.data;
  }
  async function choose(channel,path,input) {
    await runtime.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);
    return call(channel,input);
  }
  async function done(id){
    const handle=await page.waitForFunction(id=>window.events.find(e=>e.operationId===id && ['succeeded','failed','cancelled','timeout'].includes(e.phase)),id,{timeout:30000});
    const event=await handle.jsonValue();assert.equal(event.phase,'succeeded',event.kind+': '+event.error?.message);return event;
  }
  return {call,choose,done,page};
}
try{
  execFileSync(process.execPath,['apps/server/dist/cli.js','create-lecturer','--username','teacher','--full-name','Giảng viên'],{env,input:password+'\n',stdio:['pipe','ignore','pipe']});
  start(binary,['relay','--host','127.0.0.1','--ports','29881,29882,29883,29884,29885'],{...process.env,CROC_PASS:env.RELAY_PASS});
  start(process.execPath,['apps/server/dist/index.js'],env);
  for(let i=0;i<60;i++){if(await fetch(url+'/health').then(r=>r.ok).catch(()=>false))break;await delay(150);}
  const gv=await client('lecturer'),sv=await client('student');
  await gv.call('session.login',{serverUrl:url,credentials:{role:'lecturer',username:'teacher',password}});
  const {created}=await gv.call('students.import',{csv:'SV01,Đặng Huy'});
  await sv.call('session.activate',{serverUrl:url,request:{mssv:'SV01',activationCode:created[0].activation.activationCode,newPassword:password}});
  const work=join(root,'work'),collected=join(root,'collected'),src=join(root,'src');
  for(const d of [work,collected,src])await mkdir(d);
  await sv.choose('settings.chooseDirectory',work,{field:'workDir'});
  await gv.choose('settings.chooseDirectory',collected,{field:'collectDir'});
  await gv.call('settings.update',{seedingEnabled:false});
  await writeFile(join(src,'đề.txt'),'Đề kiểm tra');
  const {selectionId}=await gv.choose('dialog.pickPayload',src,{mode:'directory'});
  const {assignment,operationId}=await gv.call('assignments.create',{selectionId,title:'Bài thật',description:'',deadlineAt:null});
  await gv.done(operationId);
  const assignmentId=assignment.id;
  await sv.call('student.join',{codePhrase:assignment.codePhrase});
  // Hold the only worker slot with an unfulfilled upload. The sender cannot publish it.
  const login=await fetch(url+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'lecturer',username:'teacher',password})});
  assert.equal(login.status,200);
  const headers={'content-type':'application/json',authorization:'Bearer '+(await login.json()).token};
  const manifest=(await gv.call('assignments.get',{assignmentId})).manifest;
  const pending=await fetch(url+'/assignments',{method:'POST',headers,body:JSON.stringify({title:'Pending',manifest,deadlineAt:null})});
  assert.equal(pending.status,201);
  const {ticket}=await pending.json();
  const report=await fetch(url+'/tickets/'+ticket.ticketId+'/result',{method:'POST',headers,body:JSON.stringify({outcome:'succeeded'})});
  assert.equal((await report.json()).status,'dang_chay');
  const queued=await sv.call('student.fetch',{assignmentId});
  await sv.page.waitForFunction(id=>window.events.some(e=>e.operationId===id && e.phase==='queued'),queued.operationId,{timeout:5000});
  await sv.done(queued.operationId);
  const expired=await fetch(url+'/tickets/'+ticket.ticketId,{headers});
  assert.equal((await expired.json()).status,'het_han');
  console.log('Worker authority, expiry, queue and ticket.ready passed.');
  assert.equal(await readFile(join(work,'Bài thật','đề.txt'),'utf8'),'Đề kiểm tra');
  console.log('Upload, publish and verified fetch from VPS passed.');
  for(const version of [1,2]){
    const file=join(src,'answer.txt'),content='Lời giải '+version;
    await writeFile(file,content);
    const selected=await sv.choose('dialog.pickPayload',file,{mode:'files'});
    const submitted=await sv.call('student.submit',{assignmentId,selectionId:selected.selectionId});
    const event=await sv.done(submitted.operationId);
    assert.equal(event.receipt.version,version);
    for(let i=0;i<100;i++){
      const rows=await gv.call('submissions.list',{assignmentId});
      if(rows[0]?.localVersion===version)break;
      await delay(200);
    }
    assert.equal(await readFile(join(collected,'Bài thật','SV01_DangHuy','answer.txt'),'utf8'),content);
    assert.equal((await sv.call('student.getReceipt',{assignmentId})).version,version);
  }
  console.log('Submission, receipts and automatic collection of both versions passed.');
  await gv.call('settings.update',{seedingEnabled:true});
  for(let i=0;i<50;i++){
    if((await gv.call('assignments.get',{assignmentId})).stats.seeding>=2)break;
    await delay(100);
  }
  await sv.done((await sv.call('student.fetch',{assignmentId})).operationId);
  await gv.page.waitForFunction(()=>window.events.some(e=>e.kind==='seed' && e.phase==='succeeded'),undefined,{timeout:10000});
  await gv.call('assignments.delete',{assignmentId});
  assert.deepEqual(await sv.call('student.listAssignments'),[]);
  console.log('Authenticated peer seeding and deletion passed.');
}finally{
  for(const d of desktops.reverse())await d.close();
  for(const {child,closed} of children.reverse()){child.kill();await closed;}
  await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
