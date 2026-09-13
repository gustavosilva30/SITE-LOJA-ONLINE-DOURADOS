import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { 
  X, 
  ArrowUpRight, 
  Circle, 
  Type as TextT, 
  Save as FloppyDisk, 
  Trash,
  MousePointer2 as Cursor
} from 'lucide-react';
import { Button } from './ui/button';

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onSave: (base64: string) => void;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({ 
  isOpen, 
  onClose, 
  imageUrl, 
  onSave 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [tool, setTool] = useState<'pointer' | 'arrow' | 'circle' | 'text'>('pointer');

  useEffect(() => {
    if (isOpen && canvasRef.current && !canvas) {
      const newCanvas = new fabric.Canvas(canvasRef.current, {
        width: 800,
        height: 600,
        backgroundColor: '#f3f4f6'
      });

      fabric.Image.fromURL(imageUrl, (img) => {
        // Redimensiona imagem para caber no canvas mantendo proporção
        const ratio = Math.min(800 / (img.width || 1), 600 / (img.height || 1));
        img.scale(ratio);
        newCanvas.add(img);
        newCanvas.centerObject(img);
        img.selectable = false;
        newCanvas.renderAll();
      }, { crossOrigin: 'anonymous' });

      setCanvas(newCanvas);
    }

    return () => {
      if (canvas) {
        canvas.dispose();
        setCanvas(null);
      }
    };
  }, [isOpen, imageUrl]);

  const addArrow = () => {
    if (!canvas) return;
    const arrow = new fabric.Path('M 0 0 L 50 50 M 50 50 L 40 50 M 50 50 L 50 40', {
      stroke: 'red',
      strokeWidth: 4,
      fill: '',
      left: 100,
      top: 100
    });
    canvas.add(arrow);
    canvas.setActiveObject(arrow);
  };

  const addCircle = () => {
    if (!canvas) return;
    const circle = new fabric.Circle({
      radius: 40,
      stroke: 'red',
      strokeWidth: 4,
      fill: 'transparent',
      left: 150,
      top: 150
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
  };

  const addText = () => {
    if (!canvas) return;
    const text = new fabric.IText('Texto aqui', {
      left: 200,
      top: 200,
      fontSize: 24,
      fill: 'red',
      fontWeight: 'bold'
    });
    canvas.add(text);
    canvas.setActiveObject(text);
  };

  const deleteSelected = () => {
    if (!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    canvas.discardActiveObject();
    canvas.remove(...activeObjects);
  };

  const handleSave = () => {
    if (!canvas) return;
    const base64 = canvas.toDataURL({
      format: 'png',
      quality: 0.8
    });
    onSave(base64);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-w-5xl w-full max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
              <ArrowUpRight size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">Editor de Evidências</h2>
              <p className="text-xs text-slate-500 font-medium">Aponte detalhes na peça antes de enviar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 p-4 bg-slate-100 border-b overflow-x-auto">
          <Button 
            variant={tool === 'pointer' ? 'default' : 'outline'} 
            onClick={() => setTool('pointer')}
            className="rounded-xl gap-2"
          >
            <Cursor size={20} /> Selecionar
          </Button>
          <Button variant="outline" onClick={addArrow} className="rounded-xl gap-2 text-red-600 border-red-200 hover:bg-red-50">
            <ArrowUpRight size={20} /> Seta
          </Button>
          <Button variant="outline" onClick={addCircle} className="rounded-xl gap-2 text-red-600 border-red-200 hover:bg-red-50">
            <Circle size={20} /> Círculo
          </Button>
          <Button variant="outline" onClick={addText} className="rounded-xl gap-2">
            <TextT size={20} /> Texto
          </Button>
          <div className="h-8 w-px bg-slate-300 mx-2" />
          <Button variant="ghost" onClick={deleteSelected} className="rounded-xl text-rose-500 hover:bg-rose-50">
            <Trash size={20} /> Remover
          </Button>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-200 overflow-auto">
          <div className="shadow-2xl rounded-lg overflow-hidden bg-white">
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="h-12 px-8 font-bold">Cancelar</Button>
          <Button onClick={handleSave} className="h-12 px-10 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl gap-2 shadow-lg shadow-emerald-100">
            <FloppyDisk size={20} /> Salvar e Enviar
          </Button>
        </div>
      </div>
    </div>
  );
};
