'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Mic, MicOff, Play, Trash2, Check, Volume2 } from 'lucide-react';
import { useStore } from '@/store';
import { toast } from 'sonner';

const SYMBOL_CATEGORIES = [
  {
    label: '화살표',
    symbols: ['➤', '▶', '→', '⇒', '⟹', '↗', '↑', '⬆', '⬅', '⇨', '➜', '➝', '➞', '➟', '➠', '➡', '➢', '➣', '➥', '➦', '➧', '➨', '➩', '➪', '➫', '➬', '➭', '➮', '➯', '➱'],
  },
  {
    label: '도형',
    symbols: ['■', '▲', '●', '◆', '★', '✦', '✧', '❖', '◉', '◎', '⬟', '⬠', '⬡', '⬢', '⬣', '⬤', '⬥', '⬦', '⬧', '⬨', '⬩', '⬪', '⬫', '⬬', '⬭', '⬮', '⬯', '⬰', '⬱'],
  },
  {
    label: '특수문자',
    symbols: ['♠', '♥', '♦', '♣', '♟', '♞', '♝', '♜', '♛', '♚', '⚔', '⚙', '🔧', '🔨', '⚒', '⛏', '🔩', '🗜', '⚖', '🔗', '⛓', '🔐', '🔒', '🔓', '🔑', '🗝', '🔔', '🔕'],
  },
  {
    label: '수학/기호',
    symbols: ['∞', '≈', '≠', '≤', '≥', '±', '×', '÷', '∑', '∏', '√', '∫', '∂', '∇', '∈', '∉', '∩', '∪', '⊂', '⊃', '⊆', '⊇', '⊕', '⊗', '⊙', '⊚', '⊛', '⊜', '⊝', '⊞'],
  },
  {
    label: '별/장식',
    symbols: ['★', '☆', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '✰', '❋', '❊', '❉', '❈', '❇', '❆', '❅', '❄', '❃', '❂', '❁', '❀', '✿', '✾', '✽', '✼', '✻', '✺', '✹', '✸'],
  },
];

interface SendButtonCustomizerProps {
  onClose: () => void;
}

export const SendButtonCustomizer: React.FC<SendButtonCustomizerProps> = ({ onClose }) => {
  const { sendButtonSymbol, sendButtonSound, setSendButtonSymbol, setSendButtonSound } = useStore();

  const [activeCategory, setActiveCategory] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState(sendButtonSymbol);
  const [recordedSound, setRecordedSound] = useState(sendButtonSound);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedSound(reader.result as string);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => {
          if (s >= 9) {
            stopRecording();
            return 10;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error('마이크 접근 권한이 필요합니다.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  }, []);

  const playSound = useCallback(() => {
    if (!recordedSound) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(recordedSound);
    audioRef.current = audio;
    setIsPlaying(true);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.play();
  }, [recordedSound]);

  const handleApply = () => {
    setSendButtonSymbol(selectedSymbol);
    setSendButtonSound(recordedSound);
    toast.success('전송버튼 설정이 저장되었습니다!');
    onClose();
  };

  const handleReset = () => {
    setSelectedSymbol('');
    setRecordedSound('');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white">
          <div>
            <h2 className="text-lg font-bold">전송버튼 커스터마이징</h2>
            <p className="text-xs text-white/80 mt-0.5">기호와 소리를 설정하면 전송 시 적용됩니다</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 미리보기 */}
          <div className="flex items-center justify-center gap-4 p-4 bg-gray-50 rounded-xl border">
            <span className="text-sm text-gray-500">미리보기:</span>
            <button
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl shadow-lg"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
            >
              {selectedSymbol || '➤'}
            </button>
            {recordedSound && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> 소리 설정됨
              </span>
            )}
          </div>

          {/* 기호 선택 */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">기호 선택</h3>
            {/* 카테고리 탭 */}
            <div className="flex gap-1 flex-wrap mb-3">
              {SYMBOL_CATEGORIES.map((cat, i) => (
                <button
                  key={i}
                  onClick={() => setActiveCategory(i)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
                    activeCategory === i
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {/* 기호 그리드 */}
            <div className="grid grid-cols-10 gap-1.5 p-3 bg-gray-50 rounded-xl border max-h-48 overflow-y-auto">
              {/* 기본(아이콘) 선택지 */}
              <button
                onClick={() => setSelectedSymbol('')}
                className={`w-9 h-9 rounded-lg text-xs flex items-center justify-center border-2 transition-all hover:scale-110 ${
                  selectedSymbol === '' ? 'border-violet-500 bg-violet-50' : 'border-transparent bg-white hover:border-gray-300'
                }`}
                title="기본 아이콘"
              >
                <span className="text-gray-400 text-[10px]">기본</span>
              </button>
              {SYMBOL_CATEGORIES[activeCategory].symbols.map((sym, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border-2 transition-all hover:scale-110 ${
                    selectedSymbol === sym
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-transparent bg-white hover:border-gray-300'
                  }`}
                  title={sym}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* 소리 녹음 */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">전송 소리 녹음</h3>
            <div className="p-4 bg-gray-50 rounded-xl border space-y-3">
              <p className="text-xs text-gray-500">
                최대 10초 녹음 가능. 녹음하지 않으면 전송 시 아무 소리도 나지 않습니다.
              </p>
              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                    {recordedSound ? '다시 녹음' : '녹음 시작'}
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors animate-pulse"
                  >
                    <MicOff className="w-4 h-4" />
                    녹음 중지 ({recordingSeconds}s)
                  </button>
                )}

                {recordedSound && !isRecording && (
                  <>
                    <button
                      onClick={playSound}
                      disabled={isPlaying}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      {isPlaying ? '재생 중...' : '미리 듣기'}
                    </button>
                    <button
                      onClick={() => setRecordedSound('')}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </button>
                  </>
                )}
              </div>

              {isRecording && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 rounded-full transition-all ${
                          i < recordingSeconds ? 'bg-red-500 h-4' : 'bg-gray-300 h-2'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-red-500">{recordingSeconds}/10초</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            초기화
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition-all shadow-md"
            >
              <Check className="w-4 h-4" />
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
