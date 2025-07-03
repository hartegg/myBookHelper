'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import Image from 'next/image';

interface ImageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: { sharpen: number; color: number; sepia: number };
  onApplyFilters: (newFilters: { sharpen: number; color: number; sepia: number }) => void;
  imageSrc: string;
  loadImage: (id: string) => Promise<Blob | null>;
}

const ImageSettingsModal: React.FC<ImageSettingsModalProps> = ({ isOpen, onClose, filters, onApplyFilters, imageSrc, loadImage }) => {
  const [sharpen, setSharpen] = React.useState(filters?.sharpen ?? 100);
  const [color, setColor] = React.useState(filters?.color ?? 0);
  const [sepia, setSepia] = React.useState(filters?.sepia ?? 0);
  const [displaySrc, setDisplaySrc] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (imageSrc.startsWith('data:') || imageSrc.startsWith('blob:')) {
        setDisplaySrc(imageSrc);
      } else {
        loadImage(imageSrc).then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setDisplaySrc(url);
          } else {
            setError('Failed to load image for settings.');
          }
        });
      }
    } else {
      if (displaySrc && displaySrc.startsWith('blob:')) {
        URL.revokeObjectURL(displaySrc);
      }
      setDisplaySrc(null);
      setError(null);
    }

    return () => {
      if (displaySrc && displaySrc.startsWith('blob:')) {
        URL.revokeObjectURL(displaySrc);
      }
    };
  }, [isOpen, imageSrc, loadImage, displaySrc]);

  // Calculate CSS filters based on current settings
  const cssFilters = {
    filter: `contrast(${color / 100 + 1}) sepia(${sepia}%) blur(${Math.max(0, (100 - sharpen) / 10)}px)`,
  };

  const handleApply = () => {
    onApplyFilters({ sharpen, color, sepia });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Image Settings</DialogTitle>
          <DialogDescription>Adjust the image settings below.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            {displaySrc ? <Image src={displaySrc} style={cssFilters} alt="Preview" className="w-full" width={500} height={300} /> : <p>{error || 'Loading image...'}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sharpen-slider">Blur / Sharpen</Label>
            <Slider id="sharpen-slider" min={-100} max={200} step={5} value={[sharpen]} onValueChange={(value) => setSharpen(value[0])} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="color-slider">Color</Label>
            <Slider id="color-slider" min={-100} max={100} step={5} value={[color]} onValueChange={(value) => setColor(value[0])} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sepia-slider">Sepia</Label>
            <Slider id="sepia-slider" min={0} max={100} step={5} value={[sepia]} onValueChange={(value) => setSepia(value[0])} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageSettingsModal;
