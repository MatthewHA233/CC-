"use client";

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Coffee, IceCream } from 'lucide-react';
import { debounce } from 'lodash';

interface Shape {
  x: number;
  y: number;
  size: number;
  color: string;
  type: 'circle' | 'square' | 'triangle';
  alpha: number;
  vx: number;
  vy: number;
  life: number;
}

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

const COLORS = ['#FF1461', '#18FF92', '#5A87FF', '#FBF38C'];
const SHAPES = ['circle', 'square', 'triangle'];

export default function AnimatedHomepage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef(0);

  // 增大格子大小
  const cellSize = 150; 
  const baseFreq = 130.81; // C3 起点音高

  // 创建形状(最初版本的拖尾形状)
  const createShape = useCallback((x: number, y: number) => {
    return {
      x,
      y,
      size: Math.random() * 20 + 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      type: SHAPES[Math.floor(Math.random() * SHAPES.length)] as 'circle' | 'square' | 'triangle',
      alpha: 1,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      life: 1,
    };
  }, []);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.save();
    ctx.globalAlpha = shape.alpha;
    ctx.fillStyle = shape.color;
    
    switch (shape.type) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, shape.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'square':
        ctx.fillRect(shape.x - shape.size / 2, shape.y - shape.size / 2, shape.size, shape.size);
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y - shape.size / 2);
        ctx.lineTo(shape.x - shape.size / 2, shape.y + shape.size / 2);
        ctx.lineTo(shape.x + shape.size / 2, shape.y + shape.size / 2);
        ctx.closePath();
        ctx.fill();
        break;
    }
    ctx.restore();
  }, []);

  // 创建科幻粒子
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

  // 动态生成音阶
  const generateScale = useCallback((totalCells: number) => {
    const scale = Array.from({ length: totalCells }, (_, i) => {
      return baseFreq * Math.pow(2, i / 12);
    });
    return scale;
  }, [baseFreq]);

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
      oscillator.type = 'triangle'; 
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

        // 去掉底部3行的音域
        const effectiveRows = Math.max(0, rows - 3); 
        const totalCellsForNotes = columns * effectiveRows;
        const scale = generateScale(totalCellsForNotes);

        // 判断鼠标所在单元格
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);

        // 创建原有拖尾形状
        for (let i = 0; i < 3; i++) {
          shapesRef.current.push(createShape(x, y));
        }
        
        // 创建科幻粒子
        for (let i = 0; i < 3; i++) {
          particlesRef.current.push(createParticle(x, y));
        }

        const currentTime = Date.now();

        // 如果在有效音域（顶部行），才播放音
        if (cellY < effectiveRows && cellY >= 0 && cellX >= 0 && cellX < columns) {
          const cellIndex = cellY * columns + cellX;
          if (cellIndex < scale.length) {
            const frequency = scale[cellIndex];
            // 根据y位置计算音量，顶部约1.0，下方减弱到0.1以上
            const volume = Math.max(0.1, 1 - (y / canvas.height)*0.9);
            if (currentTime - lastSoundTimeRef.current > 100) {
              playSound(frequency, volume);
              lastSoundTimeRef.current = currentTime;
            }
          }
        }

      }, 16),
    [playSound, createShape, createParticle, generateScale]
  );

  const handleInteraction = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    debouncedInteractionHandler(event);
  }, [debouncedInteractionHandler]);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(255,255,255,0.7)";
    ctx.shadowBlur = 8;

    // 画水平线
    for (let y = 0; y <= height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 画垂直线
    for (let x = 0; x <= width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.restore();
  }, [cellSize]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 先绘制梦幻格子线框
    drawGrid(ctx, canvas.width, canvas.height);

    // 绘制并更新形状(拖尾效果)
    shapesRef.current = shapesRef.current.filter((shape) => {
      shape.life -= 0.01;
      shape.alpha = Math.pow(shape.life, 2);
      shape.size += 0.2;
      shape.x += shape.vx;
      shape.y += shape.vy;
      drawShape(ctx, shape);
      return shape.life > 0;
    });

    // 绘制并更新粒子(科幻粒子)
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

    // 限制数量
    const MAX_SHAPES = 100;
    if (shapesRef.current.length > MAX_SHAPES) {
      shapesRef.current = shapesRef.current.slice(-MAX_SHAPES);
    }

    const MAX_PARTICLES = 200;
    if (particlesRef.current.length > MAX_PARTICLES) {
      particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES);
    }
  }, [drawShape, drawParticle, drawGrid]);

  useEffect(() => {
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
