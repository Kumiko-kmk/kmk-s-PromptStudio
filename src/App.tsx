import React, { useState, useRef, useEffect } from 'react';
import Iridescence from './components/Iridescence';
import GlassSurface from './components/GlassSurface';
import { Send, Settings, Box, Sliders, Trash2, ChevronRight, Key, Palette, Eye, EyeOff } from 'lucide-react';
import { createChatSession } from './services/geminiService';
import { ModelType, MODEL_MODES } from './types';
import { InfiniteMenu, InfiniteMenuItem } from './components/InfiniteMenu';
import manusImg from './manus.png';
import grokImg from './gork.png';
import geminiImg from './gemini.jpg';
import gptImg from './gpt.png';

const modelsData = Object.keys(MODEL_MODES).map((key) => ({
  id: key as ModelType,
  name: key,
  subOptions: MODEL_MODES[key as ModelType],
}));

const infiniteMenuItems: InfiniteMenuItem[] = [
  {
    id: 'ChatGPT',
    label: 'ChatGPT',
    image: gptImg,
    subOptions: MODEL_MODES['ChatGPT'],
  },
  {
    id: 'Gemini',
    label: 'Gemini',
    image: geminiImg,
    subOptions: MODEL_MODES['Gemini'],
  },
  {
    id: 'Grok',
    label: 'Grok',
    image: grokImg,
    subOptions: MODEL_MODES['Grok'],
  },
  {
    id: 'Manus',
    label: 'Manus',
    image: manusImg,
    subOptions: MODEL_MODES['Manus'],
  },
];

const themes = [
  { id: 'purple', name: '梦幻紫', color: [0.5, 0.5, 0.8] as [number, number, number] },
  { id:'teal',   name:'碧海青',  color:[0.18,0.72,0.72] as [number, number, number] },
 { id:'coral',  name:'珊瑚橙',  color:[1.0,0.48,0.35] as [number, number, number] },
 { id:'jade',   name:'翡翠绿',  color:[0.18,0.80,0.44] as [number, number, number] },
 { id:'amber',  name:'琥珀黄',  color:[1.0,0.78,0.34] as [number, number, number] },
 { id:'indigo', name:'深靛蓝',  color:[0.23,0.24,0.76] as [number, number, number] },
];

