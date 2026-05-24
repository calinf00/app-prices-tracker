import { useRef, useState } from "react";
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
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

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initial = centerCrop(
      makeAspectCrop({ unit: "%", width: 90 }, width / height, width, height),
      width,
      height,
    );
    setCrop(initial);
    const pct = initial as { x: number; y: number; width: number; height: number };
    setCompleted({
      unit: "px",
      x: (pct.x / 100) * width,
      y: (pct.y / 100) * height,
      width: (pct.width / 100) * width,
      height: (pct.height / 100) * height,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
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
            onLoad={onImageLoad}
            style={{ maxHeight: "calc(100vh - 200px)", maxWidth: "100%" }}
          />
        </ReactCrop>
      </div>
      <div
        className="border-t border-white/10 bg-black/95 p-3 space-y-2 z-[70]"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <p className="text-center text-xs text-white/70">
          Ritaglia per includere solo lo scontrino
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
          <Button
            variant="outline"
            className="w-full h-auto min-h-[44px] py-2 text-base bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white whitespace-normal break-words text-center leading-tight"
            onClick={onCancel}
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Rifare foto
          </Button>
          <Button
            variant="outline"
            className="w-full h-auto min-h-[44px] py-2 text-base bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white whitespace-normal break-words text-center leading-tight"
            onClick={() => imgRef.current && onConfirm(null, imgRef.current)}
          >
            <SkipForward className="h-4 w-4 mr-2" /> Salta ritaglio
          </Button>
          <Button
            className="w-full h-auto min-h-[44px] py-2 text-base bg-emerald-600 hover:bg-emerald-700 text-white whitespace-normal break-words text-center leading-tight"
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