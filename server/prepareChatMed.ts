import type { Connection } from "mysql2/promise";

// Additive, repeatable preparation, before serving HTTP. No users are grouped automatically.
export async function prepareChatMed(db: Pick<Connection, "query">) {
  const [lock] = await db.query<any[]>("SELECT GET_LOCK('srougi_chatmed_schema_v1',30) AS ok");
  if (Number(lock[0].ok) !== 1) throw new Error("CHATMED_SCHEMA_BUSY");
  try {
    const [columns] = await db.query<any[]>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='chatGroup'");
    if (!columns.length) await db.query("ALTER TABLE users ADD COLUMN chatGroup VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL");
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_conversations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      groupName VARCHAR(60) COLLATE utf8mb4_bin NOT NULL,
      memberA INT NOT NULL DEFAULT 0, memberB INT NOT NULL DEFAULT 0,
      UNIQUE KEY chatmed_scope (groupName,memberA,memberB)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_messages (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      conversationId INT UNSIGNED NOT NULL, senderId INT NOT NULL,
      senderName VARCHAR(200) NOT NULL, body TEXT NOT NULL,
      clientId VARCHAR(36) CHARACTER SET ascii NOT NULL,
      createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY chatmed_retry (senderId,clientId),
      KEY chatmed_history (conversationId,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_attachments (
      messageId INT UNSIGNED NOT NULL PRIMARY KEY,
      fileName VARCHAR(180) NOT NULL, mimeType VARCHAR(100) CHARACTER SET ascii NOT NULL,
      byteSize INT UNSIGNED NOT NULL, fileHash CHAR(64) CHARACTER SET ascii NOT NULL,
      fileData LONGBLOB NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_mentions (
      messageId INT UNSIGNED NOT NULL,userId INT NOT NULL,
      startPos INT UNSIGNED NOT NULL,endPos INT UNSIGNED NOT NULL,displayName VARCHAR(200) NOT NULL,
      PRIMARY KEY(messageId,startPos),KEY chatmed_mentions_user(userId,messageId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_reads (
      conversationId INT UNSIGNED NOT NULL, userId INT NOT NULL,
      lastReadId INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (conversationId,userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_push_subscriptions (
      endpointHash CHAR(64) CHARACTER SET ascii PRIMARY KEY,userId INT NOT NULL,
      endpoint VARCHAR(2048) CHARACTER SET ascii NOT NULL,p256dh VARCHAR(100) CHARACTER SET ascii NOT NULL,
      auth VARCHAR(30) CHARACTER SET ascii NOT NULL,sound BOOLEAN NOT NULL DEFAULT 1,
      accountHash CHAR(64) CHARACTER SET ascii NOT NULL,sessionHash CHAR(64) CHARACTER SET ascii NOT NULL,
      trustedDeviceId CHAR(64) CHARACTER SET ascii NULL,
      expiresAt DATETIME NOT NULL,KEY chat_push_user(userId),KEY chat_push_session(sessionHash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_push_events (
      messageId INT UNSIGNED PRIMARY KEY,attempts INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS chatmed_push_deliveries (
      messageId INT UNSIGNED NOT NULL,endpointHash CHAR(64) CHARACTER SET ascii NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(messageId,endpointHash)
    ) ENGINE=InnoDB`);
  } finally { await db.query("SELECT RELEASE_LOCK('srougi_chatmed_schema_v1')"); }
}
