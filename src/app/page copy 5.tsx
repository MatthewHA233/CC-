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

interface CellHighlight {
  alpha: number;  
  scale: number;  
  time: number;   
}

const COLORS = ['#FF1461', '#18FF92', '#5A87FF', '#FBF38C'];
const SHAPES = ['circle', 'square', 'triangle'];
const rows = 8; // 固定行数让格子填满垂直方向
const baseFreq = 130.81; // C3
const highlightDuration = 500; // 高亮动画持续时间ms

export default function AnimatedHomepage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef(0);
  const cellHighlightsRef = useRef<CellHighlight[]>([]);

  // 使用ref存储columns和cellSize，使得在回调中修改不会触发lint警告
  const cellSizeRef = useRef<number>(150);
  const columnsRef = useRef<number>(0);

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

  const createParticle = useCallback((x: number, y: number) => {
    // 粒子更小，更加稀疏，水平发散
    const size = Math.random() * 3 + 5; 
    return {
      x,
      y,
      size,
      vx: (Math.random() - 0.5) * 4, 
      vy: (Math.random() - 0.5) * 0.5,
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
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.5, "rgba(0,150,255,0.4)"); 
    gradient.addColorStop(1, "rgba(0,0,100,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, []);

  const generateScale = useCallback((totalCells: number) => {
    const scale = Array.from({ length: totalCells }, (_, i) => {
      return baseFreq * Math.pow(2, i / 12);
    });
    return scale;
  }, []);

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

  const handleInteractionLogic = useCallback((x: number, y: number, canvas: HTMLCanvasElement) => {
    // 在每次交互时，根据当前窗口重新计算cellSize和columns
    cellSizeRef.current = canvas.height / rows;
    columnsRef.current = Math.floor(canvas.width / cellSizeRef.current);

    const totalCells = rows * columnsRef.current;
    const scale = generateScale(totalCells);

    const cellX = Math.floor(x / cellSizeRef.current);
    const cellY = Math.floor(y / cellSizeRef.current);

    // 创建拖尾形状
    for (let i = 0; i < 3; i++) {
      shapesRef.current.push(createShape(x, y));
    }

    // 创建粒子
    for (let i = 0; i < 2; i++) {
      particlesRef.current.push(createParticle(x, y));
    }

    // 播放音符
    if (cellX >= 0 && cellX < columnsRef.current && cellY >= 0 && cellY < rows) {
      const cellIndex = cellY * columnsRef.current + cellX;
      if (cellIndex < scale.length) {
        const frequency = scale[cellIndex];
        const volume = Math.max(0.1, 1 - (y / canvas.height)*0.9);
        const currentTime = Date.now();
        if (currentTime - lastSoundTimeRef.current > 100) {
          playSound(frequency, volume);
          lastSoundTimeRef.current = currentTime;
        }
        // 高亮动画
        cellHighlightsRef.current[cellIndex] = {
          alpha: 1,
          scale: 1.2,
          time: currentTime
        };
      }
    }
  }, [createShape, createParticle, generateScale, playSound]);

  const debouncedInteractionHandler = useMemo(
    () =>
      debounce((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = ('touches' in event) ? event.touches[0].clientX - rect.left : event.clientX - rect.left;
        const y = ('touches' in event) ? event.touches[0].clientY - rect.top : event.clientY - rect.top;

        handleInteractionLogic(x, y, canvas);
      }, 16),
    [handleInteractionLogic]
  );

  const handleInteraction = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    debouncedInteractionHandler(event);
  }, [debouncedInteractionHandler]);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 6;

    for (let y = 0; y <= height; y += cellSizeRef.current) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let x = 0; x <= width; x += cellSizeRef.current) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const drawCellHighlights = useCallback((ctx: CanvasRenderingContext2D) => {
    const totalCells = rows * columnsRef.current;
    if (cellHighlightsRef.current.length !== totalCells) {
      cellHighlightsRef.current.length = totalCells;
    }

    const now = Date.now();
    for (let i = 0; i < totalCells; i++) {
      const ch = cellHighlightsRef.current[i];
      if (!ch || ch.alpha <= 0) continue;

      const elapsed = now - ch.time;
      const progress = elapsed / highlightDuration;
      if (progress > 1) {
        ch.alpha = 0;
        continue;
      }
      const alpha = 1 - progress;
      const scale = 1 + (0.2 * (1 - progress));

      const cellX = i % columnsRef.current;
      const cellY = Math.floor(i / columnsRef.current);

      const cellCenterX = cellX * cellSizeRef.current + cellSizeRef.current / 2;
      const cellCenterY = cellY * cellSizeRef.current + cellSizeRef.current / 2;

      ctx.save();
      ctx.translate(cellCenterX, cellCenterY);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.rect(-cellSizeRef.current / 2 + 5, -cellSizeRef.current / 2 + 5, cellSizeRef.current - 10, cellSizeRef.current - 10);
      ctx.fill();
      ctx.restore();

      ch.alpha = alpha;
      ch.scale = scale;
    }
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 每帧根据当前窗口计算cellSize和columns
    cellSizeRef.current = canvas.height / rows;
    columnsRef.current = Math.floor(canvas.width / cellSizeRef.current);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx, canvas.width, canvas.height);
    drawCellHighlights(ctx);

    // 更新形状(拖尾)
    shapesRef.current = shapesRef.current.filter((shape) => {
      shape.life -= 0.01;
      shape.alpha = Math.pow(shape.life, 2);
      shape.size += 0.2;
      shape.x += shape.vx;
      shape.y += shape.vy;
      drawShape(ctx, shape);
      return shape.life > 0;
    });

    // 更新粒子
    particlesRef.current = particlesRef.current.filter((p) => {
      p.life -= 0.02;
      p.alpha = Math.pow(p.life, 2);
      p.size += 0.05;
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

    const MAX_SHAPES = 100;
    if (shapesRef.current.length > MAX_SHAPES) {
      shapesRef.current = shapesRef.current.slice(-MAX_SHAPES);
    }

    const MAX_PARTICLES = 100;
    if (particlesRef.current.length > MAX_PARTICLES) {
      particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES);
    }
  }, [drawShape, drawParticle, drawGrid, drawCellHighlights]);

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
      const canvas = canvasRef.current;
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
