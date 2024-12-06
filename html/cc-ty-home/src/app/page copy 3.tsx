"use client";

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Coffee, IceCream } from 'lucide-react';
import { debounce } from 'lodash';

interface Particle {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
  life: number;
  angle: number;
}

export default function AnimatedHomepage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef(0);

  const cellSize = 100; // 每格约100px

  // 基准音高：C3 ~ 130.81 Hz
  const baseFreq = 130.81; 

  // 动态计算音阶函数：根据总单元格数量生成音阶
  const generateScale = useCallback((totalCells: number) => {
    // 半音递增：f(n) = baseFreq * 2^(n/12)
    const scale = Array.from({ length: totalCells }, (_, i) => {
      return baseFreq * Math.pow(2, i / 12);
    });
    return scale;
  }, []);

  const createParticle = useCallback((x: number, y: number) => {
    return {
      x,
      y,
      size: Math.random() * 20 + 10,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      alpha: 1,
      life: 1,
      angle: Math.random() * 360,
    };
  }, []);

  const drawParticle = useCallback((ctx: CanvasRenderingContext2D, p: Particle) => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.angle * Math.PI) / 180);
    // 创建径向渐变为科幻感粒子
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.5, "rgba(0,150,255,0.7)"); 
    gradient.addColorStop(1, "rgba(0,0,100,0)"); 
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    particlesRef.current = particlesRef.current.filter((p) => {
      p.life -= 0.02;
      p.alpha = Math.pow(p.life, 2);
      p.size += 0.2;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += 2;
      drawParticle(ctx, p);
      return p.life > 0;
    });
  
    const fps = 60;
    setTimeout(() => {
      requestAnimationFrame(animate);
    }, 1000 / fps);

    const MAX_PARTICLES = 200;
    if (particlesRef.current.length > MAX_PARTICLES) {
      particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES);
    }
  }, [drawParticle]);

  const playSound = useCallback((frequency: number, volume: number) => {
    try {
      if (!window.isSecureContext) {
        console.warn('AudioContext requires secure context (HTTPS)');
        return;
      }
  
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          console.warn('AudioContext not supported');
          return;
        }
        audioContextRef.current = new AudioContextClass();
      }
  
      const now = audioContextRef.current.currentTime;
      const oscillator = audioContextRef.current.createOscillator();
      oscillator.type = 'triangle'; // 使用三角波增加音色特征
      oscillator.frequency.setValueAtTime(frequency, now);
  
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 0.5);
  
      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
  
      oscillator.start(now);
      oscillator.stop(now + 0.5);
    } catch (error) {
      console.error('Error initializing audio:', error);
    }
  }, []);

  const debouncedInteractionHandler = useMemo(
    () =>
      debounce((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in event) ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
        const y = ('touches' in event) ? event.touches[0].clientY - rect.top : event.clientY - rect.top;

        const columns = Math.floor(canvas.width / cellSize);
        const rows = Math.floor(canvas.height / cellSize);
        const totalCells = columns * rows;
        
        const scale = generateScale(totalCells);

        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);

        if (cellX < 0 || cellX >= columns || cellY < 0 || cellY >= rows) {
          return;
        }

        const cellIndex = cellY * columns + cellX;
        
        // 根据y位置计算音量：顶部y=0时volume=1，底部y=canvas.height时volume=0.1
        const volume = 1 - (y / canvas.height) * 0.9; 
        const finalVolume = Math.max(0.1, volume);

        for (let i = 0; i < 5; i++) {
          const p = createParticle(x, y);
          particlesRef.current.push(p);
        }

        const currentTime = Date.now();
        if (currentTime - lastSoundTimeRef.current > 100) {
          const frequency = scale[cellIndex];
          playSound(frequency, finalVolume); 
          lastSoundTimeRef.current = currentTime;
        }

      }, 16),
    [playSound, createParticle, generateScale]
  );

  const handleInteraction = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    debouncedInteractionHandler(event);
  }, [debouncedInteractionHandler]);

  useEffect(() => {
    console.log('Animation started');
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }

    animate();

    const handleResize = () => {
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [animate]);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error('Runtime error:', error);
    };

    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <div className="relative h-screen overflow-hidden" onMouseMove={handleInteraction} onTouchMove={handleInteraction}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0" />

      <div className="relative z-10 flex flex-col md:flex-row h-full">
        <Link href="/cc-space.html" className="group relative flex-1 flex items-center justify-center bg-gradient-to-br from-blue-500/60 to-purple-600/60 transition-all duration-500 ease-in-out hover:flex-[1.5]">
          <div className="text-center">
            <Coffee className="mx-auto h-16 w-16 text-white mb-4 transition-transform duration-300 group-hover:scale-125" />
            <h2 className="text-4xl font-bold text-white mb-2">CC的小栈</h2>
            <p className="text-lg text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">点击进入CC的世界</p>
          </div>
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
        </Link>
        
        <Link href="/tangyuan-space" className="group relative flex-1 flex items-center justify-center bg-gradient-to-br from-pink-500/60 to-yellow-500/60 transition-all duration-500 ease-in-out hover:flex-[1.5]">
          <div className="text-center">
            <IceCream className="mx-auto h-16 w-16 text-white mb-4 transition-transform duration-300 group-hover:scale-125" />
            <h2 className="text-4xl font-bold text-white mb-2">汤圆的小栈</h2>
            <p className="text-lg text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">点击进入汤圆的世界</p>
          </div>
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
        </Link>
      </div>
    </div>
  );
}
