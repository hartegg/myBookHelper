'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import ReactCrop, { type Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';

interface CropImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedData: { newSrc: string; width: number; height: number }) => void;
  aspectRatio?: number; // Optional aspect ratio for the crop
}

// Helper function to generate cropped image
async function getCroppedImg(image: HTMLImageElement, pixelCrop: PixelCrop): Promise<{ newSrc: string; width: number; height: number } | null> {
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get 2D context');
    return null;
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(pixelCrop.width * scaleX * pixelRatio);
  canvas.height = Math.floor(pixelCrop.height * scaleY * pixelRatio);

  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = 'high';

  const cropX = pixelCrop.x * scaleX;
  const cropY = pixelCrop.y * scaleY;

  const centerX = image.naturalWidth / 2;
  const centerY = image.naturalHeight / 2;

  ctx.translate(centerX, centerY);
  ctx.translate(-centerX, -centerY);

  ctx.drawImage(image, cropX, cropY, pixelCrop.width * scaleX, pixelCrop.height * scaleY, 0, 0, pixelCrop.width * scaleX, pixelCrop.height * scaleY);

  return new Promise((resolve) => {
    const newSrc = canvas.toDataURL('image/webp', 0.92);
    resolve({ newSrc, width: Math.round(pixelCrop.width), height: Math.round(pixelCrop.height) });
  });
}

const CropImageModal: React.FC<CropImageModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
  aspectRatio: cropAspectRatioProp, // Renamed prop to avoid conflict
}) => {
  const [crop, setCrop] = useState<Crop | undefined>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setCrop(undefined);
      setCompletedCrop(undefined);
      setError(null);
    }
  }, [isOpen]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    let initialCrop: Crop;
    if (cropAspectRatioProp) {
      initialCrop = centerCrop(
        makeAspectCrop(
          { unit: '%', width: 80 }, // Default to 80% width
          cropAspectRatioProp,
          width,
          height
        ),
        width,
        height
      );
    } else {
      // Default crop if no aspect ratio is provided (e.g., 80% of image centered)
      initialCrop = centerCrop({ unit: '%', width: 80, height: 80 }, width, height);
    }
    setCrop(initialCrop);
  }

  const handleConfirmCrop = async () => {
    if (!completedCrop || !imgRef.current) {
      setError('Crop area is not selected or image not loaded.');
      console.error('Crop area is not selected or image not loaded.');
      return;
    }
    setError(null);
    try {
      const croppedImageData = await getCroppedImg(imgRef.current, completedCrop);
      if (croppedImageData) {
        onCropComplete(croppedImageData);
        onClose();
      } else {
        setError('Failed to crop image.');
      }
    } catch (e: any) {
      setError(`Error cropping image: ${e.message}`);
      console.error('Error cropping image:', e);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
          <DialogDescription>
            Select the area you want to crop.
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 flex justify-center items-center" style={{ minHeight: '300px', maxHeight: '70vh', overflow: 'hidden' }}>
          {imageSrc ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={cropAspectRatioProp} // Use the prop here
              minWidth={50}
              minHeight={50}
              // ruleOfThirds // Optional: adds rule of thirds lines
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Image to crop"
                style={{ maxHeight: 'calc(70vh - 100px)', objectFit: 'contain' }} // Adjust maxHeight to fit modal
                onLoad={onImageLoad}
                crossOrigin="anonymous" // Important for canvas operations if src is from another domain (not applicable for data URIs)
                data-ai-hint="image preview"
              />
            </ReactCrop>
          ) : (
            <p className="text-muted-foreground">Loading image...</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirmCrop} disabled={!completedCrop}>
            Apply Crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CropImageModal;
