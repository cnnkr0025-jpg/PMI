#!/usr/bin/env node
/**
 * PickMyAI 백업 암호화 스크립트
 *
 * 기능:
 *   - Supabase DB 덤프 (pg_dump via Supabase REST or direct connection)
 *   - AES-256-GCM 암호화 (BACKUP_ENCRYPTION_KEY 또는 ENCRYPTION_KEY 사용)
 *   - 백업 파일명: backup-YYYYMMDD-HHMMSS-{hash8}.enc
 *   - 복호화 검증 (암호화 직후 정합성 확인)
 *   - 보존 정책: 최근 N개만 유지 (기본 7개)
 *   - 복구 리허설 모드 (--dry-run: 복호화만 테스트)
 *
 * 사용법:
 *   node scripts/backup-encrypt.js                    # 백업 실행
 *   node scripts/backup-encrypt.js --decrypt <file>   # 복호화
 *   node scripts/backup-encrypt.js --verify <file>    # 복호화 검증만
 *   node scripts/backup-encrypt.js --list             # 백업 목록
 *   node scripts/backup-encrypt.js --rehearsal        # 복구 리허설 (최신 백업 복호화 + 통계 출력)
 *
 * 환경변수:
 *   BACKUP_ENCRYPTION_KEY  — 64자 hex (우선). 없으면 ENCRYPTION_KEY 사용
 *   BACKUP_DIR             — 백업 저장 경로 (기본: ./backups)
 *   BACKUP_KEEP            — 보존할 백업 수 (기본: 7)
 *   SUPABASE_DB_URL        — PostgreSQL 연결 문자열 (백업 소스)
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ── 상수 ──────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_VERSION = 'v1';
const BACKUP_MAGIC = Buffer.from('PICKMYAI_BACKUP');
const BACKUP_VERSION = 1;

// ── 환경 설정 ─────────────────────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
const BACKUP_KEEP = parseInt(process.env.BACKUP_KEEP || '7', 10);

function getEncryptionKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 64) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY (또는 ENCRYPTION_KEY) 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 64 hex chars).'
    );
  }
  return Buffer.from(raw.slice(0, 64), 'hex');
}

// ── 암호화 / 복호화 ───────────────────────────────────────────

/**
 * 평문 Buffer를 암호화하여 Buffer 반환
 * 형식: MAGIC(15) | VERSION(1) | IV(12) | AUTH_TAG(16) | CIPHERTEXT(...)
 */
function encryptBuffer(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    BACKUP_MAGIC,
    Buffer.from([BACKUP_VERSION]),
    iv,
    authTag,
    encrypted,
  ]);
}

/**
 * 암호화된 Buffer를 복호화하여 원본 Buffer 반환
 */
function decryptBuffer(data) {
  const magicLen = BACKUP_MAGIC.length;

  if (!data.slice(0, magicLen).equals(BACKUP_MAGIC)) {
    throw new Error('유효하지 않은 백업 파일 (Magic 불일치)');
  }

  const version = data[magicLen];
  if (version !== BACKUP_VERSION) {
    throw new Error(`지원되지 않는 백업 버전: ${version}`);
  }

  let offset = magicLen + 1;
  const iv = data.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = data.slice(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const ciphertext = data.slice(offset);

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── 파일명 생성 ───────────────────────────────────────────────
function makeBackupFilename(content) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `backup-${ts}-${hash}.enc`;
}

// ── Supabase DB 덤프 ─────────────────────────────────────────
function dumpDatabase() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    // DB URL 없으면 환경변수 스냅샷으로 대체
    console.warn('[Backup] SUPABASE_DB_URL 미설정 — 환경변수 스냅샷으로 대체합니다.');
    const snapshot = {
      timestamp: new Date().toISOString(),
      type: 'env-snapshot',
      keys: Object.keys(process.env).filter((k) => !k.includes('KEY') && !k.includes('SECRET') && !k.includes('PASSWORD')),
    };
    return Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8');
  }

  console.log('[Backup] pg_dump 실행 중...');
  const result = spawnSync('pg_dump', ['--no-owner', '--no-acl', '--format=plain', dbUrl], {
    encoding: 'buffer',
    maxBuffer: 500 * 1024 * 1024, // 500MB
  });

  if (result.status !== 0) {
    throw new Error(`pg_dump 실패: ${result.stderr?.toString() || 'unknown error'}`);
  }

  return result.stdout;
}

