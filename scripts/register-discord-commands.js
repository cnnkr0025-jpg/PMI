#!/usr/bin/env node
/**
 * PickMyAI Discord 슬래시 커맨드 등록 스크립트
 *
 * 사용법:
 *   DISCORD_APPLICATION_ID=xxx DISCORD_BOT_TOKEN=xxx node scripts/register-discord-commands.js
 *
 * 또는 .env 파일에 값을 넣고:
 *   node -e "require('dotenv').config()" -e "require('./scripts/register-discord-commands.js')"
 */

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('❌ DISCORD_APPLICATION_ID 와 DISCORD_BOT_TOKEN 환경변수가 필요합니다.');
  process.exit(1);
}

const commands = [
  {
    name: '유저조회',
    description: '이메일로 유저 정보를 조회합니다',
    options: [
      { name: '이메일', description: '조회할 유저의 이메일', type: 3, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
    ],
  },
  {
    name: '유저삭제',
    description: '유저를 완전히 삭제합니다 (복구 불가)',
    options: [
      { name: '이메일', description: '삭제할 유저의 이메일', type: 3, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
    ],
  },
  {
    name: '크레딧',
    description: '특정 모델의 크레딧을 추가/설정합니다 (/모델목록으로 ID 확인)',
    options: [
      { name: '이메일', description: '대상 유저 이메일', type: 3, required: true },
      { name: '모델', description: '모델 ID (예: gpt5, haiku45, sonar)', type: 3, required: true },
      { name: '수량', description: '크레딧 수량', type: 4, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
      {
        name: '방식',
        description: '추가 또는 설정 (기본: 추가)',
        type: 3,
        required: false,
        choices: [
          { name: '➕ 추가 (기존 + 수량)', value: 'add' },
          { name: '🔄 설정 (수량으로 교체)', value: 'set' },
        ],
      },

    ],
  },
  {
    name: '차단',
    description: 'IP를 영구 차단합니다',
    options: [
      { name: 'ip', description: '차단할 IP 주소', type: 3, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
      { name: '사유', description: '차단 사유', type: 3, required: false },
    ],
  },
  {
    name: '차단해제',
    description: 'IP 차단을 해제합니다',
    options: [
      { name: 'ip', description: '해제할 IP 주소', type: 3, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
    ],
  },
  {
    name: '차단목록',
    description: '현재 차단된 IP 목록을 확인합니다',
    options: [
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
    ],
  },
  {
    name: '상태',
    description: 'PickMyAI 시스템 상태를 확인합니다',
  },
  {
    name: '플랜변경',
    description: '유저의 플랜을 변경합니다 (free/plus/pro/max)',
    options: [
      { name: '이메일', description: '대상 유저 이메일', type: 3, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
      {
        name: '플랜',
        description: '변경할 플랜',
        type: 3,
        required: true,
        choices: [
          { name: '🆓 Free', value: 'free' },
          { name: '💎 Plus', value: 'plus' },
          { name: '🔥 Pro', value: 'pro' },
          { name: '👑 Max', value: 'max' },
        ],
      },
    ],
  },
  {
    name: '모델목록',
    description: '크레딧 추가 시 사용할 수 있는 모델 ID 목록을 확인합니다',
  },
  {
    name: '크레딧조회',
    description: '특정 사용자의 현재 크레딧을 모델별로 조회합니다',
    options: [
      { name: '이메일', description: '조회할 유저 이메일', type: 3, required: true },
      { name: '코드', description: '관리자 코드 (2차 인증)', type: 3, required: true },
    ],
  },
  {
    name: '사이트상태',
    description: 'PMI 사이트 및 DB 연결 상태를 실시간 확인합니다',
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  console.log(`🔄 ${commands.length}개 슬래시 커맨드 등록 중...`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ 등록 실패 (${res.status}):`, text);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✅ ${result.length}개 커맨드 등록 완료!`);
  result.forEach((cmd) => {
    console.log(`   /${cmd.name} — ${cmd.description}`);
  });
}

registerCommands().catch((err) => {
  console.error('❌ 오류:', err);
  process.exit(1);
});
