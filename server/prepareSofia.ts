import type { Connection } from "mysql2/promise";

export async function prepareSofia(db:Pick<Connection,"query">){
  const [lock]=await db.query<any[]>("SELECT GET_LOCK('srougi_sofia_schema_v1',30) AS ok");
  if(Number(lock[0].ok)!==1)throw new Error("SOFIA_SCHEMA_BUSY");
  try{
    await db.query(`CREATE TABLE IF NOT EXISTS sofia_private_messages (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      ownerUserId INT NOT NULL, role ENUM('user','assistant') NOT NULL,
      body TEXT NOT NULL, clientId VARCHAR(36) CHARACTER SET ascii NOT NULL,
      createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY sofia_private_retry(ownerUserId,role,clientId),
      KEY sofia_private_history(ownerUserId,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.query(`CREATE TABLE IF NOT EXISTS sofia_contexts (
      scopeType ENUM('private','group') NOT NULL,
      scopeKey VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
      planJson MEDIUMTEXT NOT NULL,
      updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY(scopeType,scopeKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  }finally{await db.query("SELECT RELEASE_LOCK('srougi_sofia_schema_v1')");}
}

