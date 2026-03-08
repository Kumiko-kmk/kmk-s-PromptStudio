import React, { useRef, useState } from 'react';
import GlassSurface from './GlassSurface';
import './GooeyNav.css';

interface GooeyNavItem {
  label: string;
  href: string;
}

export interface GooeyNavProps {
  items: GooeyNavItem[];
  animationTime?: number;
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  timeVariance?: number;
  particleColors?: string[];
  initialActiveIndex?: number;
  onChange?: (index: number) => void;
}

const GooeyNav: React.FC<GooeyNavProps> = ({
  items,
  animationTime = 600,
  particleCount = 15,
  particleDistances = [90, 10],
  particleR = 100,
  timeVariance = 300,
  particleColors = ['#7f7fcc', '#a87fcc', '#7fa8cc', '#cc7f7f'],
  initialActiveIndex = -1,
  onChange
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(initialActiveIndex);
  const particlesContainerRef = useRef<HTMLDivElement>(null);

  const noise = (n = 1) => n / 2 - Math.random() * n;

  const getXY = (distance: number, pointIndex: number, totalPoints: number): [number, number] => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };

  const createParticle = (i: number, t: number, d: [number, number], r: number, rect: DOMRect) => {
    let rotate = noise(r / 10);
    const start = getXY(d[0], particleCount - i, particleCount);
    
    // End position within the button's bounds to create a sticky blob
    const endX = (Math.random() - 0.5) * rect.width * 0.7;
    const endY = (Math.random() - 0.5) * rect.height * 0.7;

    const startColor = particleColors[Math.floor(Math.random() * particleColors.length)];
    const endColor = particleColors[Math.floor(Math.random() * particleColors.length)];

    return {
      start,
      end: [endX, endY],
      time: t,
      scale: 1 + noise(0.2),
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
      startColor,
      endColor
    };
  };

  const makeParticles = (rect: DOMRect) => {
    if (!particlesContainerRef.current) return;
    const container = particlesContainerRef.current;
    
    const d: [number, number] = particleDistances as [number, number];
    const r = particleR;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 2 + noise(timeVariance * 2);
      const p = createParticle(i, t, d, r, rect);

      setTimeout(() => {
        const particle = document.createElement('span');
        const point = document.createElement('span');
        particle.classList.add('particle');
        
        particle.style.left = `${centerX}px`;
        particle.style.top = `${centerY}px`;
        
        particle.style.setProperty('--start-x', `${p.start[0]}px`);
        particle.style.setProperty('--start-y', `${p.start[1]}px`);
        particle.style.setProperty('--end-x', `${p.end[0]}px`);
        particle.style.setProperty('--end-y', `${p.end[1]}px`);
        particle.style.setProperty('--time', `${p.time}ms`);
        particle.style.setProperty('--scale', `${p.scale}`);
        particle.style.setProperty('--start-color', p.startColor);
        particle.style.setProperty('--end-color', p.endColor);
        particle.style.setProperty('--rotate', `${p.rotate}deg`);

        point.classList.add('point');
        particle.appendChild(point);
        container.appendChild(particle);

        setTimeout(() => {
          try {
            container.removeChild(particle);
          } catch {
            // Do nothing
          }
        }, t);
      }, 30);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, index: number) => {
    e.preventDefault();
    const liEl = e.currentTarget.closest('li');
    if (!liEl) return;

    const newIndex = activeIndex === index ? -1 : index;
    setActiveIndex(newIndex);
    if (onChange) {
      onChange(newIndex);
    }

    if (newIndex !== -1) {
      const rect = liEl.getBoundingClientRect();
      makeParticles(rect);
    }
  };

  return (
    <>
      <nav className="w-full">
        <ul className="flex w-full justify-between gap-4">
          {items.map((item, index) => (
            <li key={index} className="flex-1">
              <GlassSurface
                width="100%"
                height={48}
                borderRadius={24}
                className={`transition-all duration-300 ${activeIndex === index ? 'ring-2 ring-white/50' : ''}`}
              >
                <a 
                  href={item.href} 
                  onClick={e => handleClick(e, index)} 
                  className="w-full h-full flex items-center justify-center text-white font-medium outline-none"
                >
                  {item.label}
                </a>
              </GlassSurface>
            </li>
          ))}
        </ul>
      </nav>
      
      <div 
        ref={particlesContainerRef} 
        className="fixed inset-0 pointer-events-none z-50 gooey-particles-container"
      >
        <svg width="0" height="0" className="absolute">
          <defs>
            <filter id="gooey-filter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>
        </svg>
      </div>
    </>
  );
};

export default GooeyNav;
