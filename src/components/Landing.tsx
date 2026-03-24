'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Sparkles, ArrowRight, Zap, Users, TrendingDown, MessageSquare, CreditCard, Shield, Lock, Settings } from 'lucide-react';
import { initialModels, seriesInfo } from '@/data/models';
import { formatWon, getFixedDisplayPriceOrFallback } from '@/utils/pricing';
import { useCustomTheme } from '@/hooks/useCustomTheme';
import { LogoMark } from './LogoMark';

const features = [
  {
    icon: <Zap className="w-6 h-6" />,
    title: '1회 단위 결제',
    description: '필요한 만큼만 구매하세요. 구독없이 사용한 만큼만 결제됩니다.',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: '멀티 AI 모델',
    description: 'ChatGPT, Claude, Perplexity 등 다양한 AI를 한 곳에서 이용하세요.',
  },
  {
    icon: <TrendingDown className="w-6 h-6" />,
    title: '다중 선택 할인',
    description: '모델을 많이 선택할수록 할인율이 높아집니다. 최대 30% 할인!',
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: '통합 채팅',
    description: '하나의 화면에서 여러 AI 모델과 자유롭게 전환하며 이용하세요.',
  },
  {
    icon: <CreditCard className="w-6 h-6" />,
    title: '크레딧 지갑',
    description: '구매한 크레딧은 지갑에 적립되어 필요할 때마다 사용할 수 있습니다.',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: '투명한 가격',
    description: '모든 가격을 투명하게 공개하며 실시간으로 계산해 보여줍니다.',
  },
];

const pricingExamples = ['gpt53instant', 'gpt54', 'sonnet46'].map((id) => {
  const model = initialModels.find((item) => item.id === id)!;
  return {
    id,
    title: model.displayName,
    price: getFixedDisplayPriceOrFallback(model.id, model.piWon).price,
  };
});

