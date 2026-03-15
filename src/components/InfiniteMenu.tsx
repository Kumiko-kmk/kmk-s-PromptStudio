import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface InfiniteMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  image?: string;
  subOptions?: string[];
}

interface InfiniteMenuProps {
  items: InfiniteMenuItem[];
  onSelect?: (item: InfiniteMenuItem, subOption?: string) => void;
  itemRadius?: number;
  gap?: number;
  className?: string;
}

type NodeType = 'A' | 'B';

interface GridNode {
  c: number;
  r: number;
  type: NodeType;
  x: number;
  y: number;
  item: InfiniteMenuItem;
}

interface PieSliceProps {
  centerAngle: number; 
  sliceAngle: number; 
  radius: number; 
  innerRadius: number; 
  label: string; 
  isHovered: boolean;
  isSelected: boolean;
  isAnySelected: boolean;
  nodeId: string;
}

// 扇形组件
const PieSlice: React.FC<PieSliceProps> = ({ 
  centerAngle, 
  sliceAngle, 
  radius, 
  innerRadius, 
  label, 
  isHovered, 
  isSelected,
  isAnySelected,
  nodeId
}) => {
  const startAngle = centerAngle - sliceAngle / 2;
  const endAngle = centerAngle + sliceAngle / 2;

  // SVG 路径计算
  const start = {
    x: Math.cos(startAngle) * radius,
    y: Math.sin(startAngle) * radius
  };
  const end = {
    x: Math.cos(endAngle) * radius,
    y: Math.sin(endAngle) * radius
  };
  const innerStart = {
    x: Math.cos(endAngle) * innerRadius,
    y: Math.sin(endAngle) * innerRadius
  };
  const innerEnd = {
    x: Math.cos(startAngle) * innerRadius,
    y: Math.sin(startAngle) * innerRadius
  };

  const largeArcFlag = sliceAngle <= Math.PI ? "0" : "1";

  const d = [
    "M", start.x, start.y, 
    "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y,
    "L", innerStart.x, innerStart.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 0, innerEnd.x, innerEnd.y,
    "Z"
  ].join(" ");

  // 文本路径计算 (沿着扇形中间的弧线)
  const textRadius = innerRadius + (radius - innerRadius) / 2;
  const textPathId = `text-path-${nodeId}-${label.replace(/\s+/g, '-')}`;
  
  // 文本路径总是从左到右，以确保文字正向可读
  let textPathD = "";
  const normalizedMid = ((centerAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const isBottomHalf = normalizedMid > 0 && normalizedMid < Math.PI;

  if (isBottomHalf) {
    // 下半圆：从右向左画弧，文字方向从左到右
    const p1 = { x: Math.cos(endAngle) * textRadius, y: Math.sin(endAngle) * textRadius };
    const p2 = { x: Math.cos(startAngle) * textRadius, y: Math.sin(startAngle) * textRadius };
    textPathD = `M ${p1.x} ${p1.y} A ${textRadius} ${textRadius} 0 0 0 ${p2.x} ${p2.y}`;
  } else {
    // 上半圆：从左向右画弧，文字方向从左到右
    const p1 = { x: Math.cos(startAngle) * textRadius, y: Math.sin(startAngle) * textRadius };
    const p2 = { x: Math.cos(endAngle) * textRadius, y: Math.sin(endAngle) * textRadius };
    textPathD = `M ${p1.x} ${p1.y} A ${textRadius} ${textRadius} 0 0 1 ${p2.x} ${p2.y}`;
  }

  return (
    <g className="pointer-events-none">
      <defs>
        <path id={textPathId} d={textPathD} />
      </defs>
      <motion.path 
        d={d} 
        fill={isHovered || isSelected ? "rgba(16, 185, 129, 0.8)" : "rgba(255, 255, 255, 0.1)"} 
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth="1"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ 
          opacity: isAnySelected ? 0 : 1, 
          scale: isAnySelected ? (isSelected ? 1.1 : 0.9) : 1,
          fill: isHovered || isSelected ? "rgba(16, 185, 129, 0.8)" : "rgba(255, 255, 255, 0.1)"
        }}
        exit={{ opacity: 0, scale: 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 400, 
          damping: 25,
          opacity: { duration: 0.3 }
        }}
        style={{ transformOrigin: "0px 0px" }}
      />
      {/* 闪光特效层 */}
      <motion.path
        d={d}
        fill="rgba(255, 255, 255, 0.5)"
        initial={{ opacity: 0 }}
        animate={{ opacity: isSelected ? [0, 0.8, 0] : 0 }}
        transition={{ duration: 0.4, times: [0, 0.2, 1] }}
        style={{ transformOrigin: "0px 0px" }}
      />
      <motion.text
        fill={isHovered || isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.7)"}
        fontSize="14"
        fontWeight="600"
        dominantBaseline="middle"
        initial={{ opacity: 0 }}
        animate={{ opacity: isAnySelected ? 0 : 1, fill: isHovered || isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.7)" }}
        transition={{ opacity: { duration: 0.2 } }}
      >
        <textPath href={`#${textPathId}`} startOffset="50%" textAnchor="middle">
          {label}
        </textPath>
      </motion.text>
    </g>
  );
};

export const InfiniteMenu: React.FC<InfiniteMenuProps> = ({
  items,
  onSelect,
  itemRadius = 40,
  gap = 12,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 摄像机/视野状态
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef(0);

  // 交互状态
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmedNode, setConfirmedNode] = useState<GridNode | null>(null);
  const [hoveredSubOption, setHoveredSubOption] = useState<string | null>(null);
  const [selectedSubOption, setSelectedSubOption] = useState<string | null>(null);
  const requestRef = useRef<number>(0);

  // 容器尺寸
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // 蜂巢网格几何计算 (120度夹角)
  const D = itemRadius * 2 + gap;
  const dx = D * (Math.sqrt(3) / 2);

  // 根据摄像机位置动态生成视野内的节点
  const visibleNodes = useMemo(() => {
    if (dimensions.width === 0 || items.length === 0) return [];

    const nodes: GridNode[] = [];
    const buffer = D * 2;
    
    const minX = camera.x - dimensions.width / 2 - buffer;
    const maxX = camera.x + dimensions.width / 2 + buffer;
    const minY = camera.y - dimensions.height / 2 - buffer;
    const maxY = camera.y + dimensions.height / 2 + buffer;

    const minR = Math.floor(minY / (1.5 * D)) - 1;
    const maxR = Math.ceil(maxY / (1.5 * D)) + 1;
    const minC = Math.floor(minX / (2 * dx)) - 1;
    const maxC = Math.ceil(maxX / (2 * dx)) + 1;

    // 完美的蜂巢网格 4-染色算法 (保证每个节点的3个邻居必定是另外3个完全不同的选项)
    const seq = [0, 3, 1, 2];
    const mod4 = (n: number) => ((n % 4) + 4) % 4;

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const xA = (2 * c + (Math.abs(r) % 2)) * dx;
        const yA = r * 1.5 * D;
        
        const xB = xA;
        const yB = yA - D;

        // 使用位运算 XOR 保证相邻节点颜色完全不同
        const colorA = (c & 1) ^ seq[mod4(r)];
        const colorB = colorA ^ 1;

        const indexA = colorA % items.length;
        const indexB = colorB % items.length;

        nodes.push(
          { c, r, type: 'A', x: xA, y: yA, item: items[indexA] },
          { c, r, type: 'B', x: xB, y: yB, item: items[indexB] }
        );
      }
    }
    return nodes;
  }, [camera, dimensions, D, dx, items]);

  // 动画循环：处理惯性拖动
  useEffect(() => {
    const animate = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;

      if (!isPanning && !confirmedNode && (Math.abs(velocityRef.current.x) > 0.1 || Math.abs(velocityRef.current.y) > 0.1)) {
        setCamera(prev => ({
          x: prev.x - velocityRef.current.x * (dt / 16),
          y: prev.y - velocityRef.current.y * (dt / 16)
        }));
        velocityRef.current.x *= 0.92;
        velocityRef.current.y *= 0.92;
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPanning, confirmedNode]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (confirmedNode) {
      // 如果已经有选中的节点，点击其他地方则取消选中
      setConfirmedNode(null);
      setHoveredSubOption(null);
      setSelectedSubOption(null);
      return;
    }

    setIsPanning(true);
    lastPanPos.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    velocityRef.current = { x: 0, y: 0 };
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPointerPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPointerPos({ x, y });

    if (isPanning && !confirmedNode) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      
      setCamera(prev => ({ x: prev.x - dx, y: prev.y - dy }));
      velocityRef.current = { x: dx, y: dy };
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    } else if (confirmedNode && confirmedNode.item.subOptions) {
      // 计算鼠标相对于选中节点中心的角度，以确定悬停在哪个扇形上
      const worldX = x - dimensions.width / 2 + camera.x;
      const worldY = y - dimensions.height / 2 + camera.y;
      
      const dx = worldX - confirmedNode.x;
      const dy = worldY - confirmedNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // 触发选择的内半径阈值 (死区)
      const innerRadius = itemRadius + 20;
      
      if (dist >= innerRadius && !selectedSubOption) {
        let angle = Math.atan2(dy, dx);
        
        const gapStep = (2 * Math.PI) / 3; // 120度间隔
        const baseOffset = confirmedNode.type === 'A' ? Math.PI / 2 : Math.PI / 6;
        
        // 寻找距离鼠标角度最近的扇形 (滑动选择)
        let minDiff = Infinity;
        let hovered = null;
        for (let i = 0; i < confirmedNode.item.subOptions.length; i++) {
          const centerAngle = baseOffset + i * gapStep;
          let diff = angle - centerAngle;
          diff = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))); // 归一化到 [0, PI]
          if (diff < minDiff) {
            minDiff = diff;
            hovered = confirmedNode.item.subOptions[i];
          }
        }
        
        if (hovered) {
          setHoveredSubOption(hovered);
          setSelectedSubOption(hovered);
          if (onSelect) onSelect(confirmedNode.item, hovered);
          
          // 延迟关闭菜单，等待闪光特效播放完毕
          setTimeout(() => {
            setConfirmedNode(null);
            setSelectedSubOption(null);
            setHoveredSubOption(null);
          }, 400);
        }
      } else if (dist < innerRadius && !selectedSubOption) {
        setHoveredSubOption(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    if (containerRef.current) {
      try {
        containerRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    // 检测是否为点击 (移动距离小于 5 像素)
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5 && containerRef.current && !confirmedNode) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const worldX = x - dimensions.width / 2 + camera.x;
      const worldY = y - dimensions.height / 2 + camera.y;
      
      let clickedNode: GridNode | null = null;
      let minDist = itemRadius;

      for (const node of visibleNodes) {
        const dist = Math.sqrt(Math.pow(node.x - worldX, 2) + Math.pow(node.y - worldY, 2));
        if (dist <= minDist) {
          minDist = dist;
          clickedNode = node;
        }
      }

      if (clickedNode) {
        setConfirmedNode(clickedNode);
        setHoveredSubOption(null);
        setSelectedSubOption(null);
        if (onSelect) onSelect(clickedNode.item);
      }
    }
    
    if (!confirmedNode) {
      setPointerPos(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden touch-none select-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        animate={{ scale: isPanning && !confirmedNode ? 0.96 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div 
          className="absolute inset-0"
          style={{ transform: `translate(${dimensions.width / 2 - camera.x}px, ${dimensions.height / 2 - camera.y}px)` }}
        >
          {/* 节点 */}
          {visibleNodes.map((node) => {
            const isConfirmed = confirmedNode?.c === node.c && confirmedNode?.r === node.r && confirmedNode?.type === node.type;
            
            return (
              <motion.div
                key={`${node.type}${node.c},${node.r}`}
                className="absolute z-10"
                style={{
                  width: itemRadius * 2,
                  height: itemRadius * 2,
                  left: node.x - itemRadius,
                  top: node.y - itemRadius,
                }}
                animate={{
                  scale: isConfirmed ? 1.15 : 1,
                  zIndex: isConfirmed ? 30 : 10,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                {/* 节点内容容器 */}
                <div 
                  className="w-full h-full rounded-full relative flex flex-col items-center justify-center bg-white shadow-md border border-slate-100 p-3"
                  style={{ backgroundColor: node.item.color || '#ffffff' }}
                >
                  {node.item.image ? (
                    <img 
                      src={node.item.image} 
                      alt={node.item.label} 
                      className="w-full h-full object-cover rounded-full pointer-events-none" 
                      referrerPolicy="no-referrer"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-700">
                      {node.item.icon && <div className="mb-1">{node.item.icon}</div>}
                    </div>
                  )}
                </div>

                {/* 子选项扇形环 */}
                <AnimatePresence>
                  {isConfirmed && node.item.subOptions && (
                    <motion.svg 
                      key="suboptions-ring"
                      className="absolute top-1/2 left-1/2 pointer-events-none"
                      style={{ 
                        width: 400, 
                        height: 400, 
                        transform: 'translate(-50%, -50%)' 
                      }}
                      viewBox="-200 -200 400 400"
                    >
                      {node.item.subOptions.map((subOpt, i) => {
                        const gapStep = (2 * Math.PI) / 3; // 120度间隔
                        
                        // 根据节点类型调整起始角度，使其对准相邻节点之间的空隙
                        // Type A 节点的邻居在 30°, 150°, 270° 方向，空隙在 90°, 210°, 330°
                        // Type B 节点的邻居在 90°, 210°, 330° 方向，空隙在 30°, 150°, 270°
                        const baseOffset = node.type === 'A' ? Math.PI / 2 : Math.PI / 6;
                        const centerAngle = baseOffset + i * gapStep;
                        
                        return (
                          <PieSlice
                            key={subOpt}
                            nodeId={`${node.type}-${node.c}-${node.r}`}
                            centerAngle={centerAngle}
                            sliceAngle={70 * Math.PI / 180} // 70度扇形，留出50度空隙
                            radius={itemRadius + 60}
                            innerRadius={itemRadius + 15}
                            label={subOpt}
                            isHovered={hoveredSubOption === subOpt}
                            isSelected={selectedSubOption === subOpt}
                            isAnySelected={selectedSubOption !== null}
                          />
                        );
                      })}
                    </motion.svg>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
