"use client";

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from 'lucide-react';
import { useStore } from '@/store';
import { csrfFetch } from '@/lib/csrfFetch';
import { toast } from 'sonner';

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { clearSelections, currentUser } = useStore();

  useEffect(() => {
    const run = async () => {
      const paymentKey = params.get('paymentKey');
      const amount = params.get('amount');
      const orderId = params.get('orderId');
      const raw = localStorage.getItem('pending_purchase');
      const pendingOrder = raw ? JSON.parse(raw) as { orderId?: string; orderToken?: string } : null;

      if (paymentKey && amount && orderId && pendingOrder?.orderId === orderId && pendingOrder.orderToken) {
        try {
          const res = await csrfFetch('/api/payments/toss/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentKey, orderId, amount: Number(amount), orderToken: pendingOrder.orderToken })
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.reason || err?.error || '결제 확인에 실패했습니다.');
          }

          const result = await res.json();
          const currentState = useStore.getState();
          useStore.setState({
            wallet: currentState.currentUser ? {
              userId: currentState.currentUser.id,
              credits: result.walletCredits || {},
              transactions: currentState.wallet?.transactions || [],
            } : currentState.wallet,
            pmcBalance: result.settings?.pmcBalance || currentState.pmcBalance,
          });

          localStorage.removeItem('pending_purchase');
          toast.success('결제가 완료되었습니다. 크레딧이 안전하게 지급되었습니다.');
        } catch (e) {
          toast.error((e as Error)?.message || '결제 확인 중 오류가 발생했습니다.');
        }
      } else {
        toast.error('검증 가능한 결제 정보가 없습니다.');
      }

      clearSelections();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderId = params.get('orderId') || '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card variant="elevated" className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">결제 완료</h2>
          <p className="text-gray-600 mb-4">주문번호: {orderId}</p>
          <Button variant="primary" onClick={() => router.push('/dashboard')}>대시보드로 이동</Button>
        </CardContent>
      </Card>
    </div>
  );
}


