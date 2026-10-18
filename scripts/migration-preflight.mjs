import { access,readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
const writable=async p=>{try{await access(p,constants.W_OK);return true;}catch{return false;}};
let memory=null;try{memory=(await readFile("/sys/fs/cgroup/memory.max","utf8")).trim();}catch{}
console.log("[migration-preflight]",JSON.stringify({uid:process.getuid?.(),memory,totalMemory:os.totalmem(),tmpWritable:await writable("/tmp"),varWritable:await writable("/var/opt"),cwdWritable:await writable(process.cwd())}));
