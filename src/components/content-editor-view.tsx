'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { BookNode } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger } from '@/components/ui/menubar';
import { Globe } from 'lucide-react';
import { Sparkles, PanelTop, ArrowLeftRight, Wand2, Combine, Download, Settings, Save, FileJson, Upload, Columns, ClipboardPaste } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { EditorState, convertToRaw, convertFromRaw, type RawDraftContentState, type ContentBlock, Modifier, SelectionState, ContentState, AtomicBlockUtils } from 'draft-js';
import { useDebouncedCallback } from 'use-debounce';
import { exportHtml, exportDocx, exportProjectData } from '@/lib/exportUtils'; // exportMarkdown removed
import { saveBookData, loadImage, saveImage } from '@/lib/db';

import { Maximize, Minimize } from 'lucide-react';
import ImageBlock from './ImageBlock'; // Import the new ImageBlock component
import CustomImageComponent from './image-resize-editor/custom-image-component';

const Editor = typeof window !== 'undefined' ? require('react-draft-wysiwyg').Editor : null;

interface ContentEditorViewProps {
  selectedNode: BookNode | null;
  onContentChange: (nodeId: string, newContent: RawDraftContentState) => void;
  scrollToBlockKey: string | null;
  onScrollComplete?: () => void;
  highlightBlockKey: string | null;
  onHighlightComplete?: () => void;
  isToolbarVisible: boolean;
  toggleEditorToolbar: () => void;
  isHeaderMinimized: boolean;
  onToggleHeaderMinimize: () => void;
  isWidePaddingActive: boolean;
  toggleWidePadding: () => void;
  onActiveBlockInViewportChange?: (blockKey: string | null) => void;
  hasAnyChapters: boolean;
  bookData: BookNode | null;
  onTriggerImportProject: () => void;
  onOpenSettings: () => void;
  isLeftSidebarOpen?: boolean;
  toggleLeftSidebar?: () => void;
  toggleRightSidebar?: () => void;
  showInternalBrowser: boolean; // <--- DODAJ OVU LINIJU
  onToggleInternalBrowser: () => void; // <--- DODAJ OVU LINIJU
  onToggleImagePaste: () => void;
  editorRef?: React.Ref<HTMLElement>; // Dodaj novi prop za Ref na urednik (main element)
}

const HIGHLIGHT_DURATION = 1500; // 1.5 seconds

