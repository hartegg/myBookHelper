'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Draft from 'draft-js';

// flip horizontal, vertical
import { PiFlipHorizontalFill, PiFlipVerticalFill } from 'react-icons/pi';
// description
import { IoTvOutline } from 'react-icons/io5';
import ImageDescriptionModal from './image-description-modal';
// rotate left, right
import { BiRotateLeft, BiRotateRight } from 'react-icons/bi';
// actual size of image
// import { SlSizeActual } from "react-icons/sl"; // Not used, can be removed or kept for future
// revert, delete
import { RiRefreshLine } from 'react-icons/ri'; // RiDeleteBin7Line removed as not used
// settings
import { IoMdSettings } from 'react-icons/io';
// align
import { MdOutlineFormatAlignCenter, MdOutlineFormatAlignJustify, MdOutlineFormatAlignLeft, MdOutlineFormatAlignRight } from 'react-icons/md';
import { Scissors } from 'lucide-react'; // Added for Crop button
import CropImageModal from './crop-image-modal'; // Added new component import
import ImageSettingsModal from './image-settings-modal'; // Importing ImageSettingsModal
import InfoBox from './info-box'; // Importing InfoBox

interface CustomImageComponentProps {
  block: Draft.ContentBlock;
  contentState: Draft.ContentState;
  blockProps: {
    editorState: Draft.EditorState;
    onChange: (editorState: Draft.EditorState) => void;
    entityData: {
      src: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
      originalSrc?: string;
      originalWidth?: number;
      originalHeight?: number;
      originalMimeType?: string;
      rotation?: number;
      flippedVertical?: boolean;
      flippedHorizontal?: boolean;
      alignment?: 'left' | 'center' | 'right'; // Added alignment
      filters?: { [key: string]: any }; // Added filters for image settings
      description?: string; // Added description for image alt text
    };
    isSelected: boolean;
    onSelect: () => void;
    editorLayoutWidth?: number | null;
    onModalOpenChange: (isOpen: boolean) => void; // Added for modal state tracking
  };
}

const extractMimeType = (dataUri: string): string => {
  const match = dataUri.match(/^data:(image\/(.+?));base64,/);
  return match && match[1] ? match[1] : 'image/jpeg';
};