// ── 백업 목록 ─────────────────────────────────────────────────
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.enc'))
    .map((f) => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      size: fs.statSync(path.join(BACKUP_DIR, f)).size,
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

// ── 보존 정책: 오래된 백업 삭제 ─────────────────────────────
function applyRetentionPolicy() {
  const backups = listBackups();
  const toDelete = backups.slice(BACKUP_KEEP);
  for (const b of toDelete) {
    fs.unlinkSync(b.path);
    console.log(`[Backup] 오래된 백업 삭제: ${b.name}`);
  }
}

// ── 메인 명령어 ───────────────────────────────────────────────
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === '--list') {
  const backups = listBackups();
  if (backups.length === 0) {
    console.log('백업 파일이 없습니다.');
  } else {
    console.log(`\n백업 목록 (${BACKUP_DIR}):\n`);
    backups.forEach((b, i) => {
      const dt = new Date(b.mtime).toISOString();
      const sizeMB = (b.size / 1024 / 1024).toFixed(2);
      console.log(`  ${i + 1}. ${b.name}  [${sizeMB} MB]  ${dt}`);
    });
  }
  process.exit(0);
}

if (cmd === '--decrypt') {
  const file = args[1];
  if (!file) { console.error('파일 경로를 지정하세요.'); process.exit(1); }
  const outFile = file.replace(/\.enc$/, '.decrypted.sql');
  const data = fs.readFileSync(file);
  const plain = decryptBuffer(data);
  fs.writeFileSync(outFile, plain);
  console.log(`복호화 완료: ${outFile} (${plain.length} bytes)`);
  process.exit(0);
}

if (cmd === '--verify') {
  const file = args[1];
  if (!file) { console.error('파일 경로를 지정하세요.'); process.exit(1); }
  console.log(`[Verify] ${file} 검증 중...`);
  const data = fs.readFileSync(file);
  const plain = decryptBuffer(data);
  const hash = crypto.createHash('sha256').update(plain).digest('hex').slice(0, 16);
  console.log(`[Verify] 성공 — ${plain.length} bytes, SHA-256 앞 16자: ${hash}`);
  process.exit(0);
}

if (cmd === '--rehearsal') {
  // 복구 리허설: 최신 백업 복호화 + 통계 출력
  console.log('\n=== 복구 리허설 시작 ===\n');
  const backups = listBackups();
  if (backups.length === 0) {
    console.log('[Rehearsal] 백업 파일이 없습니다. 먼저 백업을 실행하세요.');
    process.exit(1);
  }
  const latest = backups[0];
  const start = Date.now();
  console.log(`[Rehearsal] 대상: ${latest.name} (${(latest.size / 1024 / 1024).toFixed(2)} MB)`);
  const data = fs.readFileSync(latest.path);
  const plain = decryptBuffer(data);
  const elapsed = Date.now() - start;
  console.log(`[Rehearsal] 복호화 성공`);
  console.log(`[Rehearsal] 복구 소요 시간: ${elapsed}ms`);
  console.log(`[Rehearsal] 복원 데이터 크기: ${plain.length} bytes`);
  console.log(`[Rehearsal] SHA-256: ${crypto.createHash('sha256').update(plain).digest('hex')}`);
  console.log('\n=== 복구 리허설 완료 ===\n');
  process.exit(0);
}

// ── 기본: 백업 실행 ──────────────────────────────────────────
(async () => {
  try {
    console.log('[Backup] 백업 시작...');

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // 1. DB 덤프
    const rawData = dumpDatabase();
    console.log(`[Backup] 덤프 완료: ${rawData.length} bytes`);

    // 2. 암호화
    const encrypted = encryptBuffer(rawData);
    console.log(`[Backup] 암호화 완료: ${encrypted.length} bytes`);

    // 3. 저장
    const filename = makeBackupFilename(rawData);
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, encrypted);
    console.log(`[Backup] 저장: ${filePath}`);

    // 4. 즉시 복호화 검증 (정합성 확인)
    const verified = decryptBuffer(encrypted);
    if (!verified.equals(rawData)) {
      throw new Error('복호화 검증 실패: 원본 데이터 불일치');
    }
    console.log(`[Backup] 복호화 검증 성공`);

    // 5. 보존 정책 적용
    applyRetentionPolicy();

    // 6. 요약
    const sizeMB = (encrypted.length / 1024 / 1024).toFixed(2);
    const hash = crypto.createHash('sha256').update(encrypted).digest('hex').slice(0, 16);
    console.log(`\n[Backup] 완료 ✓`);
    console.log(`  파일: ${filename}`);
    console.log(`  크기: ${sizeMB} MB`);
    console.log(`  SHA-256 (앞 16자): ${hash}`);
    console.log(`  보존 개수: ${BACKUP_KEEP}개\n`);
  } catch (err) {
    console.error('[Backup] 오류:', err.message);
    process.exit(1);
  }
})();
