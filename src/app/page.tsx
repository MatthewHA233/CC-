"use client";

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Coffee, IceCream } from 'lucide-react';
import { debounce } from 'lodash';

const COLORS = ['#FF1461', '#18FF92', '#5A87FF', '#FBF38C'];
const SHAPES = ['circle', 'square', 'triangle'];

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

// 固定7行
const rows = 7;    
// 横竖屏下列数不同：横屏16列，竖屏9列
// 列数在resize时决定
let columns = 16;

const baseFreq = 130.81; // C3
const highlightDuration = 500; // 高亮动画持续时间ms

export default function AnimatedHomepage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundTimeRef = useRef(0);
  const cellHighlightsRef = useRef<CellHighlight[]>([]);
  const cellSizeRef = useRef<number>(150);

  // 使用ref来存储音符相关信息，避免lint警告
  const noteColsRef = useRef<number>(0);
  const noteRowsRef = useRef<number>(0);
  const totalNotesRef = useRef<number>(0);

  const scaleRef = useRef<number[]>([]);

  const orientationIsPortrait = useCallback(() => {
    return window.innerHeight > window.innerWidth;
  }, []);

  // 根据当前方向决定列数和音域参数
  const getLayoutParams = useCallback(() => {
    const isPortrait = orientationIsPortrait();
    const currentColumns = isPortrait ? 9 : 16;
    const noteCols = currentColumns - 2; // 去掉两侧鼓点列
    const noteRows = 5;  
    const totalNotes = noteRows * noteCols;
    return { currentColumns, noteCols, noteRows, totalNotes };
  }, [orientationIsPortrait]);

  const generateScale = useCallback((total: number) => {
    // 从C3开始，总共total个半音递增的音阶
    return Array.from({ length: total }, (_, i) => {
      return baseFreq * Math.pow(2, i / 12);
    });
  }, []);

  const updateLayoutAndScale = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    const { currentColumns, noteCols, noteRows, totalNotes } = getLayoutParams();
    columns = currentColumns;
    noteColsRef.current = noteCols;
    noteRowsRef.current = noteRows;
    totalNotesRef.current = totalNotes;

    scaleRef.current = generateScale(totalNotes);
  }, [getLayoutParams, generateScale]);

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

  const playDrum = useCallback((volume: number) => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('AudioContext not supported');
        return;
      }
      audioContextRef.current = new AudioContextClass();
    }

    const now = audioContextRef.current.currentTime;
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();

    // 简易鼓点
    osc.type = 'square';
    osc.frequency.setValueAtTime(60, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);

    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }, []);

  const handleInteractionLogic = useCallback((x: number, y: number, canvas: HTMLCanvasElement) => {
    cellSizeRef.current = canvas.height / rows;

    const cellX = Math.floor(x / cellSizeRef.current);
    const cellY = Math.floor(y / cellSizeRef.current);

    for (let i = 0; i < 3; i++) {
      shapesRef.current.push(createShape(x, y));
    }
    for (let i = 0; i < 2; i++) {
      particlesRef.current.push(createParticle(x, y));
    }

    const currentTime = Date.now();
    const volume = Math.max(0.1, 1 - (y / canvas.height)*0.9);

    // 最顶行(row=0)和最底行(row=6)静音
    if (cellY === 0 || cellY === rows - 1) return;

    // 左右列为鼓点
    if (cellX === 0 || cellX === columns - 1) {
      if (currentTime - lastSoundTimeRef.current > 100) {
        playDrum(volume);
        lastSoundTimeRef.current = currentTime;
      }
      return;
    }

    // 中间为音符区域：row=1~5, col=1~(columns-2)
    const noteColsDynamic = columns - 2; // 中间音符列数
    if (cellX >= 1 && cellX <= noteColsDynamic && cellY >= 1 && cellY <= 5) {
      const noteRow = cellY - 1; 
      const noteCol = cellX - 1; 
      const noteIndex = noteRow * noteColsDynamic + noteCol; 

      if (noteIndex < scaleRef.current.length) {
        const frequency = scaleRef.current[noteIndex];
        if (currentTime - lastSoundTimeRef.current > 100) {
          playSound(frequency, volume);
          lastSoundTimeRef.current = currentTime;
        }
        const cellIndex = cellY * columns + cellX;
        cellHighlightsRef.current[cellIndex] = {
          alpha: 1,
          scale: 1.2,
          time: currentTime
        };
      }
    }
  }, [createShape, createParticle, playSound, playDrum]);

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

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const gridWidth = cellSizeRef.current * columns;
    const gridHeight = cellSizeRef.current * rows;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 6;

    for (let yy = 0; yy <= gridHeight; yy += cellSizeRef.current) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(gridWidth, yy);
      ctx.stroke();
    }

    for (let xx = 0; xx <= gridWidth; xx += cellSizeRef.current) {
      ctx.beginPath();
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, gridHeight);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const drawCellHighlights = useCallback((ctx: CanvasRenderingContext2D) => {
    const totalCells = rows * columns;
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

      const cellX = i % columns;
      const cellY = Math.floor(i / columns);

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

    cellSizeRef.current = canvas.height / rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid(ctx);
    drawCellHighlights(ctx);

    shapesRef.current = shapesRef.current.filter((shape) => {
      shape.life -= 0.01;
      shape.alpha = Math.pow(shape.life, 2);
      shape.size += 0.2;
      shape.x += shape.vx;
      shape.y += shape.vy;
      drawShape(ctx, shape);
      return shape.life > 0;
    });

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
      updateLayoutAndScale(canvas);
    }

    animate();

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      updateLayoutAndScale(canvas);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [animate, updateLayoutAndScale]);

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
      
      {/* 主内容 */}
      <div className="relative z-10 flex flex-col md:flex-row h-full">
        <Link href="/cc-space.html" className="group relative flex-1 flex items-center justify-center bg-gradient-to-br from-blue-500/60 to-purple-600/60 transition-all duration-500 ease-in-out hover:flex-[1.5]">
          <div className="text-center">
            <Coffee className="mx-auto h-16 w-16 text-white mb-4 transition-transform duration-300 group-hover:scale-125" />
            <h2 className="text-4xl font-bold text-white mb-2">CC的小栈</h2>
            <p className="text-lg text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">点击进入CC的世界</p>
          </div>
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
        </Link>
        
        <a href="/Patatap-main/app.html" className="group relative flex-1 flex items-center justify-center bg-gradient-to-br from-pink-500/60 to-yellow-500/60 transition-all duration-500 ease-in-out hover:flex-[1.5]">
          <div className="text-center">
            <IceCream className="mx-auto h-16 w-16 text-white mb-4 transition-transform duration-300 group-hover:scale-125" />
            <h2 className="text-4xl font-bold text-white mb-2">汤圆的小栈</h2>
            <p className="text-lg text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">点击进入汤圆的世界</p>
          </div>
          <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
        </a>
      </div>
      
      {/* 底部备案信息 */}
      <div className="absolute bottom-4 w-full flex justify-center z-20">
        <a 
          href="https://beian.mps.gov.cn/#/query/webSearch?code=42090002002025" 
          rel="noreferrer" 
          target="_blank" 
          className="flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <Image src="/images/备案图标.png" alt="备案图标" width={16} height={16} className="mr-1" />
          鄂公网安备42090002002025
        </a>
      </div>
    </div>
  );
}
