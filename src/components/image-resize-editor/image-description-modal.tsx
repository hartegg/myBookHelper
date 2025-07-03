'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import Image from 'next/image';

interface ImageDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  currentDescription?: string;
  onApplyDescription: (description: string) => void;
  loadImage: (id: string) => Promise<Blob | null>;
}

const ImageDescriptionModal: React.FC<ImageDescriptionModalProps> = ({ isOpen, onClose, imageSrc, currentDescription, onApplyDescription, loadImage }) => {
  const [description, setDescription] = useState(currentDescription || '');
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDescription(currentDescription || '');
      if (imageSrc.startsWith('data:') || imageSrc.startsWith('blob:')) {
        setDisplaySrc(imageSrc);
      } else {
        loadImage(imageSrc).then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setDisplaySrc(url);
          } else {
            setError('Failed to load image for description.');
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
  }, [isOpen, imageSrc, loadImage, currentDescription, displaySrc]);

  const handleApply = () => {
    onApplyDescription(description);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Image Description / Alt Text</DialogTitle>
          <DialogDescription>Add a description or alt text for the image.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            {displaySrc ? <Image src={displaySrc} alt="Preview" className="w-full max-h-64 object-contain" width={500} height={300} /> : <p>{error || 'Loading image...'}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image-description">Description</Label>
            <Input id="image-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter image description or alt text" />
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

export default ImageDescriptionModal;