export const Landing: React.FC = () => {
  const router = useRouter();
  const { isAuthenticated, logout } = useStore();
  const { getElementStyle, customDesignTheme, theme, getContrastColor } = useCustomTheme();


  const handleGetStarted = () => {
    if (isAuthenticated) {
      router.push('/configurator');
    } else {
      router.push('/login');
    }
  };

  const handleViewDashboard = () => {
    if (isAuthenticated) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  };

  const handleLogin = () => {
    router.push('/login?mode=login');
  };

  const handleSignup = () => {
    router.push('/login?mode=signup');
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen text-gray-900 bg-gray-50" style={{ backgroundColor: theme.backgroundColor }}>

      <nav className="sticky top-0 z-40 glass-card-vivid border-b border-white/50 shadow-soft-lg" style={{ backgroundColor: theme.headerColor + 'F2' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div 
              className="preview-nav-logo flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105 bg-transparent"
              style={getElementStyle('nav-logo', {})}
            >
              <LogoMark className="h-10 w-10" />
            </div>
            <span className="preview-nav-title text-2xl font-black text-gray-900" style={getElementStyle('nav-title', {})}>Pick-My-AI</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
                  대시보드
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.push('/chat')}>
                  채팅
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">설정</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  로그아웃
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={handleLogin} className="preview-nav-login" style={getElementStyle('nav-login', {})}>
                  로그인
                </Button>
                <Button size="sm" onClick={handleSignup} className="preview-nav-signup" style={getElementStyle('nav-signup', {})}>
                  회원가입
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        <section id="intro" className="relative overflow-hidden px-4 pb-24 pt-32 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl">
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 neo-card px-6 py-3" style={getElementStyle('hero-badge', {})}>
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <span className="font-bold text-blue-600">혁신적인 AI 플랫폼</span>
                </div>
                <h1 className="preview-hero-title text-6xl font-black leading-tight sm:text-7xl tracking-tighter text-gray-900" style={getElementStyle('hero-title', {})}>
                  <span className="block">원하는 AI를</span>
                  <span className="block mt-3 text-blue-600">1회 단위로</span>
                  <span className="block">결제하세요</span>
                </h1>
                <p className="preview-hero-description text-2xl leading-relaxed font-medium text-gray-600" style={getElementStyle('hero-description', {})}>
                  구독 없이 사용한 만큼만 결제되는
                  <span className="font-bold text-gray-900"> 스마트한 시스템</span>
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    size="lg"
                    onClick={handleGetStarted}
                    className="preview-hero-primary-button bg-primary text-primary-foreground hover:opacity-90 px-8 py-4 text-lg font-bold transition-all duration-200 hover-lift"
                    style={getElementStyle('hero-primary-button', {})}
                  >
                    {isAuthenticated ? '지금 시작하기' : '무료로 시작하기'}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  {isAuthenticated && (
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={handleViewDashboard}
                      className="preview-hero-secondary-button text-gray-700 hover:text-blue-600"
                      style={getElementStyle('hero-secondary-button', {})}
                    >
                      대시보드
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {features.slice(0, 3).map((feature, index) => (
                    <div key={feature.title} className="neo-card p-5 hover-float card-tilt">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl neo-inset text-blue-600">
                          {feature.icon}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">{feature.title}</h3>
                          <p className="mt-1 text-xs text-gray-600 leading-relaxed">{feature.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="neo-card p-6 border-gradient hover-float card-3d">
                <div className="border-b border-gray-200 pb-4 mb-6">
                  <div className="inline-flex items-center gap-2 neo-inset px-4 py-2 rounded-full">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-600">실시간 가격</span>
                  </div>
                </div>
                <div className="space-y-4">
                  {pricingExamples.map((example) => {
                    const exampleModel = initialModels.find((model) => model.id === example.id);
                    const exampleDescription = exampleModel?.description ?? '';
                    const examplePrice = example.price;

                    return (
                      <div
                        key={example.title}
                        className="flex items-center justify-between rounded-xl neo-inset px-5 py-4 hover-lift transition-all duration-200"
                      >
                        <div>
                          <p className="text-base font-bold text-gray-900">{example.title}</p>
                          {exampleDescription ? (
                            <p className="text-xs text-gray-500 mt-1">{exampleDescription}</p>
                          ) : null}
                        </div>
                        <span className="text-lg font-black text-blue-600">
                          {formatWon(examplePrice)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="px-4 pb-24 pt-12 sm:px-6 lg:px-8 relative">
          <div className="mx-auto max-w-7xl space-y-16">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 neo-card px-6 py-3">
                <Zap className="h-5 w-5 text-blue-600" />
                <span className="font-bold text-blue-600">왜 Pick-My-AI?</span>
              </div>
              <h2 className="text-5xl font-black text-gray-900 sm:text-6xl tracking-tight">
                AI를 고르고 쓰는 일,
                <span className="block mt-2 text-blue-600">더 쉽게</span>
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
                Pick-My-AI는 필요한 모델을 골라 효율적으로 사용할 수 있도록 도와줍니다.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <div key={feature.title} className="neo-card p-8 hover-float card-tilt group">
                  <div className="space-y-5">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary group-hover:opacity-90 transition-all duration-300">
                      <div className="text-white">{feature.icon}</div>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-gray-900">{feature.title}</h3>
                      <p className="mt-3 text-base leading-relaxed text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="models" className="px-4 py-20 sm:px-6 lg:px-8 relative">
          <div className="mx-auto max-w-7xl space-y-12">
            <div className="text-center">
              <Badge variant="default" size="sm">
                모델 선택
              </Badge>
              <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">Pick-My-AI 모델</h2>
              <p className="mt-4 text-base text-gray-600">최신 모델을 한눈에 살펴보세요.</p>
            </div>

            <div className="space-y-12">
              {Object.entries(seriesInfo).map(([seriesKey, info]) => {
                const seriesModels = initialModels.filter((model) => model.series === seriesKey);

                if (seriesModels.length === 0) {
                  return null;
                }

                return (
                  <div key={seriesKey} className="space-y-5 rounded-2xl glass-card border-white/40 shadow-soft p-6 md:p-8 hover-lift">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 text-blue-600 shadow-sm">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900">{info.name}</h3>
                        <p className="mt-1 text-sm text-gray-600">{info.description}</p>
                      </div>
                      {!isAuthenticated && (
                        <Badge variant="amber" size="sm">
                          로그인 필요
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {seriesModels.map((model) => (
                        <Card
                          key={model.id}
                          variant="bordered"
                          className="border-gray-200 bg-white/80 backdrop-blur transition-all duration-300 hover:border-blue-300 hover:shadow-soft-lg hover-lift"
                        >
                          <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-lg font-semibold text-gray-900">{model.displayName}</h4>
                                <p className="mt-1 text-xs text-gray-500">{model.description}</p>
                              </div>
                              {!isAuthenticated && <Lock className="h-4 w-4 text-gray-400" />}
                            </div>
                            <div className="text-sm font-medium text-blue-600">
                              {formatWon(getFixedDisplayPriceOrFallback(model.id, model.piWon).price)}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-4 pb-20 sm:px-6 lg:px-8 relative">
          <div className="mx-auto max-w-7xl space-y-10">
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { percent: '5%', label: '2개 선택' },
                { percent: '10%', label: '3개 선택' },
                { percent: '20%', label: '5개 선택' },
                { percent: '30%', label: '7개 이상 선택' },
              ].map((item, index) => (
                <Card key={item.percent} className="glass-card shadow-soft hover-lift">
                  <CardContent className="space-y-2 p-5 text-center">
                    <p className="text-3xl font-bold text-blue-600">{item.percent}</p>
                    <p className="text-sm text-gray-600">{item.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-center text-sm text-gray-600">여러 모델 선택 시 자동 할인 혜택!</p>
          </div>
        </section>

        <section className="relative overflow-hidden px-4 py-20 bg-primary text-primary-foreground sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-4xl text-center">
            <h2 className="text-4xl font-extrabold sm:text-5xl">지금 바로 시작하세요</h2>
            <p className="mt-4 text-xl opacity-95">복잡한 구독 없이, 필요한 AI만 골라 사용하세요.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleGetStarted}
                className="preview-cta-primary-button bg-white text-primary-600 hover:bg-gray-100 shadow-soft hover:shadow-glow transition-all duration-200 hover:scale-[1.02]"
                style={getElementStyle('cta-primary-button', {})}
              >
                {isAuthenticated ? '지금 시작하기' : '무료로 시작하기'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => router.push('/feedback')}
                className="preview-cta-secondary-button border border-white/60 bg-white/10 text-white hover:bg-white/20"
                style={getElementStyle('cta-secondary-button', {})}
              >
                상담 예약하기
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-gray-200/50 glass-card py-8 px-4">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-center text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2 text-gray-600">
            <Sparkles className="h-5 w-5 text-primary-500" />
            <span className="font-semibold text-gray-700">Pick-My-AI</span>
            <span>© 2025 Pick-My-AI. All rights reserved.</span>
          </div>
          <p className="text-gray-500 text-xs">AI, 이제 고르기도 쉬운 선택</p>
        </div>
      </footer>
    </div>
  );
};

