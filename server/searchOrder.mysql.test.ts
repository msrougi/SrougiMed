import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import mysql from "mysql2/promise";
import {getTableConfig} from "drizzle-orm/mysql-core";
import {patients,phoneBook} from "../drizzle/schema";
const url=process.env.SROUGI_SORT_TEST_DATABASE_URL;
if(url){
 const parsed=new URL(url);
 if(!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname) || !/^\/srougi_test_sort[a-z0-9_]*$/.test(parsed.pathname))throw Error("Sort tests require isolated localhost database");
}
describe.skipIf(!url)("ordem alfabética das buscas — MySQL isolado",()=>{
 let connection:mysql.Connection,db:typeof import("./db");
 const names=["Zilda Maria Silva","Bruno Silva","Ana Maria Silva","ana maria silva","Álvaro Silva","Carlos Silva","Beatriz de Souza Silva","Daniel Silva","Eduardo Silva","Fernanda Silva","Gustavo Silva","Helena Silva","Igor Silva","Jorge Silva"];
 const order=[5,3,4,7,2,6,8,9,10,11,12,13,14,1];
 beforeAll(async()=>{
   vi.stubEnv("DATABASE_URL",url!);
   connection=await mysql.createConnection(url!);
   for(const table of [patients,phoneBook]){
     const config=getTableConfig(table);
     // Only fixture columns are needed; production migrations are not run by this test.
     const columns=config.columns.map(column=>"`"+column.name+"` "+column.getSQLType()+(column.primary?" PRIMARY KEY":""));
     await connection.query("CREATE TABLE IF NOT EXISTS `"+config.name+"` ("+columns.join(",")+") DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
     await connection.query("DELETE FROM `"+config.name+"`");
     await connection.query("INSERT INTO `"+config.name+"` (id,name) VALUES ?",[names.map((name,index)=>[index+1,name])]);
   }
   db=await import("./db");
 });
 afterAll(async()=>{
   const database=db && await db.getDb();
   if(database)await database.$client.promise().end();
   await connection?.end();vi.unstubAllEnvs();
 });
 it("ordena todos os resultados por nome antes de paginar, incluindo busca por sobrenome",async()=>{
   for(const search of [db.searchPatients,db.searchPhoneBook]){
     const pages=await Promise.all([1,2,3].map(page=>search({name:"Silva",page,pageSize:5})));
     expect(pages.map(page=>page.total)).toEqual([14,14,14]);
     expect(pages.map(page=>page.items.length)).toEqual([5,5,4]);
     expect(pages.flatMap(page=>page.items.map(item=>item.id))).toEqual(order);
     expect(new Set(pages.flatMap(page=>page.items.map(item=>item.id))).size).toBe(14);
   }
 });
 it("busca pelo segundo nome e desempata nomes equivalentes por ID",async()=>{
   for(const search of [db.searchPatients,db.searchPhoneBook]){
     const page=await search({name:"mArIa"});
     expect(page.items.map(item=>item.id)).toEqual([3,4,1]);
     expect(page.total).toBe(3);
   }
 });
 it("abas antigas usam a mesma ordem e os mesmos limites e deslocamentos",async()=>{
   for(const search of [db.searchPatientsLegacy,db.searchPhoneBookLegacy]){
     const items=await search({name:"Silva",limit:5,offset:5});
     expect(items.map(item=>item.id)).toEqual(order.slice(5,10));
   }
 });
});