const ContentEditorView = forwardRef(
  (
    {
      selectedNode,
      onContentChange,
      scrollToBlockKey,
      onScrollComplete,
      highlightBlockKey,
      onHighlightComplete,
      isToolbarVisible,
      toggleEditorToolbar,
      isHeaderMinimized,
      onToggleHeaderMinimize,
      isWidePaddingActive,
      toggleWidePadding,
      onActiveBlockInViewportChange,
      hasAnyChapters,
      bookData,
      onTriggerImportProject,
      onOpenSettings,
      isLeftSidebarOpen,
      toggleLeftSidebar,
      //isRightSidebarOpen,
      toggleRightSidebar,
      showInternalBrowser, // <--- za InternalBrowser
      onToggleInternalBrowser, // <--- za InternalBrowser
      onToggleImagePaste,
    }: ContentEditorViewProps,
    ref
  ) => {
    const [editorState, setEditorState] = useState(() => EditorState.createEmpty());
    const [isMounted, setIsMounted] = useState(false);
    const prevNodeIdRef = useRef<string | null | undefined>();
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { toast } = useToast();
    const lastReportedKeyRef = useRef<string | null>(null);

    // Image resizing states
    const [selectedImageBlockKey, setSelectedImageBlockKey] = useState<string | null>(null);
    const [editorLayoutWidth, setEditorLayoutWidth] = useState<number | null>(null);
    const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);
    const editorWrapperRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      handleInsertImage,
    }));

    const toggleFullscreen = useCallback(() => {
      const doc = document as Document & {
        mozCancelFullScreen?: () => Promise<void>;
        webkitExitFullscreen?: () => Promise<void>;
        msExitFullscreen?: () => Promise<void>;
        mozFullScreenElement?: Element;
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
        mozFullScreenEnabled?: boolean;
        webkitFullscreenEnabled?: boolean;
        msFullscreenEnabled?: boolean;
      };
      const element = doc.documentElement as HTMLElement & {
        mozRequestFullScreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };

      const requestFullscreen = element.requestFullscreen || element.mozRequestFullScreen || element.webkitRequestFullscreen || element.msRequestFullscreen;
      const exitFullscreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      const fullscreenElement = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
      const fullscreenEnabled = doc.fullscreenEnabled || doc.mozFullScreenEnabled || doc.webkitFullscreenEnabled || doc.msFullscreenEnabled;

      if (!fullscreenEnabled) {
        toast({
          title: 'Fullscreen Not Supported',
          description: 'Your browser does not support fullscreen mode or it is disabled.',
          variant: 'destructive',
        });
        return;
      }

      if (!fullscreenElement) {
        requestFullscreen
          .call(element)
          .then(() => {
            setIsFullscreen(true);
          })
          .catch((err: Error) => {
            console.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
          });
      } else {
        exitFullscreen.call(doc);
      }
    }, [toast]);

    useEffect(() => {
      if (!isMounted || !Editor) {
        return;
      }

      if (!selectedNode) {
        setEditorState(EditorState.createEmpty());
        prevNodeIdRef.current = null;
        return;
      }

      if (selectedNode.id !== prevNodeIdRef.current) {
        const contentToLoad = selectedNode.content;
        if (contentToLoad && Array.isArray(contentToLoad.blocks) && typeof contentToLoad.entityMap === 'object' && contentToLoad.entityMap !== null) {
          try {
            const rawContent = JSON.parse(JSON.stringify(contentToLoad)); // Deep copy
            const contentState = convertFromRaw(rawContent);
            setEditorState(EditorState.createWithContent(contentState));
          } catch (error) {
            console.error('Error converting from raw content:', error, contentToLoad);
            setEditorState(EditorState.createEmpty());
          }
        } else {
          setEditorState(EditorState.createEmpty());
        }
        prevNodeIdRef.current = selectedNode.id;
        lastReportedKeyRef.current = null;
      }
    }, [selectedNode, isMounted]);

    useEffect(() => {
      if (scrollToBlockKey && isMounted && Editor && editorContainerRef.current) {
        const timeoutId = setTimeout(() => {
          if (!editorContainerRef.current) {
            if (onScrollComplete) onScrollComplete();
            return;
          }

          const targetElement = editorContainerRef.current.querySelector(`div[data-offset-key^="${scrollToBlockKey}-"]`);
          const scrollableContainer = editorContainerRef.current?.querySelector('.rdw-editor-main');

          if (targetElement && scrollableContainer instanceof HTMLElement) {
            const scrollableContainerRect = scrollableContainer.getBoundingClientRect();
            const elementRect = (targetElement as HTMLElement).getBoundingClientRect();
            const topRelativeToContainer = elementRect.top - scrollableContainerRect.top;
            let scrollTopPosition = scrollableContainer.scrollTop + topRelativeToContainer;

            if (scrollTopPosition < 0) {
              scrollTopPosition = 0;
            }

            scrollableContainer.scrollTo({
              top: scrollTopPosition,
              behavior: 'smooth',
            });

            if (onScrollComplete) {
              setTimeout(() => {
                onScrollComplete();
              }, 500);
            }
          } else {
            if (onScrollComplete) {
              onScrollComplete();
            }
          }
        }, 200);
        return () => clearTimeout(timeoutId);
      }
    }, [scrollToBlockKey, isMounted, onScrollComplete, selectedNode, isToolbarVisible]);

    useEffect(() => {
      if (highlightBlockKey && isMounted && Editor && editorContainerRef.current) {
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }

        const targetElement = editorContainerRef.current.querySelector(`div[data-offset-key^="${highlightBlockKey}-"]`) as HTMLElement | null;

        if (targetElement) {
          targetElement.classList.add('editor-block-highlighted');

          highlightTimerRef.current = setTimeout(() => {
            targetElement.classList.remove('editor-block-highlighted');
            if (onHighlightComplete) {
              onHighlightComplete();
            }
            highlightTimerRef.current = null;
          }, HIGHLIGHT_DURATION);
        } else {
          if (onHighlightComplete) {
            onHighlightComplete();
          }
        }
      }
      return () => {
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
          const previousTargetElement = editorContainerRef.current?.querySelector('.editor-block-highlighted');
          previousTargetElement?.classList.remove('editor-block-highlighted');
        }
      };
    }, [highlightBlockKey, isMounted, onHighlightComplete]);

    const handleEditorStateChange = useCallback(
      (newEditorState: EditorState) => {
        setEditorState(newEditorState);
        if (selectedNode) {
          const contentState = newEditorState.getCurrentContent();
          const rawContent = convertToRaw(contentState);

          // Before saving, convert blob URLs back to permanent IDs
          for (const key in rawContent.entityMap) {
            const entity = rawContent.entityMap[key];
            if (entity.type === 'IMAGE' && entity.data.src) {
              // Check if it's a blob URL from direct paste or upload
              if (entity.data.src.startsWith('blob:')) {
                const permanentId = entity.data.dbId;
                if (permanentId) {
                  entity.data.src = permanentId;
                  delete entity.data.dbId; // Clean up temporary attribute
                } else {
                  console.warn('Blob URL not found in entity.data.dbId during save:', entity.data.src);
                }
              }
            }
          }

          if (selectedNode.id === prevNodeIdRef.current) {
            onContentChange(selectedNode.id, rawContent);
          }
        }
      },
      [selectedNode, onContentChange]
    );

    const detectActiveBlock = useCallback(() => {
      if (!editorContainerRef.current || !onActiveBlockInViewportChange || !selectedNode) return;

      const scrollableContainer = editorContainerRef.current.querySelector('.rdw-editor-main');
      if (!scrollableContainer) return;

      const viewportTop = scrollableContainer.getBoundingClientRect().top;

      const blockElements = Array.from(scrollableContainer.querySelectorAll('div[data-offset-key]')) as HTMLElement[];

      let bestMatch: { blockKey: string; top: number } | null = null;

      for (const el of blockElements) {
        const offsetKeyAttr = el.getAttribute('data-offset-key');
        if (!offsetKeyAttr) continue;

        const blockKey = offsetKeyAttr.split('-')[0];
        if (!blockKey) continue;

        const contentState = editorState.getCurrentContent();
        const blockInState = contentState.getBlockForKey(blockKey);
        if (!blockInState) continue;

        const blockType = blockInState.getType();
        if (!['header-two', 'header-three', 'header-four', 'header-five'].includes(blockType)) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        const elementTopRelativeToViewport = rect.top - viewportTop;

        if (elementTopRelativeToViewport <= 50) {
          if (
            !bestMatch ||
            elementTopRelativeToViewport > bestMatch.top ||
            (elementTopRelativeToViewport === bestMatch.top &&
              rect.top > (scrollableContainer.querySelector(`div[data-offset-key^="${bestMatch.blockKey}-"]`)?.getBoundingClientRect().top || -Infinity))
          ) {
            if (!bestMatch || bestMatch.top < 0 || elementTopRelativeToViewport >= 0) {
              bestMatch = { blockKey, top: elementTopRelativeToViewport };
            }
          }
        }
      }

      if (bestMatch && bestMatch.blockKey !== lastReportedKeyRef.current) {
        onActiveBlockInViewportChange(bestMatch.blockKey);
        lastReportedKeyRef.current = bestMatch.blockKey;
      } else if (!bestMatch && lastReportedKeyRef.current !== null) {
        onActiveBlockInViewportChange(null);
        lastReportedKeyRef.current = null;
      }
    }, [editorState, onActiveBlockInViewportChange, selectedNode]);

    const debouncedDetectActiveBlock = useDebouncedCallback(detectActiveBlock, 250);

    // Image resizing helper functions
    const updateEditorLayoutWidth = useCallback(() => {
      if (editorWrapperRef.current) {
        const editorMainElement = editorWrapperRef.current.querySelector('.rdw-editor-main');
        let calculatedWidth: number | null = null;

        if (editorMainElement) {
          const width = editorMainElement.clientWidth;
          const styles = window.getComputedStyle(editorMainElement);
          const paddingLeft = parseFloat(styles.paddingLeft) || 0;
          const paddingRight = parseFloat(styles.paddingRight) || 0;
          const effectiveWidth = width - paddingLeft - paddingRight;
          if (effectiveWidth > 0) {
            calculatedWidth = effectiveWidth;
          }
        } else {
          const wrapperWidth = editorWrapperRef.current.clientWidth;
          if (wrapperWidth > 0) {
            calculatedWidth = wrapperWidth;
          }
        }

        if (calculatedWidth !== null && calculatedWidth !== editorLayoutWidth) {
          setEditorLayoutWidth(calculatedWidth);
        }
      }
    }, [editorLayoutWidth]);

    const handleSelectAtomicBlock = useCallback(
      (blockKey: string) => {
        const currentSelection = editorState.getSelection();
        const contentState = editorState.getCurrentContent();
        const block = contentState.getBlockForKey(blockKey);

        if (block && block.getType() === 'atomic') {
          const entityKey = block.getEntityAt(0);
          if (entityKey && contentState.getEntity(entityKey).getType() === 'IMAGE') {
            if (selectedImageBlockKey === blockKey && currentSelection.getHasFocus() && currentSelection.getAnchorKey() === blockKey) {
              return;
            }

            const selection = SelectionState.createEmpty(blockKey).merge({
              anchorOffset: 0,
              focusOffset: 0,
              hasFocus: true,
            });

            const newEditorState = EditorState.forceSelection(editorState, selection);
            setEditorState(newEditorState);
            setSelectedImageBlockKey(blockKey);
          } else {
            if (selectedImageBlockKey !== null) {
              setSelectedImageBlockKey(null);
            }
          }
        } else {
          if (selectedImageBlockKey !== null) {
            setSelectedImageBlockKey(null);
          }
        }
      },
      [editorState, selectedImageBlockKey]
    );

    const handleDocumentMouseDown = useCallback(
      (event: MouseEvent) => {
        const targetElement = event.target as HTMLElement;
        const currentSelection = editorState.getSelection();

        if (isAnyModalOpen) {
          return;
        }

        if (!selectedImageBlockKey) {
          return;
        }

        // Allow interaction with RDW modals/dropdowns without deselecting
        if (targetElement.closest('.rdw-modal, .rdw-image-modal, .rdw-link-modal, .rdw-embedded-modal, .rdw-dropdownoptionwrapper, [class*="rdw-colorpicker"]')) {
          return;
        }

        // Check if the click is on the currently selected CustomImageComponent or its handles
        const clickedOnSelectedImageItself = targetElement.closest(`[data-custom-image-block-key="${selectedImageBlockKey}"]`);
        const isClickOnResizeHandle = targetElement.hasAttribute('aria-label') && targetElement.getAttribute('aria-label')?.startsWith('Resize image');

        if (clickedOnSelectedImageItself || isClickOnResizeHandle) {
          // Ensure Draft.js focus is on the block if it's not already
          if (currentSelection.getAnchorKey() !== selectedImageBlockKey || !currentSelection.getHasFocus()) {
            const selection = SelectionState.createEmpty(selectedImageBlockKey).merge({
              anchorOffset: 0,
              focusOffset: 0,
              hasFocus: true,
            });
            const newEditorState = EditorState.forceSelection(editorState, selection);
            setEditorState(newEditorState);
          }
          return;
        }

        // If the click is outside the editor wrapper, deselect
        const editorWrapper = editorWrapperRef.current;
        if (editorWrapper && !editorWrapper.contains(targetElement)) {
          setSelectedImageBlockKey(null);
          return;
        }

        // If the click is inside the main editor area (but not on the image itself), deselect
        const editorMainArea = editorWrapper?.querySelector('.rdw-editor-main');
        if (editorMainArea && editorMainArea.contains(targetElement)) {
          const currentContent = editorState.getCurrentContent();
          const blockToDeselect = selectedImageBlockKey ? currentContent.getBlockForKey(selectedImageBlockKey) : null;

          if (blockToDeselect) {
            const blockBefore = currentContent.getBlockBefore(selectedImageBlockKey);
            const blockAfter = currentContent.getBlockAfter(selectedImageBlockKey);

            let targetSelection: SelectionState | null = null;

            if (blockAfter) {
              targetSelection = SelectionState.createEmpty(blockAfter.getKey()).merge({
                anchorOffset: 0,
                focusOffset: 0,
                hasFocus: true,
              });
            } else if (blockBefore) {
              targetSelection = SelectionState.createEmpty(blockBefore.getKey()).merge({
                anchorOffset: blockBefore.getLength(),
                focusOffset: blockBefore.getLength(),
                hasFocus: true,
              });
            }

            setEditorState(targetSelection ? EditorState.forceSelection(editorState, targetSelection) : editorState);
            setSelectedImageBlockKey(null);
          } else {
            setSelectedImageBlockKey(null);
          }
          return;
        }

        // If click is on editor UI (e.g. toolbar) but not main content or outside, retain selection
        if (editorWrapper && editorWrapper.contains(targetElement)) {
          return;
        }
      },
      [editorState, selectedImageBlockKey, isAnyModalOpen]
    );

    const handleModalOpenChange = useCallback((isOpen: boolean) => {
      setIsAnyModalOpen(isOpen);
    }, []);

    useEffect(() => {
      setIsMounted(true);

      // Add document mouse down handler for image deselection
      document.addEventListener('mousedown', handleDocumentMouseDown);

      // Update editor layout width
      setTimeout(() => updateEditorLayoutWidth(), 100);
      window.addEventListener('resize', updateEditorLayoutWidth);

      return () => {
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }
        document.removeEventListener('mousedown', handleDocumentMouseDown);
        window.removeEventListener('resize', updateEditorLayoutWidth);
      };
    }, [handleDocumentMouseDown, updateEditorLayoutWidth]);

    useEffect(() => {
      const scrollable = editorContainerRef.current?.querySelector('.rdw-editor-main');
      if (scrollable && onActiveBlockInViewportChange) {
        scrollable.addEventListener('scroll', debouncedDetectActiveBlock);
        detectActiveBlock();
        return () => {
          scrollable.removeEventListener('scroll', debouncedDetectActiveBlock);
        };
      }
    }, [debouncedDetectActiveBlock, onActiveBlockInViewportChange, detectActiveBlock, editorContainerRef]);

    const handleInsertImage = useCallback(
      async (imageId: string) => {
        console.log('handleInsertImage: Attempting to insert image with ID:', imageId);
        const blob = await loadImage(imageId);
        if (!blob) {
          console.error('Pasted image could not be loaded from DB');
          toast({
            title: 'Error',
            description: 'Could not insert pasted image.',
            variant: 'destructive',
          });
          return;
        }
        const imageUrl = URL.createObjectURL(blob);
        console.log('handleInsertImage: Generated blob URL:', imageUrl);

        const contentState = editorState.getCurrentContent();
        const contentStateWithEntity = contentState.createEntity('IMAGE', 'IMMUTABLE', {
          src: imageUrl, // Store the blob URL for immediate display
          dbId: imageId, // Store the permanent ID for persistence
        });
        const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
        const newEditorState = EditorState.set(editorState, { currentContent: contentStateWithEntity });
        const finalEditorState = AtomicBlockUtils.insertAtomicBlock(newEditorState, entityKey, ' ');
        handleEditorStateChange(finalEditorState);
        console.log('handleInsertImage: Image entity created and inserted into editor with src:', imageUrl);
      },
      [editorState, handleEditorStateChange, toast]
    );

    const uploadImageCallBack = useCallback((file: File): Promise<{ data: { link: string } }> => {
      return new Promise((resolve, reject) => {
        const imageId = `img_${Date.now()}`;
        saveImage(imageId, file)
          .then(() => {
            resolve({ data: { link: imageId } }); // Resolve with the imageId directly
          })
          .catch((error: Error) => {
            console.error('Error saving image during upload:', error);
            reject(error);
          });
      });
    }, []);

    const handleFormatMarkdown = useCallback(() => {
      if (!selectedNode) return;

      let currentContent = editorState.getCurrentContent();
      let contentWasModified = false;

      const originalBlocks = currentContent.getBlockMap().valueSeq().toArray();
      const newBlocksArray: ContentBlock[] = [];

      originalBlocks.forEach((block) => {
        const blockText = block.getText();
        const blockKey = block.getKey();
        let newContentStateForBlock = currentContent;

        if (blockText.startsWith('##### ')) {
          const prefix = '##### ';
          const selectionForPrefixRemoval = SelectionState.createEmpty(blockKey).merge({
            anchorOffset: 0,
            focusOffset: prefix.length,
          });
          newContentStateForBlock = Modifier.replaceText(newContentStateForBlock, selectionForPrefixRemoval, '');

          const typeSelection = SelectionState.createEmpty(blockKey).merge({
            anchorOffset: 0,
            focusOffset: newContentStateForBlock.getBlockForKey(blockKey).getText().length,
          });
          newContentStateForBlock = Modifier.setBlockType(newContentStateForBlock, typeSelection, 'indented-text-h5-style');
          contentWasModified = true;
        } else {
          const headingDefs = [
            { type: 'header-two', prefix: '## ' },
            { type: 'header-three', prefix: '### ' },
            { type: 'header-four', prefix: '#### ' },
            { type: 'header-six', prefix: '###### ' },
          ];
          for (const def of headingDefs) {
            if (blockText.startsWith(def.prefix)) {
              const selectionForPrefixRemoval = SelectionState.createEmpty(blockKey).merge({
                anchorOffset: 0,
                focusOffset: def.prefix.length,
              });
              newContentStateForBlock = Modifier.replaceText(newContentStateForBlock, selectionForPrefixRemoval, '');

              const typeSelection = SelectionState.createEmpty(blockKey).merge({
                anchorOffset: 0,
                focusOffset: newContentStateForBlock.getBlockForKey(blockKey).getText().length,
              });
              newContentStateForBlock = Modifier.setBlockType(newContentStateForBlock, typeSelection, def.type);
              contentWasModified = true;
              break;
            }
          }
        }

        currentContent = newContentStateForBlock;
        let currentBlockAfterTypeChange = currentContent.getBlockForKey(blockKey);
        let textForStyling = currentBlockAfterTypeChange.getText();

        const currentBlockType = currentBlockAfterTypeChange.getType();
        if (
          currentBlockType !== 'header-two' &&
          currentBlockType !== 'header-three' &&
          currentBlockType !== 'header-four' &&
          currentBlockType !== 'header-six' &&
          currentBlockType !== 'indented-text-h5-style'
        ) {
          if (textForStyling.startsWith('T: ') || textForStyling.startsWith('P: ')) {
            if (currentBlockType !== 'compact-paragraph') {
              const typeSelection = SelectionState.createEmpty(blockKey).merge({
                anchorOffset: 0,
                focusOffset: textForStyling.length,
              });
              currentContent = Modifier.setBlockType(currentContent, typeSelection, 'compact-paragraph');
              contentWasModified = true;
            }
          }
        }

        currentBlockAfterTypeChange = currentContent.getBlockForKey(blockKey);
        textForStyling = currentBlockAfterTypeChange.getText();

        const boldRegex = /\*\*(.*?)\*\*/g;
        let match;
        const boldMatches = [];
        while ((match = boldRegex.exec(textForStyling)) !== null) {
          boldMatches.push(match);
        }

        if (boldMatches.length > 0) {
          for (let i = boldMatches.length - 1; i >= 0; i--) {
            const currentMatch = boldMatches[i];
            const textWithAsterisks = currentMatch[0];
            const justTextToBold = currentMatch[1];
            const matchStartIndex = currentMatch.index;

            const selectionToReplace = SelectionState.createEmpty(blockKey).merge({
              anchorOffset: matchStartIndex,
              focusOffset: matchStartIndex + textWithAsterisks.length,
            });
            currentContent = Modifier.replaceText(currentContent, selectionToReplace, justTextToBold);

            const blockAfterReplace = currentContent.getBlockForKey(blockKey);
            const selectionToStyle = SelectionState.createEmpty(blockKey).merge({
              anchorOffset: matchStartIndex,
              focusOffset: matchStartIndex + justTextToBold.length,
            });
            if (selectionToStyle.getEndOffset() <= blockAfterReplace.getText().length) {
              currentContent = Modifier.applyInlineStyle(currentContent, selectionToStyle, 'BOLD');
            }
          }
          contentWasModified = true;
        }

        newBlocksArray.push(currentContent.getBlockForKey(blockKey));
      });

      const finalNonEmptyBlocks = newBlocksArray.filter((b) => b.getText().trim() !== '');
      if (finalNonEmptyBlocks.length !== newBlocksArray.length && newBlocksArray.length > 0) {
        contentWasModified = true;
      } else if (newBlocksArray.length === 0 && originalBlocks.length > 0 && originalBlocks.some((b) => b.getText().trim() !== '')) {
        contentWasModified = true;
      }

      if (contentWasModified) {
        const newContentStateFromTransformed = ContentState.createFromBlockArray(finalNonEmptyBlocks, currentContent.getEntityMap());
        let newEditorStateWithChanges = EditorState.push(editorState, newContentStateFromTransformed, 'change-block-data');

        const currentSelection = editorState.getSelection();
        if (newContentStateFromTransformed.getBlockMap().size > 0 && newContentStateFromTransformed.getBlockMap().has(currentSelection.getStartKey())) {
          const oldBlock = editorState.getCurrentContent().getBlockForKey(currentSelection.getStartKey());
          const newBlock = newContentStateFromTransformed.getBlockForKey(currentSelection.getStartKey());
          if (oldBlock && newBlock) {
            const newOffset = Math.min(currentSelection.getAnchorOffset(), newBlock.getText().length);
            const newFocus = Math.min(currentSelection.getFocusOffset(), newBlock.getText().length);
            const refinedSelection = currentSelection.merge({
              anchorOffset: newOffset,
              focusOffset: newFocus,
            });
            newEditorStateWithChanges = EditorState.forceSelection(newEditorStateWithChanges, refinedSelection);
          } else {
            newEditorStateWithChanges = EditorState.moveFocusToEnd(newEditorStateWithChanges);
          }
        } else if (newContentStateFromTransformed.getBlockMap().size > 0) {
          newEditorStateWithChanges = EditorState.moveFocusToEnd(newEditorStateWithChanges);
        } else {
          const emptyContentState = ContentState.createFromText('');
          newEditorStateWithChanges = EditorState.push(editorState, emptyContentState, 'remove-range');
          newEditorStateWithChanges = EditorState.forceSelection(newEditorStateWithChanges, emptyContentState.getSelectionAfter());
        }

        setEditorState(newEditorStateWithChanges);
        onContentChange(selectedNode.id, convertToRaw(newEditorStateWithChanges.getCurrentContent()));
        toast({
          title: 'Formatting Applied',
          description: 'Markdown formatted, H5 styled, conversational text adjusted, and empty lines removed.',
        });
      } else {
        toast({
          title: 'No Changes',
          description: 'No patterns for formatting or empty lines were found.',
        });
      }
    }, [editorState, selectedNode, onContentChange, setEditorState, toast]);

    const handleCleanAndNormalizeContent = useCallback(() => {
      if (!selectedNode) return;
      let currentContent = editorState.getCurrentContent();

      try {
        const rawBefore = convertToRaw(currentContent);
        const normalizedContentState = convertFromRaw(rawBefore);
        const rawAfter = convertToRaw(normalizedContentState);
        const actualChangeMade = JSON.stringify(rawBefore) !== JSON.stringify(rawAfter);

        if (!actualChangeMade && currentContent.getBlockMap().equals(normalizedContentState.getBlockMap())) {
          toast({ title: 'No Changes', description: 'Content was already normalized.' });
          return;
        }

        currentContent = normalizedContentState;
      } catch (e) {
        console.error('handleCleanAndNormalizeContent: Error during content normalization:', e);
        toast({
          title: 'Error',
          description: 'An error occurred while normalizing content.',
          variant: 'destructive',
        });
        return;
      }

      const newEditorState = EditorState.push(editorState, currentContent, 'insert-fragment');

      const finalEditorState = EditorState.forceSelection(newEditorState, newEditorState.getCurrentContent().getSelectionAfter());

      setEditorState(finalEditorState);
      onContentChange(selectedNode.id, convertToRaw(finalEditorState.getCurrentContent()));
      toast({ title: 'Content Normalized', description: 'Attempted to merge redundant formatting.' });
    }, [editorState, selectedNode, onContentChange, toast, setEditorState]);

    const isContentEffectivelyEmpty = useMemo(() => {
      if (!selectedNode || !selectedNode.content) return true;
      const { blocks, entityMap } = selectedNode.content;

      if (!blocks || blocks.length === 0) return true;

      if (blocks.length === 1) {
        const block = blocks[0];
        const textIsEmpty = block.text.trim() === '';
        const typeIsUnstyled = block.type === 'unstyled';
        const noInlineStyles = !block.inlineStyleRanges || block.inlineStyleRanges.length === 0;
        const noEntityRanges = !block.entityRanges || block.entityRanges.length === 0;
        const noBlockData = !block.data || Object.keys(block.data).length === 0;

        if (block.type === 'atomic') {
          return false;
        }

        if (textIsEmpty && typeIsUnstyled && noInlineStyles && noEntityRanges && noBlockData) {
          const noEntitiesInMap = !entityMap || Object.keys(entityMap).length === 0;
          if (noEntitiesInMap) return true;
        }
      }
      return false;
    }, [selectedNode]);

    const areFormattingButtonsDisabled = useMemo(() => {
      return !hasAnyChapters || !selectedNode || isContentEffectivelyEmpty;
    }, [hasAnyChapters, selectedNode, isContentEffectivelyEmpty]);

    // Handlers for File Menu
    const handleDocumentExport = async (format: 'html' | 'md' | 'docx') => {
      if (!bookData) {
        toast({
          title: 'Export Error',
          description: 'No book data available to export.',
          variant: 'destructive',
        });
        return;
      }
      try {
        toast({
          title: 'Exporting...',
          description: `Your document is being prepared as a ${format.toUpperCase()} file (including Table of Contents).`,
        });
        if (format === 'html') {
          await exportHtml(bookData);
        } else if (format === 'md') {
          // Dynamically import and call the markdown export function
          const { exportMarkdown } = await import('@/lib/exportUtils'); // Keep this as is, or adjust if exportMarkdown is now in a different client util
          if (exportMarkdown) {
            await exportMarkdown(bookData);
          } else {
            throw new Error('Markdown export function not found.');
          }
        } else if (format === 'docx') {
          await exportDocx(bookData);
        }
        toast({
          title: 'Export Successful',
          description: `Document exported as ${format.toUpperCase()}.`,
          variant: 'default',
        });
      } catch (error) {
        console.error(`Error exporting to ${format}:`, error);
        toast({
          title: 'Export Failed',
          description: `An error occurred while exporting to ${format.toUpperCase()}.`,
          variant: 'destructive',
        });
      }
    };

    const handleSaveProject = async () => {
      if (!bookData) {
        toast({
          title: 'Error Saving Project',
          description: 'No book data available to save.',
          variant: 'destructive',
        });
        return;
      }
      try {
        await saveBookData(bookData);
        toast({
          title: 'Project Saved',
          description: 'Your project has been successfully saved. (Auto-save is also active)',
          variant: 'default',
        });
      } catch (error) {
        console.error('Error manually saving project:', error);
        toast({
          title: 'Save Failed',
          description: 'An error occurred while saving the project.',
          variant: 'destructive',
        });
      }
    };

    const handleExportProjectFile = () => {
      if (!bookData) {
        toast({
          title: 'Export Error',
          description: 'No project data available to export.',
          variant: 'destructive',
        });
        return;
      }
      try {
        exportProjectData(bookData);
        toast({
          title: 'Project Exported',
          description: `Project data saved as .myBookHelper.json file.`,
          variant: 'default',
        });
      } catch (error) {
        console.error('Error exporting project data:', error);
        toast({
          title: 'Export Failed',
          description: 'An error occurred while exporting project data.',
          variant: 'destructive',
        });
      }
    };

    const handleToggleBothSidebars = () => {
      if (toggleLeftSidebar) toggleLeftSidebar();
      if (toggleRightSidebar) toggleRightSidebar();
    };

    if (!isMounted || !Editor) {
      return (
        <Card className="h-full w-full flex flex-col shadow-lg rounded-lg">
          <CardHeader className="border-b p-1.5">
            <div className="flex justify-start w-full mb-1">{/* Placeholder for File Menu if needed */}</div>
            <div className="flex justify-center items-center">{/* Placeholder for buttons if needed when editor not loaded, or keep empty */}</div>
          </CardHeader>
          <CardContent className="flex-1 p-6 flex items-center justify-center">
            <p className="text-muted-foreground font-body">Loading editor...</p>
          </CardContent>
        </Card>
      );
    }

    if (!selectedNode) {
      return (
        <Card className="h-full w-full flex flex-col shadow-lg rounded-lg">
          <CardHeader className="border-b p-1.5">
            <div className="flex justify-start w-full mb-1">{/* Placeholder for File Menu if needed */}</div>
            <div className="flex justify-center items-center">{/* Placeholder for buttons if needed when no node selected, or keep empty */}</div>
          </CardHeader>
          <CardContent className="flex-1 p-6 flex items-center justify-center">
            <p className="text-muted-foreground font-body">Select an item to view or edit its content.</p>
          </CardContent>
        </Card>
      );
    }

    const editorProps = {
      editorState: editorState,
      onEditorStateChange: handleEditorStateChange,
      readOnly: isAnyModalOpen,
      editorKey: selectedNode.id || 'default-editor-key',
      blockRendererFn: (block: ContentBlock) => {
        if (block.getType() === 'atomic') {
          const contentState = editorState.getCurrentContent();
          const entityKey = block.getEntityAt(0);
          if (!entityKey) {
            return null;
          }

          const entity = contentState.getEntity(entityKey);
          const entityType = entity.getType();

          if (entityType === 'IMAGE') {
            const finalIsSelected = selectedImageBlockKey === block.getKey() && editorState.getSelection().getHasFocus();

            return {
              component: CustomImageComponent,
              editable: false,
              props: {
                editorState: editorState,
                onChange: handleEditorStateChange,
                entityData: entity.getData(),
                isSelected: finalIsSelected,
                onSelect: () => handleSelectAtomicBlock(block.getKey()),
                editorLayoutWidth: editorLayoutWidth,
                onModalOpenChange: handleModalOpenChange,
                loadImage: loadImage,
              },
            };
          }

          // Fall back to ImageBlock for other atomic types
          return { component: ImageBlock, editable: false };
        }
        return null;
      },
      wrapperClassName: 'compose-write-editor-wrapper',
      toolbarClassName: 'demo-toolbar-custom',
      // toolbarClassName: 'rdw-editor-toolbar',
      editorClassName: cn('rdw-editor-main', { 'wide-padding-active': isWidePaddingActive }),
      toolbarHidden: !isToolbarVisible,
      toolbar: {
        options: [ 'inline', 'blockType', 'fontSize', 'fontFamily', 'list', 'textAlign', 'colorPicker', 'link', 'embedded', 'emoji', 'image', 'remove', 'history'],
        inline: {
          inDropdown: false,
          options: ['bold', 'italic', 'underline', 'strikethrough', 'monospace', 'superscript', 'subscript'],
        },
        blockType: {
          inDropdown: true,
          options: ['Normal', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Blockquote', 'Code', 'compact-paragraph', 'indented-text-h5-style'],
        },
        fontSize: { options: [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72, 96] },
        fontFamily: {
          options: ['Arial', 'Georgia', 'Impact', 'Tahoma', 'Times New Roman', 'Verdana', 'Literata', 'Belleza'],
        },
        list: { inDropdown: false, options: ['unordered', 'ordered', 'indent', 'outdent'] },
        textAlign: { inDropdown: false, options: ['left', 'center', 'right', 'justify'] },
        colorPicker: { className: undefined, component: undefined, popupClassName: undefined },
        link: { inDropdown: false, showOpenOptionOnMouseOver: true, defaultTargetOption: '_blank' },
        emoji: { className: undefined, component: undefined, popupClassName: undefined },
        embedded: {
          className: undefined,
          component: undefined,
          popupClassName: undefined,
          defaultSize: { height: 'auto', width: 'auto' },
        },
        image: {
          uploadCallback: uploadImageCallBack,
          alt: { present: true, mandatory: false },
          previewImage: true,
          inputAccept: 'image/gif,image/jpeg,image/jpg,image/png,image/svg',
          defaultSize: { height: 'auto', width: 'auto' },
        },
        remove: { className: undefined, component: undefined },
        history: { inDropdown: false, options: ['undo', 'redo'] },
      },
    };

    return (
      <Card className="h-full w-full flex flex-col shadow-lg rounded-lg">
        <CardHeader className={cn('border-b pt-0 pb-1.5 px-1.5 flex flex-row items-center gap-1', isLeftSidebarOpen === false && 'pl-14')}>
          <Menubar className="h-8 border-0 shadow-none p-0 bg-transparent flex items-center" style={{ marginTop: '4px' }}>
            <MenubarMenu>
              <MenubarTrigger
                className={cn(
                  'flex cursor-default select-none items-center outline-none',
                  'px-2 py-1 text-sm font-medium h-8',
                  'border border-input bg-background text-foreground',
                  'rounded-md shadow-md',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  'data-[state=open]:bg-background data-[state=open]:text-foreground'
                )}
              >
                File
              </MenubarTrigger>
              <MenubarContent alignOffset={-4} sideOffset={4}>
                <MenubarItem onClick={handleSaveProject} disabled={!bookData}>
                  <Save className="mr-2 h-4 w-4" /> Save Project
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={handleExportProjectFile} disabled={!bookData}>
                  <FileJson className="mr-2 h-4 w-4" /> Export Project (.json)
                </MenubarItem>
                <MenubarItem onClick={onTriggerImportProject}>
                  <Upload className="mr-2 h-4 w-4" /> Import Project (.json)
                </MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger disabled={!bookData}>
                    <Download className="mr-2 h-4 w-4" /> Export As Document
                  </MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarItem onClick={() => handleDocumentExport('docx')} disabled={!bookData}>
                      Word (.docx)
                    </MenubarItem>
                    <MenubarItem onClick={() => handleDocumentExport('html')} disabled={!bookData}>
                      HTML (.html)
                    </MenubarItem>
                    <MenubarItem onClick={() => handleDocumentExport('md')} disabled={!bookData}>
                      Markdown (.md)
                    </MenubarItem>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem onClick={onOpenSettings}>
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>

          <div className="flex-1 flex justify-center items-center">
            <div className="flex items-center flex-shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCleanAndNormalizeContent}
                title="Clean and Normalize Content (attempts to merge redundant formatting)"
                aria-label="Clean and Normalize Content (attempts to merge redundant formatting)"
                className="h-8 w-8"
                disabled={areFormattingButtonsDisabled}
              >
                <Combine className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleBothSidebars}
                title="Toggle Both Side Panels"
                aria-label="Toggle Both Side Panels"
                className="h-8 w-8"
                disabled={!toggleLeftSidebar || !toggleRightSidebar}
              >
                <Columns className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFormatMarkdown}
                title="Format: H2-H6, H5 style (indented, normal font), Bold, Conversational style (compact), Remove empty lines"
                aria-label="Format Markdown: H2-H6 headings, H5 as indented text normal size, **bold**, 'T:'/'P:' compact, remove empty lines"
                className="h-8 w-8"
                disabled={areFormattingButtonsDisabled}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleWidePadding}
                title={isWidePaddingActive ? 'Switch to narrow padding' : 'Switch to wide padding'}
                aria-label={isWidePaddingActive ? 'Activate narrow editor padding' : 'Activate wide editor padding'}
                className="h-8 w-8"
              >
                <ArrowLeftRight className={cn('h-4 w-4', isWidePaddingActive && 'text-accent')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleEditorToolbar}
                title={isToolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
                aria-label={isToolbarVisible ? 'Hide editor toolbar' : 'Show editor toolbar'}
                className="h-8 w-8"
              >
                <Sparkles className={cn('h-4 w-4', !isToolbarVisible && 'text-muted-foreground')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleHeaderMinimize}
                title={isHeaderMinimized ? 'Maximize header' : 'Minimize header'}
                aria-label={isHeaderMinimized ? 'Maximize header space' : 'Minimize header space'}
                className="h-8 w-8"
              >
                <PanelTop className={cn('h-4 w-4', isHeaderMinimized && 'text-muted-foreground')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                className="h-8 w-8"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onToggleImagePaste} title="Paste Image from Clipboard" aria-label="Paste Image from Clipboard" className="h-8 w-8">
                <ClipboardPaste className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleInternalBrowser} // Koristi proslijeđenu funkciju
                title={showInternalBrowser ? 'Hide an internal browser' : 'Show an internal browser'}
                aria-label={showInternalBrowser ? 'Hide an internal browser' : 'Show an internal browser'}
                className="h-8 w-8"
                // Ovdje možeš dodati disabled={isLeftSidebarOpen && isRightSidebarOpen}
                // ako želiš onemogućiti gumb kada su obje bočne trake otvorene.
                // Logika poruke već postoji u onToggleInternalBrowser.
              >
                {/* Ovdje stavi ikonu, npr. <Globe className="h-4 w-4" /> */}
                {/* Provjeri jesi li uvezao Globe ikonu iz 'lucide-react' */}
                <Globe className={cn('h-4 w-4', showInternalBrowser && 'text-accent')} /> {/* Primjer s dinamičkom bojom */}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent ref={editorContainerRef} id="editor-container-for-scroll" className="flex-1 flex flex-col p-0 relative">
          <div ref={editorWrapperRef} className="h-full w-full">
            {Editor && <Editor {...editorProps} />}
          </div>
        </CardContent>
      </Card>
    );
  }
);

ContentEditorView.displayName = 'ContentEditorView';

export default ContentEditorView;