export default function App() {
  const [message, setMessage] = useState('');
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // Chat State
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const chatSessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Settings State
  const [apiKey, setApiKey] = useState('');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDeepseekApiKey, setShowDeepseekApiKey] = useState(false);
  const [activeTheme, setActiveTheme] = useState(themes[0]);

  // Parameters State
  const [temperature, setTemperature] = useState(1.0);
  const [detailLevel, setDetailLevel] = useState(3);
  const [followUpIntensity, setFollowUpIntensity] = useState(3);

  // Models State
  const [selectedModel, setSelectedModel] = useState<ModelType>('ChatGPT');
  const [selectedSubModel, setSelectedSubModel] = useState(MODEL_MODES['ChatGPT'][0]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSendMessage = async () => {
    if (!message.trim() || isGenerating) return;

    const userMsg = message;
    setMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsGenerating(true);

    try {
      if (!chatSessionRef.current) {
        chatSessionRef.current = createChatSession(
          apiKey,
          deepseekApiKey,
          selectedModel,
          selectedSubModel,
          temperature,
          followUpIntensity,
          detailLevel
        );
      }

      const response = await chatSessionRef.current.sendMessageStream({ message: userMsg });
      
      setChatHistory(prev => [...prev, { role: 'ai', content: '' }]);
      
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          setChatHistory(prev => {
            const newHistory = [...prev];
            const lastIndex = newHistory.length - 1;
            newHistory[lastIndex] = {
              ...newHistory[lastIndex],
              content: newHistory[lastIndex].content + text
            };
            return newHistory;
          });
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatHistory(prev => [...prev, { role: 'ai', content: 'Error: ' + (error as Error).message }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleButtonClick = (panelId: string) => {
    if (panelId === 'clear') {
      setMessage('');
      setChatHistory([]);
      chatSessionRef.current = null;
      return;
    }
    setActivePanel(activePanel === panelId ? null : panelId);
  };

  const handlePanelMouseLeave = () => {
    setActivePanel(null);
  };

  const navItems = [
    { id: 'settings', label: '设置', icon: Settings },
    { id: 'model', label: '模型', icon: Box },
    { id: 'parameters', label: '参数', icon: Sliders },
    { id: 'clear', label: '清空', icon: Trash2 },
  ];

  const renderPanelContent = (panelId: string) => {
    switch (panelId) {
      case 'parameters':
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-white/90">Temperature</label>
                <span className="text-xs text-white/60 font-mono bg-black/20 px-2 py-0.5 rounded">{temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-white/90">细节追究</label>
                <span className="text-xs text-white/60 font-mono bg-black/20 px-2 py-0.5 rounded">{detailLevel}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={detailLevel}
                onChange={(e) => setDetailLevel(parseInt(e.target.value))}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <div className="flex justify-between text-[10px] text-white/40 px-1 font-mono">
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-white/90">追问力度</label>
                <span className="text-xs text-white/60 font-mono bg-black/20 px-2 py-0.5 rounded">{followUpIntensity}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={followUpIntensity}
                onChange={(e) => setFollowUpIntensity(parseInt(e.target.value))}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <div className="flex justify-between text-[10px] text-white/40 px-1 font-mono">
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
              </div>
            </div>
          </div>
        );
      case 'model':
        return (
          <div className="w-full h-[320px] relative">
            <InfiniteMenu 
              items={infiniteMenuItems}
              onSelect={(item, subOption) => {
                setSelectedModel(item.id as ModelType);
                if (subOption) {
                  setSelectedSubModel(subOption);
                }
              }}
            />
            {/* Display current selection */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center pointer-events-none">
              <div className="bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 shadow-sm">
                <span className="text-xs text-white/60">当前模型:</span>
                <span className="text-sm font-medium text-white">{selectedModel}</span>
              </div>
              <div className="bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 shadow-sm">
                <span className="text-xs text-white/60">当前模式:</span>
                <span className="text-sm font-medium text-emerald-400">{selectedSubModel}</span>
              </div>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-6">
            {/* API Key Input */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-white/90">
                <Key className="w-4 h-4 text-white/60" />
                Gemini API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入您的 Gemini API Key..."
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-white/90">
                <Key className="w-4 h-4 text-white/60" />
                DeepSeek API Key
              </label>
              <div className="relative">
                <input
                  type={showDeepseekApiKey ? "text" : "password"}
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  placeholder="输入您的 DeepSeek API Key..."
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekApiKey(!showDeepseekApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                >
                  {showDeepseekApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Theme Selector */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-white/90">
                <Palette className="w-4 h-4 text-white/60" />
                背景配色
              </label>
              <div className="flex flex-row gap-2">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setActiveTheme(theme)}
                    className={`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all border ${
                      activeTheme.id === theme.id
                        ? 'bg-white/10 border-white/30 text-white shadow-sm'
                        : 'bg-transparent border-transparent text-white/60 hover:bg-white/5 hover:text-white/90'
                    }`}
                  >
                    <div 
                      className="w-3 h-3 rounded-full shadow-inner border border-white/20 shrink-0"
                      style={{ backgroundColor: `rgb(${theme.color[0]*255}, ${theme.color[1]*255}, ${theme.color[2]*255})` }}
                    />
                    <span className="text-xs font-medium whitespace-nowrap">{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0">
        <Iridescence
          color={activeTheme.color}
          speed={0.8}
          amplitude={0.1}
          mouseReact={true}
        />
      </div>

      {/* Top Navigation */}
      <div className="absolute top-8 inset-x-0 z-20 w-full px-4 md:px-12 lg:px-24">
        <div className="relative flex justify-between items-start gap-4 w-full">
          {navItems.map((item) => (
            <div key={item.id} className="flex-1 flex flex-col">
              <button 
                onClick={() => handleButtonClick(item.id)}
                className="w-full outline-none"
              >
                <GlassSurface 
                  width="100%" 
                  height={44} 
                  borderRadius={22} 
                  className="transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-center gap-2 text-white/90 font-medium text-sm">
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                </GlassSurface>
              </button>

              {/* Dropdown Panel */}
              {item.id !== 'clear' && (
                <div 
                  className={`absolute top-full left-0 mt-4 w-full bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-400 ease-out origin-top ${
                    activePanel === item.id 
                      ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
                      : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                  }`}
                  onMouseLeave={handlePanelMouseLeave}
                >
                  <div className={item.id === 'model' ? "p-0" : "p-5"}>
                    {renderPanelContent(item.id)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="absolute top-28 bottom-28 inset-x-0 w-full px-4 md:px-12 lg:px-24 z-10 pointer-events-none">
        <div 
          ref={scrollRef}
          className="w-full h-full overflow-y-auto pb-4 flex flex-col gap-6 pointer-events-auto no-scrollbar"
        >
          {/* Invisible spacer to push content down initially if needed, or just padding */}
          <div className="h-4 shrink-0" />
          
          {chatHistory.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-white/30 text-2xl font-semibold blur-[0.5px] drop-shadow-lg" style={{ textShadow: '0 4px 24px rgba(255,255,255,0.2)' }}>
              工        欲        善        其        事
            </div>
          ) : (
            chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  <GlassSurface
                    width="auto"
                    height="auto"
                    borderRadius={24}
                    className="p-5"
                  >
                    <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </GlassSurface>
                </div>
              </div>
            ))
          )}
          {isGenerating && chatHistory[chatHistory.length - 1]?.role === 'user' && (
            <div className="flex w-full justify-start">
              <div className="max-w-[80%]">
                <GlassSurface
                  width="auto"
                  height="auto"
                  borderRadius={24}
                  className="p-5"
                >
                  <div className="text-white/60 text-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </GlassSurface>
              </div>
            </div>
          )}
          <div className="h-4 shrink-0" />
        </div>
      </div>

      {/* Chat Input */}
      <div className="absolute bottom-8 inset-x-0 z-20 w-full px-4 md:px-12 lg:px-24">
        <GlassSurface
          width="100%"
          height={64}
          borderRadius={32}
          className="shadow-2xl"
        >
          <div className="flex items-center w-full h-full px-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder="Type your idea..."
              className="flex-1 h-full bg-transparent border-none outline-none text-white placeholder:text-white/50 px-4 text-lg"
            />
            <button 
              onClick={handleSendMessage}
              disabled={isGenerating || !message.trim()}
              className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors text-white ${isGenerating || !message.trim() ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}
