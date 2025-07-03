import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { loadImage } from '@/lib/db';

import { ContentBlock, ContentState } from 'draft-js';

interface ImageBlockProps {
  block: ContentBlock;
  contentState: ContentState;
}

const ImageBlock: React.FC<ImageBlockProps> = ({ block, contentState }) => {
  const entityKey = block.getEntityAt(0);
  const entity = contentState.getEntity(entityKey);
  const { src: imageId } = entity.getData(); // src now holds the imageId

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const fetchImage = async () => {
      if (imageId && imageId.startsWith('img_')) {
        try {
          const blob = await loadImage(imageId);
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
          } else {
            console.warn(`Image blob not found for ID: ${imageId}`);
            setImageUrl(null); // Or a placeholder image URL
          }
        } catch (error) {
          console.error(`Error loading image ${imageId}:`, error);
          setImageUrl(null); // Or a placeholder image URL
        }
      } else {
        // If src is not an imageId (e.g., external URL), use it directly
        setImageUrl(imageId);
      }
    };

    fetchImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imageId]);

  if (!imageUrl) {
    return <div style={{ width: '100%', height: '100px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading Image...</div>;
  }

  return <Image src={imageUrl} alt={imageId} layout="responsive" width={500} height={300} />;
};

export default ImageBlock;
