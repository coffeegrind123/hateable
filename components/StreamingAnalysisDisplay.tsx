import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StreamingAnalysisDisplayProps {
  analysisLines: string[];
  isActive: boolean;
  title?: string;
}

export default function StreamingAnalysisDisplay({ 
  analysisLines, 
  isActive, 
  title = "Analyzing website..." 
}: StreamingAnalysisDisplayProps) {
  const [displayLines, setDisplayLines] = useState<Array<{ id: string; text: string; timestamp: number }>>([]);
  const maxLines = 5;

  useEffect(() => {
    if (analysisLines.length === 0) {
      setDisplayLines([]);
      return;
    }

    const newLine = analysisLines[analysisLines.length - 1];
    if (!newLine || newLine.trim() === '') return;

    const lineId = `line-${Date.now()}-${Math.random()}`;
    const newDisplayLine = {
      id: lineId,
      text: newLine.trim(),
      timestamp: Date.now()
    };

    setDisplayLines(prev => {
      const updated = [...prev, newDisplayLine];
      // Keep only the last maxLines entries
      return updated.slice(-maxLines);
    });
  }, [analysisLines]);

  if (!isActive && displayLines.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-900 border-2 border-blue-500 rounded-lg p-6 mb-6">
      <div className="flex items-center mb-4">
        <div className="flex space-x-1 mr-3">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
        <h3 className="text-lg font-semibold text-blue-400">{title}</h3>
      </div>
      
      <div className="space-y-2 min-h-[120px] relative">
        <AnimatePresence mode="popLayout">
          {displayLines.map((line, index) => {
            const opacity = Math.max(0.3, (index + 1) / displayLines.length);
            const isNewest = index === displayLines.length - 1;
            
            return (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ 
                  opacity: opacity, 
                  y: 0, 
                  scale: 1,
                  filter: isNewest ? 'brightness(1.2)' : 'brightness(1)'
                }}
                exit={{ 
                  opacity: 0, 
                  y: -20, 
                  scale: 0.95,
                  transition: { duration: 0.3 }
                }}
                transition={{ 
                  duration: 0.5,
                  ease: "easeOut"
                }}
                className={`
                  text-gray-300 font-mono text-sm leading-relaxed
                  ${isNewest ? 'text-white font-medium' : ''}
                `}
                style={{
                  textShadow: isNewest ? '0 0 10px rgba(96, 165, 250, 0.3)' : 'none'
                }}
              >
                <span className="text-blue-400 mr-2">▶</span>
                {line.text}
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {isActive && (
          <motion.div
            className="flex items-center text-blue-400 font-mono text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="mr-2">▶</span>
            <span className="animate-pulse">Thinking...</span>
            <motion.span
              className="inline-block w-2 h-4 bg-blue-400 ml-1"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </div>
      
      {/* Gradient fade effect at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none rounded-b-lg"></div>
    </div>
  );
}