export const resizeImageClientSide = (originalSrc: string, targetWidth: number, targetHeight: number, mimeType: string = 'image/webp', quality: number | undefined = 0.95): Promise<string> => {
  console.log('[resizeImageClientSide] Starting. Target Dims:', targetWidth, 'x', targetHeight, 'MIME:', mimeType, 'Quality:', quality);
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[resizeImageClientSide] Failed to get canvas context');
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      let qualityArg: number | undefined = quality;
      if (mimeType.toLowerCase() === 'image/png') {
        qualityArg = undefined;
      } else {
        qualityArg = 0.55;
      }

      const newSrc = canvas.toDataURL(mimeType, quality);

      console.log('[resizeImageClientSide] Image re-encoded. New src length:', newSrc.length);
      if (newSrc.length < 100) {
        console.warn('[resizeImageClientSide] Re-encoded src seems too short, potential error.');
        reject(new Error('Re-encoded image data URI is too short.'));
        return;
      }
      resolve(newSrc);
    };
    img.onerror = (err) => {
      console.error('[resizeImageClientSide] Error loading image for resizing:', err, originalSrc.substring(0, 100) + '...');
      reject(err);
    };
    img.src = originalSrc;
  });
};

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const CustomImageComponent: React.FC<CustomImageComponentProps> = (props) => {
  const { block, contentState, blockProps } = props;
  const { editorState, onChange, entityData, isSelected, onSelect, editorLayoutWidth } = blockProps;

  // State declarations
  const [actualOriginalSrc, setActualOriginalSrc] = useState<string | null>(null);
  const [actualOriginalWidth, setActualOriginalWidth] = useState<number | null>(null);
  const [actualOriginalHeight, setActualOriginalHeight] = useState<number | null>(null);
  const [actualOriginalMimeType, setActualOriginalMimeType] = useState<string | null>(null);
  const [dimensionsInitialized, setDimensionsInitialized] = useState<boolean>(false);
  const [showAlignSubMenu, setShowAlignSubMenu] = useState(false);
  const [displayedFileSize, setDisplayedFileSize] = useState<string | null>(null);

  const [currentWidth, setCurrentWidth] = useState<number>(300);
  const [currentHeight, setCurrentHeight] = useState<number>(300);
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(entityData.rotation || 0);
  const [isFlippedVertical, setIsFlippedVertical] = useState<boolean>(entityData.flippedVertical || false);
  const [isFlippedHorizontal, setIsFlippedHorizontal] = useState<boolean>(entityData.flippedHorizontal || false);

  const [hasBeenResizedTo75, setHasBeenResizedTo75] = useState(false);
  const [hasBeenResizedTo50, setHasBeenResizedTo50] = useState(false);

  const [isResizing, setIsResizing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [originalMousePos, setOriginalMousePos] = useState({ x: 0, y: 0 });
  const [originalDimensionsOnDragStart, setOriginalDimensionsOnDragStart] = useState({
    width: 0,
    height: 0,
  });

  const alignButtonRef = useRef<HTMLButtonElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);

  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isImageSettingsModalOpen, setIsImageSettingsModalOpen] = useState(false);
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);

  const entity = contentState.getEntity(block.getEntityAt(0));
  const { src, width: entityWidthFromData, height: entityHeightFromData, alignment, filters, description: entityDescriptionFromData } = entity.getData();
  const [isLoading, setIsLoading] = useState(false);

  const loadImage = useCallback(async (id: string): Promise<Blob | null> => {
    try {
      if (id.startsWith('data:')) {
        // Convert data URI to Blob
        const response = await fetch(id);
        const blob = await response.blob();
        return blob;
      } else {
        // Fetch image from URL
        const response = await fetch(id);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        return blob;
      }
    } catch (error) {
      console.error('Error loading image:', error);
      return null;
    }
  }, []);

  // --- Callbacks ---

  const applyResize = useCallback(
    async (newWidth: number, newHeight: number) => {
      setIsUpdating(true);
      const entityKey = block.getEntityAt(0);
      if (!entityKey) {
        console.warn('No entityKey found for resize');
        setIsUpdating(false);
        return;
      }

      const entityUpdateData = {
        ...entityData,
        width: newWidth,
        height: newHeight,
        rotation: rotation,
        flippedVertical: isFlippedVertical,
        flippedHorizontal: isFlippedHorizontal,
        filters: entityData.filters,
      };

      let newResizedSrc = entityData.src;
      const srcForEncoding = entityData.src;

      if (srcForEncoding) {
        try {
          const mimeType = 'image/webp';
          newResizedSrc = await resizeImageClientSide(srcForEncoding, newWidth, newHeight, mimeType, 0.8);
          entityUpdateData.src = newResizedSrc;

          // Calculate and set displayedFileSize immediately after resizing
          if (newResizedSrc.startsWith('data:')) {
            const base64Part = newResizedSrc.split(',')[1];
            if (base64Part) {
              const base64Length = base64Part.length;
              const padding = base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0;
              const bytes = base64Length * 0.75 - padding;
              setDisplayedFileSize(formatBytes(bytes));
            }
          }
        } catch (error) {
          console.error('Failed to resize image', error);
          entityUpdateData.src = entityData.src;
        }
      }

      setCurrentWidth(newWidth);
      setCurrentHeight(newHeight);

      const contentState = editorState.getCurrentContent();
      const newContentState = contentState.mergeEntityData(entityKey, entityUpdateData);
      const newEditorState = Draft.EditorState.push(editorState, newContentState, 'apply-entity');
      onChange(newEditorState);
      setIsUpdating(false);
    },
    [block, entityData, rotation, isFlippedVertical, isFlippedHorizontal, editorState, onChange]
  );

  const handleResizeOriginal = useCallback(() => {
    if (actualOriginalWidth && actualOriginalHeight) {
      applyResize(actualOriginalWidth, actualOriginalHeight);
      setHasBeenResizedTo75(false);
      setHasBeenResizedTo50(false);
    }
  }, [actualOriginalWidth, actualOriginalHeight, applyResize]);

  const handleResize75 = useCallback(() => {
    if (currentWidth > 0 && aspectRatio > 0) {
      const newWidth = currentWidth * 0.75;
      const newHeight = newWidth / aspectRatio;
      applyResize(newWidth, newHeight);
      setHasBeenResizedTo75(true);
    }
  }, [currentWidth, aspectRatio, applyResize]);

  const handleResize50 = useCallback(() => {
    if (currentWidth > 0 && aspectRatio > 0) {
      const newWidth = currentWidth * 0.5;
      const newHeight = newWidth / aspectRatio;
      applyResize(newWidth, newHeight);
      setHasBeenResizedTo50(true);
    }
  }, [currentWidth, aspectRatio, applyResize]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, handleName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (onSelect) onSelect();

    if (currentWidth > 0 && currentHeight > 0 && dimensionsInitialized) {
      setIsResizing(true);
      setActiveHandle(handleName);
      setOriginalMousePos({ x: e.clientX, y: e.clientY });
      setOriginalDimensionsOnDragStart({ width: currentWidth, height: currentHeight });
    } else {
      setIsResizing(false);
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !activeHandle || !isMounted.current || !(aspectRatio > 0)) return;
      e.preventDefault();
      e.stopPropagation();

      const dx = e.clientX - originalMousePos.x;
      const dy = e.clientY - originalMousePos.y;

      let newWidth = originalDimensionsOnDragStart.width;
      let newHeight = originalDimensionsOnDragStart.height;

      // Calculate new dimensions based on handle and maintain aspect ratio
      if (activeHandle.includes('r')) {
        newWidth = originalDimensionsOnDragStart.width + dx;
        newHeight = newWidth / aspectRatio;
      } else if (activeHandle.includes('l')) {
        newWidth = originalDimensionsOnDragStart.width - dx;
        newHeight = newWidth / aspectRatio;
      }

      if (activeHandle.includes('b')) {
        newHeight = originalDimensionsOnDragStart.height + dy;
        newWidth = newHeight * aspectRatio;
      } else if (activeHandle.includes('t')) {
        newHeight = originalDimensionsOnDragStart.height - dy;
        newWidth = newHeight * aspectRatio;
      }

      // For corner handles, prioritize the larger change to maintain aspect ratio
      if (activeHandle.length === 2) {
        // e.g., 'br', 'tl'
        const ratioX = newWidth / originalDimensionsOnDragStart.width;
        const ratioY = newHeight / originalDimensionsOnDragStart.height;

        if (Math.abs(dx) > Math.abs(dy)) {
          newHeight = newWidth / aspectRatio;
        } else {
          newWidth = newHeight * aspectRatio;
        }
      }

      // Ensure minimum dimensions
      newWidth = Math.max(50, newWidth);
      newHeight = Math.max(50, newHeight);

      // Adjust the other dimension if one hit the minimum, to maintain aspect ratio
      if (newWidth === 50 && newHeight < 50 / aspectRatio) {
        newHeight = 50 / aspectRatio;
      } else if (newHeight === 50 && newWidth < 50 * aspectRatio) {
        newWidth = 50 * aspectRatio;
      }

      setCurrentWidth(Math.round(newWidth));
      setCurrentHeight(Math.round(newHeight));
    },
    [isResizing, activeHandle, originalMousePos, originalDimensionsOnDragStart, aspectRatio]
  );

  const handleMouseUp = useCallback(async () => {
    if (!isResizing || !isMounted.current) return;

    console.log(`[CustomImageComponent] handleMouseUp for block ${block.getKey()}. Current visual dims: ${currentWidth}x${currentHeight}`);
    const finalWidth = Math.round(currentWidth);
    const finalHeight = Math.round(currentHeight);

    setIsResizing(false);
    setActiveHandle(null);

    await applyResize(finalWidth, finalHeight);

    setHasBeenResizedTo75(false);
    setHasBeenResizedTo50(false);
  }, [isResizing, currentWidth, currentHeight, applyResize]);

  const handleFlipHorizontal = useCallback(() => {
    const newFlippedState = !isFlippedHorizontal;
    setIsFlippedHorizontal(newFlippedState);
    if (editorState && onChange && entityData) {
      const entityKey = block.getEntityAt(0);
      if (!entityKey) return;
      const contentState = editorState.getCurrentContent();
      const newContentState = contentState.mergeEntityData(entityKey, {
        flippedHorizontal: newFlippedState,
      });
      onChange(Draft.EditorState.push(editorState, newContentState, 'apply-entity'));
    }
  }, [block, editorState, onChange, entityData, isFlippedHorizontal]);

  const handleFlipVertical = useCallback(() => {
    const newFlippedState = !isFlippedVertical;
    setIsFlippedVertical(newFlippedState);
    if (editorState && onChange && entityData) {
      const entityKey = block.getEntityAt(0);
      if (!entityKey) return;
      const contentState = editorState.getCurrentContent();
      const newContentState = contentState.mergeEntityData(entityKey, {
        flippedVertical: newFlippedState,
      });
      onChange(Draft.EditorState.push(editorState, newContentState, 'apply-entity'));
    }
  }, [block, editorState, onChange, entityData, isFlippedVertical]);

  const handleRotateLeft = useCallback(() => {
    const newRotation = (rotation - 90 + 360) % 360;
    setRotation(newRotation);
    if (editorState && onChange && entityData) {
      const entityKey = block.getEntityAt(0);
      if (!entityKey) return;
      const contentState = editorState.getCurrentContent();
      const newContentState = contentState.mergeEntityData(entityKey, { rotation: newRotation });
      onChange(Draft.EditorState.push(editorState, newContentState, 'apply-entity'));
    }
  }, [block, editorState, onChange, entityData, rotation]);

  const handleRotateRight = useCallback(() => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
    if (editorState && onChange && entityData) {
      const entityKey = block.getEntityAt(0);
      if (!entityKey) return;
      const contentState = editorState.getCurrentContent();
      const newContentState = contentState.mergeEntityData(entityKey, { rotation: newRotation });
      onChange(Draft.EditorState.push(editorState, newContentState, 'apply-entity'));
    }
  }, [block, editorState, onChange, entityData, rotation]);

  const handleOpenCropModal = useCallback(() => {
    if (onSelect) onSelect();
    setIsCropModalOpen(true);
  }, [onSelect]);

  const handleOpenImageSettingsModal = useCallback(() => {
    if (onSelect) onSelect();
    setIsImageSettingsModalOpen(true);
  }, [onSelect]);

  const handleOpenImageDescriptionModal = useCallback(() => {
    if (onSelect) onSelect();
    setIsDescriptionModalOpen(true);
    blockProps.onModalOpenChange(true);
  }, [onSelect, blockProps]);

  const handleApplyDescription = useCallback(
    (description: string) => {
      const entityKey = block.getEntityAt(0);
      if (!entityKey) return;
      const contentState = editorState.getCurrentContent();
      const newContentState = contentState.mergeEntityData(entityKey, { description });
      onChange(Draft.EditorState.push(editorState, newContentState, 'apply-entity'));
      setIsDescriptionModalOpen(false);
      blockProps.onModalOpenChange(false);
    },
    [block, editorState, onChange, blockProps]
  );

  const handleCloseDescriptionModal = useCallback(() => {
    setIsDescriptionModalOpen(false);
    //if (editorState && onChange && entityData) {
    blockProps.onModalOpenChange(false);
    //}
  }, [blockProps, editorState, onChange, entityData]);

  const handleCropConfirm = useCallback(
    async (croppedData: { newSrc: string; width: number; height: number }) => {
      console.log('[CustomImageComponent handleCropConfirm] called with:', croppedData);
      const { newSrc: newCroppedSrc, width: newCroppedWidth, height: newCroppedHeight } = croppedData;

      if (editorState && onChange && entityData && block) {
        const entityKey = block.getEntityAt(0);
        if (!entityKey) {
          console.warn('[CustomImageComponent handleCropConfirm] No entityKey found on block.');
          setIsCropModalOpen(false);
          return;
        }

        const contentState = editorState.getCurrentContent();
        const currentEntity = contentState.getEntity(entityKey);
        const currentEntityData = currentEntity.getData();

        const newEntityDataToMerge = {
          ...currentEntityData,
          src: newCroppedSrc,
          width: newCroppedWidth,
          height: newCroppedHeight,
          originalSrc: newCroppedSrc,
          originalWidth: newCroppedWidth,
          originalHeight: newCroppedHeight,
          originalMimeType: extractMimeType(newCroppedSrc),
        };
        console.log('[CustomImageComponent handleCropConfirm] New cropped src length:', newCroppedSrc ? newCroppedSrc.length : 'null');

        const newContentStateWithUpdatedEntity = contentState.mergeEntityData(entityKey, newEntityDataToMerge);

        let newEditorStateWithChanges = Draft.EditorState.push(editorState, newContentStateWithUpdatedEntity, 'apply-entity');

        setCurrentWidth(newCroppedWidth);
        setCurrentHeight(newCroppedHeight);
        setAspectRatio(newCroppedWidth > 0 && newCroppedHeight > 0 ? newCroppedWidth / newCroppedHeight : 1);
        setActualOriginalSrc(newCroppedSrc);
        setActualOriginalWidth(newCroppedWidth);
        setActualOriginalHeight(newCroppedHeight);
        setActualOriginalMimeType(extractMimeType(newCroppedSrc));

        const finalContentState = contentState.mergeEntityData(entityKey, newEntityDataToMerge);

        let finalEditorState = Draft.EditorState.push(newEditorStateWithChanges, finalContentState, 'apply-entity');
        onChange(finalEditorState);
        onSelect();
      }
      setIsCropModalOpen(false);
    },
    [block, editorState, onChange, entityData, onSelect]
  );

  // --- Effects ---

  useEffect(() => {
    isMounted.current = true;

    const initDimensions = async () => {
      let initialOriginalSrc = entityData.originalSrc;
      let initialOriginalWidth = entityData.originalWidth;
      let initialOriginalHeight = entityData.originalHeight;
      let initialOriginalMimeType = entityData.originalMimeType;

      // If original data is not fully available in entityData, load from src
      if (!initialOriginalWidth || !initialOriginalHeight || !initialOriginalSrc) {
        const img = new window.Image();
        img.src = entityData.src;
        await new Promise<void>((resolve) => {
          img.onload = () => {
            if (!isMounted.current) return;
            initialOriginalSrc = entityData.src;
            initialOriginalWidth = img.naturalWidth;
            initialOriginalHeight = img.naturalHeight;
            initialOriginalMimeType = extractMimeType(entityData.src);
            resolve();
          };
          img.onerror = (err) => {
            // console.error('Failed to load image for original dimensions fallback:', err);
            resolve(); // Resolve even on error to prevent hanging
          };
        });
      }

      if (initialOriginalWidth && initialOriginalHeight) {
        setActualOriginalSrc(initialOriginalSrc || null);
        setActualOriginalWidth(initialOriginalWidth);
        setActualOriginalHeight(initialOriginalHeight);
        setActualOriginalMimeType(initialOriginalMimeType || null);
        setAspectRatio(initialOriginalWidth / initialOriginalHeight);

        // Set current dimensions based on entityData or scaled original
        const entityWidthNum = typeof entityData.width === 'string' ? parseInt(entityData.width, 10) : entityData.width;
        const entityHeightNum = typeof entityData.height === 'string' ? parseInt(entityData.height, 10) : entityData.height;

        if (entityWidthNum && entityHeightNum) {
          setCurrentWidth(entityWidthNum);
          setCurrentHeight(entityHeightNum);
        } else if (initialOriginalWidth && initialOriginalHeight) {
          // Use actualOriginalWidth/Height here
          // Fallback for initial setup if entityData.width/height are missing but original are known
          let displayW = initialOriginalWidth;
          let displayH = initialOriginalHeight;

          if (editorLayoutWidth && editorLayoutWidth > 0) {
            const maxAllowedWidthForLayout = editorLayoutWidth - 20;
            if (displayW > maxAllowedWidthForLayout) {
              displayW = maxAllowedWidthForLayout;
              displayH = displayW / (initialOriginalWidth / initialOriginalHeight);
            }
          } else if (displayW > 600) {
            displayW = 600;
            displayH = displayW / (initialOriginalWidth / initialOriginalHeight);
          }
          setCurrentWidth(Math.round(displayW));
          setCurrentHeight(Math.round(displayH));
        }
        setDimensionsInitialized(true);
      }
    };

    initDimensions();

    // Reset 75%/50% buttons on selection change
    if (isSelected) {
      setHasBeenResizedTo75(false);
      setHasBeenResizedTo50(false);
    }

    return () => {
      isMounted.current = false;
    };
  }, [
    block.getKey(),
    entityData.src,
    entityData.width,
    entityData.height,
    entityData.originalSrc,
    entityData.originalWidth,
    entityData.originalHeight,
    entityData.originalMimeType,
    editorLayoutWidth,
    isSelected,
    isMounted,
    // Removed actualOriginalWidth, actualOriginalHeight from dependencies to prevent re-runs
    // that could cause issues during their own initialization.
  ]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAlignSubMenu && alignButtonRef.current && !alignButtonRef.current.contains(event.target as Node) && !(event.target as HTMLElement).closest('#inner')) {
        setShowAlignSubMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAlignSubMenu]);

  useEffect(() => {
    if (entityData?.src && entityData.src.startsWith('data:')) {
      const base64Part = entityData.src.split(',')[1];
      if (base64Part) {
        const base64Length = base64Part.length;
        const padding = base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0;
        const bytes = base64Length * 0.75 - padding;
        setDisplayedFileSize(formatBytes(bytes));
      }
    }
  }, [entityData.src]);

  useEffect(() => {
    if (entityData?.src && entityData.src.startsWith('data:')) {
      const base64Part = entityData.src.split(',')[1];
      if (base64Part) {
        const base64Length = base64Part.length;
        const padding = base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0;
        const bytes = base64Length * 0.75 - padding;
        setDisplayedFileSize(formatBytes(bytes));
      }
    }
  }, [entityData.src]);

  // --- Derived Values ---
  const displaySrcForImgTag = entityData.src;
  if (!dimensionsInitialized) {
    return (
      <div
        style={{
          padding: '10px',
          border: '1px dashed orange',
          color: 'orange',
          minHeight: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        data-ai-hint="loading placeholder"
      >
        Initializing image dimensions...
      </div>
    );
  }

  const containerWrapperStyle: React.CSSProperties = {
    display: 'inline-block', // Changed to inline-block for better centering behavior with text-align from editor
    position: 'relative',
    transform: `rotate(${rotation}deg)`,
    lineHeight: '0',
    cursor: isSelected ? (isResizing ? 'grabbing' : 'grab') : 'pointer',
    userSelect: 'none',
    border: isSelected ? '1px dashed #3f9dff' : '1px dashed transparent',
    borderRadius: '2px',
    padding: '2px',
    margin: 'auto', // Added for centering if parent is block and has text-align: center
    //overflow: 'hidden', // Add overflow hidden to contain children
  };

  const imageStyle: React.CSSProperties = {
    display: 'block',
    width: `${currentWidth}px`,
    height: `${currentHeight}px`,
    objectFit: 'contain',
    transform: `${isFlippedHorizontal ? 'scaleX(-1)' : 'scaleX(1)'} ${isFlippedVertical ? 'scaleY(-1)' : 'scaleY(1)'}`,
    filter: `
        blur(${filters?.blur || 0}px) 
        saturate(${filters?.saturation || 100}%) 
        sepia(${filters?.sepia || 0}%) 
        contrast(${filters?.contrast || 100}%)
      `,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#7997ff33',
    zIndex: 1,
    pointerEvents: 'none',
  };

  const resizeHandleSize = 10;
  const handleBaseStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${resizeHandleSize}px`,
    height: `${resizeHandleSize}px`,
    backgroundColor: '#3f9dff',
    border: '1px solid hsl(var(--primary-foreground))',
    borderRadius: '2px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    zIndex: 99,
    opacity: isSelected && dimensionsInitialized && !isResizing ? 1 : isResizing ? 0.5 : 0,
    transition: 'opacity 0.1s ease-in-out',
  };

  const handles = [
    {
      name: 'tl',
      style: {
        top: -(resizeHandleSize / 2) - 1,
        left: -(resizeHandleSize / 2) - 1,
        cursor: 'nwse-resize',
      },
    },
    {
      name: 'tr',
      style: {
        top: -(resizeHandleSize / 2) - 1,
        right: -(resizeHandleSize / 2) - 1,
        cursor: 'nesw-resize',
      },
    },
    {
      name: 'bl',
      style: {
        bottom: -(resizeHandleSize / 2) - 1,
        left: -(resizeHandleSize / 2) - 1,
        cursor: 'nesw-resize',
      },
    },
    {
      name: 'br',
      style: {
        bottom: -(resizeHandleSize / 2) - 1,
        right: -(resizeHandleSize / 2) - 1,
        cursor: 'nwse-resize',
      },
    },
  ];

  return (
    <div
      ref={imageContainerRef}
      style={containerWrapperStyle}
      data-ai-hint="resizable image container"
      onClick={(e) => {
        e.preventDefault();
        if (onSelect && dimensionsInitialized) {
          onSelect();
        }
      }}
      data-custom-image-block-key={block.getKey()}
    >
      <img src={displaySrcForImgTag} alt={entityData?.alt || 'custom image'} style={imageStyle} draggable="false" />
      {entityDescriptionFromData && (
        <div
          style={{
            display: 'block',
            width: `${currentWidth}px`,
            textAlign: 'center',
            fontSize: '0.8em',
            color: '#666',
            marginTop: '5px',
            padding: '8px 5px',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            boxSizing: 'border-box',
            lineHeight: 'normal',
          }}
        >
          {entityDescriptionFromData}
        </div>
      )}

      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 15,
            cursor: 'wait',
          }}
        ></div>
      )}

      {isSelected && <div style={overlayStyle} data-ai-hint="image selection overlay" />}

      {handles.map((handle) => (
        <div key={handle.name} style={{ ...handleBaseStyle, ...handle.style }} onMouseDown={(e) => handleMouseDown(e, handle.name)} aria-label={`Resize image ${handle.name}`} role="button" />
      ))}

      {isSelected && (
        <div
          /* className="rdw-image-alignment-options-popup" */
          contentEditable={false}
          style={{
            position: 'absolute',
            /* bottom: -85, */
            bottom: 5,
            /* left: 5, */
            left: '50%', // Center the submenu
            transform: 'translateX(-50%)', // Adjust for centering /* */
            zIndex: 20, // Ensure submenu is above other elements like resize handles
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            padding: '5px',
            boxShadow: '2px 2px 5px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            borderRadius: '4px', // Added border radius
          }}
        >
          <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
            <button
              title="Resize to 100% original"
              onClick={handleResizeOriginal}
              style={{
                padding: '5px 8px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <span>100%</span>
            </button>
            <button
              title="Resize to 75% of current"
              onClick={handleResize75}
              disabled={hasBeenResizedTo75}
              style={{
                padding: '5px 8px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: hasBeenResizedTo75 ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s ease',
                opacity: hasBeenResizedTo75 ? 0.5 : 1,
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <span>75%</span>
            </button>
            <button
              title="Resize to 50% of current"
              onClick={handleResize50}
              disabled={hasBeenResizedTo50}
              style={{
                padding: '5px 8px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: hasBeenResizedTo50 ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s ease',
                opacity: hasBeenResizedTo50 ? 0.5 : 1,
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <span>50%</span>
            </button>
            <button
              title="Rotate Left"
              onClick={handleRotateLeft}
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <BiRotateLeft style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              title="Rotate Right"
              onClick={handleRotateRight}
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <BiRotateRight style={{ width: '18px', height: '18px' }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '5px', marginTop: '0px' }}>
            <button
              title="Flip Horizontal"
              onClick={handleFlipHorizontal}
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <PiFlipHorizontalFill style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              title="Resize to 100% original"
              onClick={handleFlipVertical}
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <PiFlipVerticalFill style={{ width: '18px', height: '18px' }} />
            </button>
            <div id="outer" style={{ position: 'relative' }}>
              <button
                id="btnRel"
                ref={alignButtonRef}
                title="Align Image"
                style={{
                  padding: '5px',
                  border: '1px solid transparent',
                  borderRadius: '4px',
                  backgroundColor: showAlignSubMenu ? '#f0f0f0' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s ease',
                }}
                onClick={() => setShowAlignSubMenu(!showAlignSubMenu)}
                onMouseOver={(e) => !showAlignSubMenu && (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                onMouseOut={(e) => !showAlignSubMenu && (e.currentTarget.style.backgroundColor = 'white')}
              >
                <MdOutlineFormatAlignJustify style={{ width: '18px', height: '18px' }} />
              </button>
              {showAlignSubMenu && (
                <div
                  id="inner"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 5px)',
                    left: '-6px',
                    zIndex: 21,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    padding: '5px 7px',
                    boxShadow: '2px 2px 5px rgba(0,0,0,0.2)',
                    boxSizing: 'border-box',
                    borderRadius: '4px',
                  }}
                >
                  <button
                    title="Align Justify (Default)"
                    onClick={() => setShowAlignSubMenu(false)}
                    style={{
                      padding: '5px',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <MdOutlineFormatAlignJustify style={{ width: '18px', height: '18px' }} />
                  </button>
                  <button
                    title="Align Left"
                    onClick={() => setShowAlignSubMenu(false)}
                    style={{
                      padding: '5px',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <MdOutlineFormatAlignLeft style={{ width: '18px', height: '18px' }} />
                  </button>
                  <button
                    title="Align Center"
                    onClick={() => setShowAlignSubMenu(false)}
                    style={{
                      padding: '5px',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <MdOutlineFormatAlignCenter style={{ width: '18px', height: '18px' }} />
                  </button>
                  <button
                    title="Align Right"
                    onClick={() => setShowAlignSubMenu(false)}
                    style={{
                      padding: '5px',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                  >
                    <MdOutlineFormatAlignRight style={{ width: '18px', height: '18px' }} />
                  </button>
                </div>
              )}
            </div>
            <button
              title="Crop Image"
              onClick={handleOpenCropModal}
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <Scissors style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              title="Image Settings"
              onClick={handleOpenImageSettingsModal} // Open Image Settings Modal
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <IoMdSettings style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              title="Image Description/Alt Text"
              onClick={handleOpenImageDescriptionModal}
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <IoTvOutline style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              title="Revert to Original"
              style={{
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'white')}
            >
              <RiRefreshLine style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>
      )}

      <InfoBox
        currentWidth={currentWidth}
        currentHeight={currentHeight}
        // src={src}
        displayedFileSize={displayedFileSize}
        isSelected={isSelected}
        dimensionsInitialized={dimensionsInitialized}
      />

      {isCropModalOpen && entityData && (
        <CropImageModal
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          imageSrc={entityData.originalSrc || entityData.src} // Prefer originalSrc for cropping if available
          onCropComplete={handleCropConfirm}
        />
      )}

      {isImageSettingsModalOpen && entityData && (
        <ImageSettingsModal
          isOpen={isImageSettingsModalOpen}
          onClose={() => setIsImageSettingsModalOpen(false)}
          filters={filters} // Pass filters to the modal
          onApplyFilters={(newFilters) => {
            const entityKey = block.getEntityAt(0);
            if (entityKey) {
              const contentState = editorState.getCurrentContent();
              const newContentState = contentState.mergeEntityData(entityKey, {
                filters: newFilters, // Update filters in entity data
              });
              onChange(Draft.EditorState.push(editorState, newContentState, 'apply-entity'));
            }
            setIsImageSettingsModalOpen(false); // Close modal after applying filters
          }}
          imageSrc={entityData.src}
          loadImage={loadImage}
        />
      )}

      {isDescriptionModalOpen && entityData && (
        <ImageDescriptionModal
          isOpen={isDescriptionModalOpen}
          onClose={handleCloseDescriptionModal}
          imageSrc={entityData.src}
          currentDescription={entityDescriptionFromData}
          onApplyDescription={handleApplyDescription}
          loadImage={loadImage}
        />
      )}
    </div>
  );
};
export default CustomImageComponent;
