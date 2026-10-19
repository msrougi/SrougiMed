// Operator-only probe in the Render build environment. Does not read medical data.
import {mkdtemp,readFile,writeFile,mkdir,open,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const emit=(stage,value)=>console.log('[personalmed-sql-probe]',stage,JSON.stringify(value));
const run=(cmd,args,env=process.env,timeout=180000)=>new Promise((resolve,reject)=>{
 const child=spawn(cmd,args,{env,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',b=>{output=(output+b).slice(-20000);});child.stderr.on('data',b=>{output=(output+b).slice(-20000);});
 const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
 child.on('error',()=>{clearTimeout(timer);reject(new Error('COMMAND_UNAVAILABLE'));});
 child.on('close',code=>{clearTimeout(timer);resolve({code,output});});
});
let root,server,logHandle,systemDir,removeSystemDir=false;
try {
 root=await mkdtemp(join(tmpdir(),'personalmed-sql-probe-'));
 const platform=(await readFile('/etc/os-release','utf8')).match(/^PRETTY_NAME=(.*)$/m)?.[1]??'unknown';
 emit('platform',{platform,uid:process.getuid?.()});
 const base='https://packages.microsoft.com/ubuntu/22.04/mssql-server-2022/';
 const metadata=await fetch(base+'dists/jammy/main/binary-amd64/Packages.gz');
 if(!metadata.ok)throw new Error('PACKAGE_METADATA_UNAVAILABLE');
 const text=gunzipSync(Buffer.from(await metadata.arrayBuffer())).toString('utf8');
 const packages=text.split('\n\n').map(block=>Object.fromEntries(block.split('\n').filter(line=>/^\S[^:]*: /.test(line)).map(line=>{const i=line.indexOf(': ');return [line.slice(0,i),line.slice(i+2)];})));
 const pkg=packages.find(p=>p.Package==='mssql-server'&&p.Version==='16.0.4212.1-3'&&p.Architecture==='amd64');
 if(!pkg||!/^pool\/main\/m\/mssql-server\/[A-Za-z0-9_.+-]+\.deb$/.test(pkg.Filename)||!/^\w{64}$/.test(pkg.SHA256))throw new Error('PACKAGE_NOT_PINNED');
 const response=await fetch(new URL(pkg.Filename,base),{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('PACKAGE_DOWNLOAD_FAILED');
 const deb=join(root,'server.deb');const handle=await open(deb,'wx',0o600);const hash=createHash('sha256');let bytes=0;
 try{for await(const chunk of response.body){hash.update(chunk);bytes+=chunk.length;await handle.write(chunk);}}finally{await handle.close();}
 if(hash.digest('hex')!==pkg.SHA256||bytes!==Number(pkg.Size))throw new Error('PACKAGE_CHECKSUM_FAILED');
 emit('package',{version:pkg.Version,checksumVerified:true,bytes});
 const unpack=await run('dpkg-deb',['-x',deb,root]);if(unpack.code!==0)throw new Error('PACKAGE_EXTRACT_FAILED');
 const libraryPath=join(root,'opt/mssql/lib')+':'+join(root,'usr/lib/x86_64-linux-gnu');
 const dependencyURL='https://deb.debian.org/debian/pool/main/s/sssd/libsss-nss-idmap0_2.8.2-4+deb12u1_amd64.deb';
 const dependency=await fetch(dependencyURL,{signal:AbortSignal.timeout(30000)});
 if(!dependency.ok)throw new Error('DEPENDENCY_DOWNLOAD_FAILED');
 const dependencyBytes=Buffer.from(await dependency.arrayBuffer());
 if(dependencyBytes.length!==24376||createHash('sha256').update(dependencyBytes).digest('hex')!=='b46e804225030e2c56f0bca453c1393e5df03152747eda312a239e97c7ea9c7f')throw new Error('DEPENDENCY_CHECKSUM_FAILED');
 const dependencyFile=join(root,'dependency.deb');await writeFile(dependencyFile,dependencyBytes,{mode:0o600});
 if((await run('dpkg-deb',['-x',dependencyFile,root])).code!==0)throw new Error('DEPENDENCY_EXTRACT_FAILED');
 emit('dependency',{name:'libsss-nss-idmap0',version:'2.8.2-4+deb12u1',checksumVerified:true});
 const binary=join(root,'opt/mssql/bin/sqlservr');const deps=await run('ldd',[binary],{...process.env,LD_LIBRARY_PATH:libraryPath});
 const missing=deps.output.split('\n').filter(line=>line.includes('not found')).map(line=>line.trim().split(' ')[0]);
 if(missing.length){emit('missing-libraries',missing);throw new Error('RUNTIME_LIBRARIES_MISSING');}
 if(!process.env.HOME)throw new Error('USER_HOME_MISSING');
 systemDir=join(process.env.HOME,'.system');
 try{await access(systemDir);throw new Error('EXISTING_SQL_RUNTIME_DATA');}catch(error){if(error.code!=='ENOENT')throw error;}
 removeSystemDir=true;
 for(const name of ['data','log','dump','backup','secrets'])await mkdir(join(root,name),{mode:0o700});
 logHandle=await open(join(root,'startup.log'),'wx',0o600);
 // Preserve the existing user home; do not redefine it to a task directory.
 const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:process.env.LANG??"C.UTF-8",ACCEPT_EULA:'Y',MSSQL_PID:'Developer',MSSQL_SA_PASSWORD:'Aa1!'+randomBytes(32).toString('hex'),
 MSSQL_MEMORY_LIMIT_MB:'2048',MSSQL_TCP_PORT:'15433',MSSQL_DATA_DIR:join(root,'data'),MSSQL_LOG_DIR:join(root,'log'),MSSQL_DUMP_DIR:join(root,'dump'),MSSQL_BACKUP_DIR:join(root,'backup'),
 MSSQL_MASTER_DATA_FILE:join(root,'data/master.mdf'),MSSQL_MASTER_LOG_FILE:join(root,'log/mastlog.ldf'),MSSQL_ERROR_LOG_FILE:join(root,'log/errorlog'),MSSQL_MACHINE_KEY_FILE:join(root,'secrets/machine.key'),
 LD_LIBRARY_PATH:libraryPath};
 // The build environment has no public service port for this transient process.
 server=spawn(binary,[],{env,cwd:root,stdio:['ignore',logHandle.fd,logHandle.fd]});let launchError=false;server.on('error',()=>{launchError=true;});
 let outcome='NOT_READY';
 for(let i=0;i<60;i++){
 await new Promise(resolve=>setTimeout(resolve,1000));
 const log=await readFile(join(root,'startup.log'),'utf8');
 if(/ready for client connections/i.test(log)){outcome='READY';break;}
 if(/permission denied|access is denied|Access Denied|errno = 13|error 13\b/i.test(log)){outcome='FILESYSTEM_PERMISSION_DENIED';break;}
 if(launchError||server.exitCode!==null){outcome='PROCESS_EXITED';break;}
 }
 emit('result',{outcome,exitCode:server.exitCode});
 if(outcome==='READY'&&process.argv.includes('--recover')){
 const {recoverPersonalMed}=await import('./recover-personalmed-source.mjs');
 await recoverPersonalMed(root,env.MSSQL_SA_PASSWORD);
 }
 if(outcome!=='READY'){
 const log=await readFile(join(root,'startup.log'),'utf8');
 emit('startup-diagnostic',log.replaceAll(env.MSSQL_SA_PASSWORD,'[redacted]').slice(0,1800));
 }
} catch(error){emit('failed',/^[A-Z_]+$/.test(error.message)?error.message:'PROBE_FAILED');}
finally {
 if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(resolve=>{const timeout=setTimeout(()=>{server.kill('SIGKILL');resolve();},5000);server.once('close',()=>{clearTimeout(timeout);resolve();});});}
 await logHandle?.close();
 if(removeSystemDir&&systemDir)await rm(systemDir,{recursive:true,force:true});
 if(root)await rm(root,{recursive:true,force:true});
}
