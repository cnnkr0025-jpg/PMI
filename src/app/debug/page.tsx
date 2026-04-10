'use client';

import { useStore } from '@/store';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';

export default function DebugPage() {
  const store = useStore();
  const [log, setLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testInitWallet = () => {
    addLog('지갑 초기화 시도...');
    if (store.currentUser) {
      store.initWallet(store.currentUser.id);
      addLog(`✅ 지갑 초기화 완료: ${store.currentUser.id}`);
    } else {
      addLog('❌ 사용자 정보 없음');
    }
  };

  const testAddCredits = () => {
    addLog('크레딧 추가 시도...');
    const testCredits = {
      'gpt5': 10,
      'claude-sonnet': 5
    };
    store.addCredits(testCredits);
    addLog(`✅ 크레딧 추가 완료: ${JSON.stringify(testCredits)}`);
  };

  const checkLocalStorage = () => {
    addLog('로컬 스토리지 확인 중...');
    const storage = localStorage.getItem('pick-my-ai-storage');
    if (storage) {
      try {
        const parsed = JSON.parse(storage);
        addLog(`📦 저장된 데이터: ${JSON.stringify(parsed, null, 2)}`);
      } catch (e) {
        addLog('❌ 로컬 스토리지 데이터 손상됨');
        console.error('localStorage parse error:', e);
      }
    } else {
      addLog('❌ 로컬 스토리지 비어있음');
    }
  };

  const clearStorage = () => {
    addLog('⚠️ 로컬 스토리지 삭제...');
    localStorage.removeItem('pick-my-ai-storage');
    addLog('✅ 삭제 완료');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold">🔧 디버그 페이지</h1>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">현재 상태</h3>
                <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
{JSON.stringify({
  isAuthenticated: store.isAuthenticated,
  currentUser: store.currentUser,
  wallet: store.wallet,
  selections: store.selections,
  models: store.models.length + '개'
}, null, 2)}
                </pre>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">테스트 액션</h3>
                <div className="space-y-2">
                  <Button onClick={testInitWallet} className="w-full">
                    지갑 초기화 테스트
                  </Button>
                  <Button onClick={testAddCredits} className="w-full">
                    크레딧 추가 테스트
                  </Button>
                  <Button onClick={checkLocalStorage} className="w-full" variant="outline">
                    로컬 스토리지 확인
                  </Button>
                  <Button onClick={clearStorage} className="w-full" variant="outline">
                    ⚠️ 로컬 스토리지 삭제
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">로그</h2>
          </CardHeader>
          <CardContent className="p-6">
            <div className="bg-black text-green-400 p-4 rounded font-mono text-sm h-64 overflow-auto">
              {log.length === 0 ? (
                <div className="text-gray-500">로그가 없습니다...</div>
              ) : (
                log.map((line, i) => (
                  <div key={i}>{line}</div>
                ))
              )}
            </div>
            <Button 
              onClick={() => setLog([])} 
              variant="outline" 
              className="mt-2"
            >
              로그 지우기
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">사용 방법</h2>
          </CardHeader>
          <CardContent className="p-6">
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>로그인한 상태에서 이 페이지 방문</li>
              <li>&ldquo;지갑 초기화 테스트&rdquo; 버튼 클릭</li>
              <li>&ldquo;크레딧 추가 테스트&rdquo; 버튼 클릭</li>
              <li>현재 상태에 wallet과 credits가 표시되는지 확인</li>
              <li>문제가 있다면 &ldquo;로컬 스토리지 확인&rdquo; 클릭하여 데이터 확인</li>
              <li>완전 초기화가 필요하면 &ldquo;로컬 스토리지 삭제&rdquo; 클릭</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

