'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { saveImage } from '@/lib/db';
import { Button } from '@/components/ui/button';

interface ImagePasteComponentProps {
  onImageInsert: (id: string) => void;
}

export function ImagePasteComponent({ onImageInsert }: ImagePasteComponentProps) {
  const [pastedImage, setPastedImage] = useState<{ url: string; blob: Blob } | null>(null);
  const pasteTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pasteTargetRef.current) {
      pasteTargetRef.current.focus();
    }
  }, []);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    console.log('Paste event triggered!');
    event.preventDefault(); // Prevent default paste behavior
    const items = event.clipboardData.items;
    console.log('Clipboard items:', items);
    for (let i = 0; i < items.length; i++) {
      console.log(`Item ${i}: type = ${items[i].type}`);
      if (items[i].type.indexOf('image') !== -1) {
        console.log('Image item found!');
        const blob = items[i].getAsFile();
        if (blob) {
          console.log('Blob obtained:', blob);
          const imageUrl = URL.createObjectURL(blob);
          setPastedImage({ url: imageUrl, blob });
        } else {
          console.log('Blob is null.');
        }
      } else {
        console.log('Not an image item.');
      }
    }
  }, []);

  const handleSaveAndInsert = useCallback(async () => {
    if (pastedImage) {
      const imageId = `img_${Date.now()}`;
      try {
        await saveImage(imageId, pastedImage.blob);
        onImageInsert(imageId);
        setPastedImage(null); // Clear after inserting
      } catch (error) {
        console.error('Error saving image:', error);
        // Optionally, show a toast notification
      }
    }
  }, [pastedImage, onImageInsert]);

  const handleClick = () => {
    pasteTargetRef.current?.focus();
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Invisible contentEditable div to capture paste events */}
      <div
        ref={pasteTargetRef}
        onPaste={handlePaste}
        tabIndex={0}
        contentEditable="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          pointerEvents: 'none', // Prevent interaction with this hidden div
        }}
      />

      {/* Visual representation of the paste area */}
      <div
        onClick={handleClick} // Keep click handler for focusing the hidden div
        style={{
          border: '2px dashed #ccc',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          minHeight: '100px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {pastedImage ? <img src={pastedImage.url} alt="Pasted content" style={{ maxWidth: '100%' }} /> : <p>Click here and press Ctrl+V to paste an image.</p>}
      </div>
      {pastedImage && (
        <Button onClick={handleSaveAndInsert} className="mt-2 w-full">
          Insert Image
        </Button>
      )}
    </div>
  );
}
