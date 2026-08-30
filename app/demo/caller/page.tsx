'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Peer, MediaConnection } from 'peerjs';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Upload,
  Radio,
  Smartphone,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export default function CallerPage() {
  const [roomCode, setRoomCode] = useState<string>('VG-9088');
  const [selectedSource, setSelectedSource] = useState<'mic' | 'cloned' | 'genuine' | 'custom'>('cloned');
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
  const [customAudioName, setCustomAudioName] = useState<string>('');
  
  // Call status: 'idle' | 'initializing' | 'dialing' | 'connected' | 'ended' | 'error'
  const [callStatus, setCallStatus] = useState<string>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to place call to Receiver');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 10));

  // Refs for WebRTC & Audio
  const peerRef = useRef<Peer | null>(null);
  const activeCallRef = useRef<MediaConnection | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Call timer
  useEffect(() => {
    if (callStatus !== 'connected') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStatus]);

  // Waveform animation loop
  useEffect(() => {
    if (callStatus !== 'connected') return;

    const interval = setInterval(() => {
      setWaveformBars(Array.from({ length: 24 }, () => Math.floor(Math.random() * 80) + 15));
    }, 200);

    return () => clearInterval(interval);
  }, [callStatus]);

  const hangUp = useCallback(async () => {
    if (activeCallRef.current) {
      activeCallRef.current.close();
      activeCallRef.current = null;
    }

    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => t.stop());
      activeStreamRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    setCallStatus('idle');
    setStatusMessage('Call disconnected.');
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      void hangUp();
    };
  }, [hangUp]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomAudioUrl(url);
    setCustomAudioName(file.name);
    setSelectedSource('custom');
  };

  const getAudioStream = async (): Promise<MediaStream> => {
    if (selectedSource === 'mic') {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    // Audio sample source -> MediaStreamDestination
    let audioSrc = '/samples/cloned_voice.wav';
    if (selectedSource === 'genuine') {
      audioSrc = '/samples/genuine_voice.wav';
    } else if (selectedSource === 'custom' && customAudioUrl) {
      audioSrc = customAudioUrl;
    }

    const audio = new Audio(audioSrc);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    audioElementRef.current = audio;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;

    const source = audioCtx.createMediaElementSource(audio);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioCtx.destination); // Play locally so caller hears it too

    await audio.play();
    return destination.stream;
  };

  const startCall = async () => {
    try {
      setCallStatus('initializing');
      setStatusMessage('Initializing WebRTC Peer connection...');
      setCallDuration(0);

      const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!cleanCode) {
        alert('Please enter a valid Room Code');
        setCallStatus('idle');
        return;
      }

      // 1. Get outgoing audio stream (Mic or bridged Sample Audio)
      const stream = await getAudioStream();
      activeStreamRef.current = stream;

      // 2. Initialize PeerJS client
      const { default: Peer } = await import('peerjs');
      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', () => {
        setCallStatus('dialing');
        const targetPeerId = `voiceguard-sih-room-${cleanCode}`;
        setStatusMessage(`Dialing Receiver at Room: ${cleanCode}...`);

        // 3. Dial the receiver's hosted room ID
        const call = peer.call(targetPeerId, stream);
        activeCallRef.current = call;

        if (!call) {
          setCallStatus('error');
          setStatusMessage('Could not initiate call. Please ensure Receiver screen is open.');
          return;
        }

        call.on('stream', () => {
          // Remote stream received if two-way
        });

        // Track when connection establishes
        setCallStatus('connected');
        setStatusMessage(`Live WebRTC Audio Streaming to Receiver (${cleanCode})`);

        call.on('close', () => {
          setCallStatus('ended');
          setStatusMessage('Call ended by Receiver.');
        });

        call.on('error', (err: unknown) => {
          const errMessage = err instanceof Error ? err.message : 'Connection lost';
          setCallStatus('error');
          setStatusMessage(`Call error: ${errMessage}`);
        });
      });

      peer.on('error', (err: unknown) => {
        const peerErr = err as { type?: string; message?: string };
        setCallStatus('error');
        setStatusMessage(`PeerJS error: ${peerErr?.type === 'peer-unavailable' ? 'Receiver not found. Make sure Receiver is open with room ' + cleanCode : peerErr?.message || 'Connection failed'}`);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Audio setup failed';
      setCallStatus('error');
      setStatusMessage(`Error: ${msg}`);
    }
  };

  const toggleMute = () => {
    if (activeStreamRef.current) {
      const audioTrack = activeStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] py-8 px-4 sm:px-6 lg:px-8 max-w-lg mx-auto flex flex-col justify-center">
      {/* Navigation sub-tabs */}
      <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-900 border border-slate-800 mb-6 text-xs">
        <Link
          href="/demo"
          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
        >
          Single Device
        </Link>
        <span className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm">
          📱 Caller (Phone)
        </span>
        <Link
          href="/demo/receiver"
          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white flex items-center gap-1"
        >
          <span>💻 Receiver</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
        <Link
          href="/monitor"
          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-emerald-300 flex items-center gap-1"
        >
          <span>🛡️ Monitor</span>
        </Link>
      </div>

      {/* Main Caller Card */}
      <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono mb-2">
            <Smartphone className="w-3.5 h-3.5" />
            <span>WebRTC Phone Caller</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            VoiceGuard Live Dialer
          </h1>
          <p className="text-xs text-slate-400">
            Streams live voice or simulated deepfake audio to the judge&apos;s laptop
          </p>
        </div>

        {/* Room Code Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Target Room Code:</span>
            <span className="text-[11px] text-slate-500 font-mono">Must match Receiver</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={roomCode}
              disabled={callStatus === 'connected' || callStatus === 'dialing'}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g. VG-9088"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-base font-bold text-cyan-300 tracking-wider focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <button
              onClick={() => setRoomCode(`VG-${Math.floor(1000 + Math.random() * 9000)}`)}
              disabled={callStatus === 'connected'}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Generate Random Code"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Audio Source Picker */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">
            Select Outgoing Voice Stream:
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setSelectedSource('cloned')}
              disabled={callStatus === 'connected'}
              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                selectedSource === 'cloned'
                  ? 'bg-red-950/40 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">AI-Cloned Deepfake Voice</div>
                  <div className="text-[10px] text-slate-400">Simulates high-risk synthetic vishing attack</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                DEEPFAKE
              </span>
            </button>

            <button
              onClick={() => setSelectedSource('mic')}
              disabled={callStatus === 'connected'}
              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                selectedSource === 'mic'
                  ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Mic className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Live Phone Microphone</div>
                  <div className="text-[10px] text-slate-400">Streams your natural voice via WebRTC</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                MIC
              </span>
            </button>

            <button
              onClick={() => setSelectedSource('genuine')}
              disabled={callStatus === 'connected'}
              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                selectedSource === 'genuine'
                  ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Genuine Human Customer Call</div>
                  <div className="text-[10px] text-slate-400">Pre-recorded authentic biological speech</div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                SAFE
              </span>
            </button>

            {/* Custom Upload Option */}
            <label className="cursor-pointer p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">
                  {customAudioName ? `File: ${customAudioName}` : 'Upload custom test audio...'}
                </span>
              </div>
              <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                Choose File
              </span>
            </label>
          </div>
        </div>

        {/* Live Audio Visualizer / Waveform */}
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Radio className={`w-3.5 h-3.5 ${callStatus === 'connected' ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
              Outgoing WebRTC Audio
            </span>
            <span>{callStatus === 'connected' ? `Duration: ${Math.floor(callDuration / 60).toString().padStart(2, '0')}:${(callDuration % 60).toString().padStart(2, '0')}` : 'Idle'}</span>
          </div>

          <div className="h-12 flex items-center justify-center gap-1 px-2">
            {waveformBars.map((height, i) => (
              <div
                key={i}
                className={`w-1.5 rounded-full transition-all duration-200 ${
                  callStatus === 'connected'
                    ? selectedSource === 'cloned'
                      ? 'bg-gradient-to-t from-red-600 to-red-400'
                      : 'bg-gradient-to-t from-cyan-600 to-cyan-400'
                    : 'bg-slate-800'
                }`}
                style={{
                  height: callStatus === 'connected' ? `${height}%` : '15%',
                  opacity: callStatus === 'connected' ? 0.9 : 0.3,
                }}
              />
            ))}
          </div>
        </div>

        {/* Status Message Text */}
        <div className="text-center text-xs font-mono text-slate-400 min-h-[20px]">
          {statusMessage}
        </div>

        {/* Primary Call / Hang Up Action Button */}
        <div className="flex items-center gap-3">
          {callStatus === 'connected' ? (
            <>
              <button
                onClick={toggleMute}
                className={`p-4 rounded-2xl font-semibold text-xs border transition-all ${
                  isMuted ? 'bg-amber-950 border-amber-800 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={hangUp}
                className="flex-1 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all"
              >
                <PhoneOff className="w-5 h-5" />
                <span>End Call</span>
              </button>
            </>
          ) : (
            <button
              onClick={startCall}
              disabled={callStatus === 'dialing' || callStatus === 'initializing'}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Phone className="w-5 h-5 fill-current" />
              <span>{callStatus === 'dialing' ? 'Dialing Receiver...' : `Call Receiver (${roomCode})`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
