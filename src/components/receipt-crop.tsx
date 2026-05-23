import { useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button } from "@/components/ui/button";
import { Scissors, RefreshCw, SkipForward } from "lucide-react";

type Props = {
  src: string;
  onCancel: () => void;
  onConfirm: (pixelCrop: PixelCrop | null, imageEl: HTMLImageElement) => void;
};

export function ReceiptCrop({ src, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-2">
        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setCompleted(c)}
          keepSelection
          ruleOfThirds
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            ref={imgRef}
            src={src}
            alt="Scontrino da ritagliare"
            style={{ maxHeight: "calc(100vh - 180px)", maxWidth: "100%" }}
          />
        </ReactCrop>
      </div>
      <div className="border-t border-white/10 bg-black/90 p-3 space-y-2">
        <p className="text-center text-xs text-white/70">
          Ritaglia per includere solo lo scontrino
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-11 bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"
            onClick={onCancel}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Rifare foto
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11 bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"
            onClick={() => imgRef.current && onConfirm(null, imgRef.current)}
          >
            <SkipForward className="h-4 w-4 mr-2" /> Salta ritaglio
          </Button>
          <Button
            className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!completed || completed.width < 10 || completed.height < 10}
            onClick={() =>
              imgRef.current && onConfirm(completed, imgRef.current)
            }
          >
            <Scissors className="h-4 w-4 mr-2" /> Ritaglia e analizza
          </Button>
        </div>
      </div>
    </div>
  );
}