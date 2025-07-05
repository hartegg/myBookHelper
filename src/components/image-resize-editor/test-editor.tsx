'use client';

import React from 'react';
import * as Draft from 'draft-js';
import dynamic from 'next/dynamic';
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';
import CustomImageComponent from './custom-image-component';
import { List as ImmutableList, Map as ImmutableMap } from 'immutable'; // Added this import
import { SyntheticKeyboardEvent } from 'react-draft-wysiwyg';
import * as Immutable from 'immutable';

const WysiwygEditor = dynamic(() => import('react-draft-wysiwyg').then((mod) => mod.Editor), {
  ssr: false,
});

const initialEditorContentRaw: Draft.RawDraftContentState = {
  blocks: [
    {
      key: Draft.genKey(),
      text: 'Simple test content.',
      type: 'unstyled',
      depth: 0,
      inlineStyleRanges: [],
      entityRanges: [],
      data: {},
    },
  ],
  entityMap: {},
};

interface TestEditorState {
  editorState: Draft.EditorState;
  isMounted: boolean;
  selectedImageBlockKey: string | null;
  editorLayoutWidth: number | null;
  isAnyModalOpen: boolean; // New state to track if any modal is open
}

interface EditorInstanceRef {
  focusEditor(): void;
  focus(): void;
}

class TestEditor extends React.Component<{}, TestEditorState> {
  // Added comment to force rebuild
  private editorRef: React.RefObject<EditorInstanceRef> = React.createRef();
  private editorWrapperRef = React.createRef<HTMLDivElement>();

  constructor(props: Record<string, never>) {
    super(props);
    let initialEditorState;
    if (typeof window !== 'undefined') {
      try {
        const contentState = Draft.convertFromRaw(initialEditorContentRaw);
        initialEditorState = Draft.EditorState.createWithContent(contentState);
      } catch (e) {
        console.error('Error creating initial editor state:', e);
        initialEditorState = Draft.EditorState.createEmpty();
      }
    } else {
      initialEditorState = Draft.EditorState.createEmpty();
    }
    this.state = {
      editorState: initialEditorState,
      isMounted: false,
      selectedImageBlockKey: null,
      editorLayoutWidth: null,
      isAnyModalOpen: false,
    };
  }

  componentDidMount() {
    this.setState({ isMounted: true });
    document.addEventListener('mousedown', this.handleDocumentMouseDown);
    setTimeout(() => this.updateEditorLayoutWidth(), 100);
    window.addEventListener('resize', this.updateEditorLayoutWidth);
    setTimeout(() => this.focusEditor('componentDidMount_delayed'), 200);
  }

  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleDocumentMouseDown);
    window.removeEventListener('resize', this.updateEditorLayoutWidth);
  }

  private handleDocumentMouseDown = (event: MouseEvent) => {
    const targetElement = event.target as HTMLElement;
    const { selectedImageBlockKey, editorState, isAnyModalOpen } = this.state;

    if (isAnyModalOpen) {
      console.log('[TestEditor handleDocumentMouseDown] Modal is open. Ignoring document mousedown.');
      return;
    }
    const currentSelection = editorState.getSelection();

    console.log('[TestEditor handleDocumentMouseDown] Initiated. Target: ', targetElement, 'SelectedKey:', selectedImageBlockKey);

    if (!selectedImageBlockKey) {
      console.log('[TestEditor handleDocumentMouseDown] No image selected. Exiting.');
      return;
    }

    // Allow interaction with RDW modals/dropdowns without deselecting
    if (targetElement.closest('.rdw-modal, .rdw-image-modal, .rdw-link-modal, .rdw-embedded-modal, .rdw-dropdownoptionwrapper, [class*="rdw-colorpicker"]')) {
      console.log('[TestEditor handleDocumentMouseDown] Clicked on RDW modal/dropdown. Ignoring.');
      return;
    }

    // Check if the click is on the currently selected CustomImageComponent or its handles
    const clickedOnSelectedImageItself = targetElement.closest(`[data-custom-image-block-key="${selectedImageBlockKey}"]`);
    const isClickOnResizeHandle = targetElement.hasAttribute('aria-label') && targetElement.getAttribute('aria-label')?.startsWith('Resize image');

    if (clickedOnSelectedImageItself || isClickOnResizeHandle) {
      console.log('[TestEditor handleDocumentMouseDown] Clicked ON the CustomImageComponent or its handles. Retaining selection.');
      // Ensure Draft.js focus is on the block if it's not already
      if (currentSelection.getAnchorKey() !== selectedImageBlockKey || !currentSelection.getHasFocus()) {
        this.handleSelectAtomicBlock(selectedImageBlockKey);
      }
      return;
    }

    // If the click is outside the editor wrapper, deselect
    const editorWrapper = this.editorWrapperRef.current;
    if (editorWrapper && !editorWrapper.contains(targetElement)) {
      console.log('[TestEditor handleDocumentMouseDown] Clicked OUTSIDE editor wrapper. Deselecting image.');
      this.setState({ selectedImageBlockKey: null });
      return;
    }

    // If the click is inside the main editor area (but not on the image itself, covered above), deselect
    const editorMainArea = editorWrapper?.querySelector('.rdw-editor-main');
    if (editorMainArea && editorMainArea.contains(targetElement)) {
      console.log('[TestEditor handleDocumentMouseDown] Clicked INSIDE .rdw-editor-main, AND NOT on the CustomImageComponent. Deselecting image.');

      const currentContent = editorState.getCurrentContent();
      const blockKeyToDeselect = selectedImageBlockKey;
      const blockToDeselect = blockKeyToDeselect ? currentContent.getBlockForKey(blockKeyToDeselect) : null;

      if (blockToDeselect) {
        const blockBefore = currentContent.getBlockBefore(blockKeyToDeselect);
        const blockAfter = currentContent.getBlockAfter(blockKeyToDeselect);

        let targetSelection: Draft.SelectionState | null = null;

        if (blockAfter) {
          targetSelection = new Draft.SelectionState({
            anchorKey: blockAfter.getKey(),
            anchorOffset: 0,
            focusKey: blockAfter.getKey(),
            focusOffset: 0,
            hasFocus: true,
          });
          console.log(`[TestEditor handleDocumentMouseDown] Deselecting image ${blockKeyToDeselect}. Forcing selection to start of block after: ${blockAfter.getKey()}.`);
        } else if (blockBefore) {
          targetSelection = new Draft.SelectionState({
            anchorKey: blockBefore.getKey(),
            anchorOffset: blockBefore.getLength(),
            focusKey: blockBefore.getKey(),
            focusOffset: blockBefore.getLength(),
            hasFocus: true,
          });
          console.log(`[TestEditor handleDocumentMouseDown] Deselecting image ${blockKeyToDeselect}. No block after. Forcing selection to end of block before: ${blockBefore.getKey()}.`);
        }

        // Update state regardless if a targetSelection was found, to clear selectedImageBlockKey
        this.setState({
          editorState: targetSelection ? Draft.EditorState.forceSelection(editorState, targetSelection) : editorState,
          selectedImageBlockKey: null,
        });
      } else {
        // Block not found (shouldn't happen if selectedImageBlockKey is set, but for safety) - just clear the selected key
        this.setState({ selectedImageBlockKey: null });
      }
      return;
    }

    // If click is on editor UI (e.g. toolbar) but not main content or outside, retain selection
    if (editorWrapper && editorWrapper.contains(targetElement)) {
      console.log('[TestEditor handleDocumentMouseDown] Clicked on editor UI (e.g. toolbar), not deselecting image.');
      return;
    }

    console.log('[TestEditor handleDocumentMouseDown] Click did not match any deselect conditions. Selected key remains:', this.state.selectedImageBlockKey);
  };

  private updateEditorLayoutWidth = () => {
    if (this.editorWrapperRef.current) {
      const editorMainElement = this.editorWrapperRef.current.querySelector('.rdw-editor-main');
      let calculatedWidth: number | null = null;

      if (editorMainElement) {
        const width = editorMainElement.clientWidth;
        const styles = window.getComputedStyle(editorMainElement);
        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const paddingRight = parseFloat(styles.paddingRight) || 0;
        const effectiveWidth = width - paddingLeft - paddingRight;
        if (effectiveWidth > 0) {
          calculatedWidth = effectiveWidth;
        } else {
          console.warn(`[TestEditor updateEditorLayoutWidth] Calculated effectiveWidth is not positive: ${effectiveWidth}`);
        }
      } else {
        console.warn('[TestEditor updateEditorLayoutWidth] .rdw-editor-main not found for width calculation. Falling back to wrapper.');
        const wrapperWidth = this.editorWrapperRef.current.clientWidth;
        if (wrapperWidth > 0) {
          calculatedWidth = wrapperWidth;
        } else {
          console.warn(`[TestEditor updateEditorLayoutWidth] Fallback wrapperWidth is not positive: ${wrapperWidth}`);
        }
      }

      if (calculatedWidth !== null && calculatedWidth !== this.state.editorLayoutWidth) {
        console.log(`[TestEditor updateEditorLayoutWidth] Updating editorLayoutWidth to: ${calculatedWidth}`);
        this.setState({ editorLayoutWidth: calculatedWidth });
      } else if (calculatedWidth === null && this.state.editorLayoutWidth !== null) {
        console.warn(`[TestEditor updateEditorLayoutWidth] Could not determine valid editorLayoutWidth, retaining previous value: ${this.state.editorLayoutWidth}`);
      }
    }
  };

  private focusEditor = (reason?: string) => {
    if (this.editorRef.current) {
      console.log(`[TestEditor focusEditor] called. Reason: ${reason || 'unknown'}`);
      if (typeof this.editorRef.current.focusEditor === 'function') {
        this.editorRef.current.focusEditor();
      } else if (typeof this.editorRef.current.focus === 'function') {
        this.editorRef.current.focus();
      } else {
        console.warn('[TestEditor focusEditor] Neither focusEditor nor focus method found on editorRef.current.');
      }
    } else {
      console.warn('[TestEditor focusEditor] called, but editorRef is not set.');
    }
  };

  private handleModalOpenChange = (isOpen: boolean) => {
    this.setState({ isAnyModalOpen: isOpen });
  };

  private handleSelectAtomicBlock = (blockKey: string) => {
    console.log(`[TestEditor handleSelectAtomicBlock] called for blockKey: ${blockKey}. Current selected in state: ${this.state.selectedImageBlockKey}`);
    const { editorState } = this.state;
    const contentState = editorState.getCurrentContent();
    const block = contentState.getBlockForKey(blockKey);

    if (block && block.getType() === 'atomic') {
      const entityKey = block.getEntityAt(0);
      if (entityKey && contentState.getEntity(entityKey).getType() === 'IMAGE') {
        if (this.state.selectedImageBlockKey === blockKey && editorState.getSelection().getHasFocus() && editorState.getSelection().getAnchorKey() === blockKey) {
          console.log(`[TestEditor handleSelectAtomicBlock] Block ${blockKey} is already selected and focused. No state change needed.`);
          return;
        }

        const selection = new Draft.SelectionState({
          anchorKey: blockKey,
          anchorOffset: 0,
          focusKey: blockKey,
          focusOffset: 0, // For atomic blocks, offset is usually 0 or length of the block (1)
          hasFocus: true,
        });

        const newEditorState = Draft.EditorState.forceSelection(editorState, selection);

        console.log(`[TestEditor handleSelectAtomicBlock] - BEFORE setState: selectedImageBlockKey is ${this.state.selectedImageBlockKey}`);
        this.setState({ editorState: newEditorState, selectedImageBlockKey: blockKey }, () => {
          console.log(`[TestEditor setState callback AFTER handleSelectAtomicBlock] selectedImageBlockKey is now ${this.state.selectedImageBlockKey}`);
        });
      } else {
        console.warn(`[TestEditor handleSelectAtomicBlock] Block ${blockKey} is atomic but not an IMAGE entity.`);
        if (this.state.selectedImageBlockKey !== null) {
          this.setState({ selectedImageBlockKey: null });
        }
      }
    } else {
      console.warn(`[TestEditor handleSelectAtomicBlock] Block ${blockKey} is not atomic or not found.`);
      if (this.state.selectedImageBlockKey !== null) {
        this.setState({ selectedImageBlockKey: null });
      }
    }
  };

  private handleEditorStateChange = (newEditorState: Draft.EditorState, source?: string) => {
    const currentSelection = newEditorState.getSelection();
    const currentContent = newEditorState.getCurrentContent();
    const oldContent = this.state.editorState.getCurrentContent();
    const oldSelection = this.state.editorState.getSelection();

    let newSelectedImageBlockKey = this.state.selectedImageBlockKey;

    console.log(
      `[TestEditor handleEditorStateChange] from ${source || 'unknown'}. HasFocus: ${currentSelection.getHasFocus()}. AnchorKey: ${currentSelection.getAnchorKey()}. FocusKey: ${currentSelection.getFocusKey()}. CurrentSelectedImgKeyInState: ${this.state.selectedImageBlockKey}`
    );

    const contentChanged = currentContent !== oldContent;
    const selectionChanged = currentSelection !== oldSelection;
    const lastChangeType = newEditorState.getLastChangeType();

    if (!currentSelection.getHasFocus()) {
      if (this.state.editorState !== newEditorState) {
        this.setState({ editorState: newEditorState });
      }
      console.log(`[TestEditor handleEditorStateChange] Editor lost focus. selectedImageBlockKey remains: ${newSelectedImageBlockKey}`);
      return;
    }

    if (contentChanged) {
      if (lastChangeType === 'change-block-data') {
        console.log(`[TestEditor handleEditorStateChange] Content changed via change-block-data. Retaining selection for ${this.state.selectedImageBlockKey}.`);
      } else if (lastChangeType === 'insert-fragment') {
        // When an image is inserted, it's an 'insert-fragment'.
        // We want to select this new image block.
        this.handleSelectAtomicBlock(currentSelection.getAnchorKey());
        newSelectedImageBlockKey = currentSelection.getAnchorKey();
      } else {
        // For any other content change (typing, deleting, etc.), deselect the image.
        console.log(`[TestEditor handleEditorStateChange] Other content change (type: ${lastChangeType}). Deselecting image.`);
        newSelectedImageBlockKey = null;
      }
    } else if (selectionChanged) {
      const anchorKey = currentSelection.getAnchorKey();
      const focusKey = currentSelection.getFocusKey();

      if (currentSelection.isCollapsed() && anchorKey === focusKey) {
        const currentBlock = currentContent.getBlockForKey(anchorKey);
        if (currentBlock && currentBlock.getType() === 'atomic') {
          const entityKey = currentBlock.getEntityAt(0);
          if (entityKey && currentContent.getEntity(entityKey).getType() === 'IMAGE') {
            if (newSelectedImageBlockKey !== anchorKey) {
              console.log(`[TestEditor handleEditorStateChange] Selection moved to a new IMAGE block ${anchorKey}. Updating selectedImageBlockKey.`);
              newSelectedImageBlockKey = anchorKey;
            } else {
              console.log(`[TestEditor handleEditorStateChange] Selection on currently selected IMAGE block ${anchorKey}. Retaining selection.`);
            }
          } else {
            console.log(`[TestEditor handleEditorStateChange] Selection on non-IMAGE atomic block ${anchorKey}. Clearing selectedImageBlockKey.`);
            newSelectedImageBlockKey = null;
          }
        } else {
          console.log(`[TestEditor handleEditorStateChange] Selection on non-atomic block. Clearing selectedImageBlockKey.`);
          newSelectedImageBlockKey = null;
        }
      } else {
        console.log(`[TestEditor handleEditorStateChange] Selection is a range or spans blocks. Clearing selectedImageBlockKey.`);
        newSelectedImageBlockKey = null;
      }
    }

    if (this.state.selectedImageBlockKey !== newSelectedImageBlockKey || this.state.editorState !== newEditorState) {
      this.setState({ editorState: newEditorState, selectedImageBlockKey: newSelectedImageBlockKey });
    }
  };

  private uploadImageCallBack = (
    file: File
  ): Promise<{
    data: {
      link: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
      originalSrc?: string;
      originalWidth?: number;
      originalHeight?: number;
      originalMimeType?: string;
    };
  }> => {
    return new Promise((resolve, reject) => {
      console.log('[TestEditor uploadImageCallBack] - Starting for file:', file.name);
      if (!file.type.startsWith('image/')) {
        console.warn('[TestEditor uploadImageCallBack] - File is not an image:', file.type);
        reject('File is not an image.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new Image();
        img.onload = async () => {
          const originalWidthNum = img.naturalWidth;
          const originalHeightNum = img.naturalHeight;
          const originalMime = file.type; // Originalni mime type (npr. image/jpeg)
          console.log(`[TestEditor uploadImageCallBack] - Image loaded. Natural dims: ${originalWidthNum}x${originalHeightNum}. Original MIME: ${originalMime}`);

          const dataToResolve = {
            data: {
              link: src, // Use original src
              alt: file.name,
              width: originalWidthNum,
              height: originalHeightNum,
              originalSrc: src,
              originalWidth: originalWidthNum,
              originalHeight: originalHeightNum,
              originalMimeType: originalMime,
            },
          };
          console.log('[TestEditor uploadImageCallBack] - Resolved promise with original image data.', JSON.parse(JSON.stringify(dataToResolve.data)));
          resolve(dataToResolve);
        };
        img.onerror = (err) => {
          console.error('[TestEditor uploadImageCallBack] Image load error:', err);
          reject('Image could not be loaded to get dimensions.');
        };
        img.src = src;
      };
      reader.onerror = (error) => {
        console.error('[TestEditor uploadImageCallBack] FileReader error:', error);
        reject(error);
      };
      reader.readAsDataURL(file);
    });
  };

  private customBlockRendererFn = (contentBlock: Draft.ContentBlock): { component: React.ComponentType<any>; editable: boolean; props: any } | null => {
    const type = contentBlock.getType();
    if (type === 'atomic') {
      const currentEditorState = this.state.editorState;
      const currentContentState = currentEditorState.getCurrentContent();
      const entityKey = contentBlock.getEntityAt(0);
      if (!entityKey) {
        console.warn(`[TestEditor customBlockRendererFn] No entityKey for atomic block ${contentBlock.getKey()}`);
        return null;
      }

      const entity = currentContentState.getEntity(entityKey);
      const entityType = entity.getType();
      const entityDataFromContent = entity.getData();
      const blockKey = contentBlock.getKey();

      // console.log(`[TestEditor customBlockRendererFn] inspecting atomic block ${blockKey} with entity type ${entityType}. Entity data from content:`, JSON.parse(JSON.stringify(entityDataFromContent)));

      if (entityType === 'IMAGE') {
        const finalIsSelected = this.state.selectedImageBlockKey === blockKey && currentEditorState.getSelection().getHasFocus();
        // console.log(`[TestEditor customBlockRendererFn] for IMAGE blockKey: ${blockKey}. state.selectedImageBlockKey: ${this.state.selectedImageBlockKey}. HasFocus: ${currentEditorState.getSelection().getHasFocus()} ==> isSelected prop: ${finalIsSelected}. EntityData from Content: `, JSON.parse(JSON.stringify(entityDataFromContent)));

        return {
          component: CustomImageComponent,
          editable: false,
          props: {
            editorState: this.state.editorState,
            onChange: (newState: Draft.EditorState) => this.handleEditorStateChange(newState, `customImageComponent_onChange_block_${blockKey}`),
            entityData: entityDataFromContent,
            isSelected: finalIsSelected,
            onSelect: () => this.handleSelectAtomicBlock(blockKey),
            editorLayoutWidth: this.state.editorLayoutWidth,
            onModalOpenChange: this.handleModalOpenChange,
            loadImage: async (id: string) => {
              // This is a mock loadImage for TestEditor
              // In a real app, you'd fetch from a DB or API
              if (id.startsWith('data:')) {
                const response = await fetch(id);
                return response.blob();
              }
              return null;
            },
          },
        };
      }
    }
    return null;
  };

  private handleReturn = (event: SyntheticKeyboardEvent, editorState: Draft.EditorState): boolean => {
    console.log('[TestEditor handleReturn] Triggered.');
    const selection = editorState.getSelection();
    if (selection.isCollapsed()) {
      const contentState = editorState.getCurrentContent();
      const currentBlockKey = selection.getStartKey();
      const currentBlock = contentState.getBlockForKey(currentBlockKey);

      console.log('Selection start offset:', selection.getStartOffset(), 'Block length:', currentBlock.getLength());
      console.log(`[TestEditor handleReturn] Current block type: ${currentBlock.getType()}, Selection offset: ${selection.getStartOffset()}, Block length: ${currentBlock.getLength()}`);

      if (currentBlock.getType() === 'atomic') {
        // console.log('[TestEditor handleReturn] Condition met: On an atomic block. Using BlockMap manipulation insert method.');

        const contentState = editorState.getCurrentContent();
        const blockMap = contentState.getBlockMap();

        // 1. Kreiraj novi prazan blok
        const newBlock = new Draft.ContentBlock({
          key: Draft.genKey(),
          type: 'unstyled',
          text: '',
          characterList: ImmutableList(), // Use ImmutableList here
          depth: 0,
          data: ImmutableMap(), // Use ImmutableMap here
        });

        // 2. Pronađi ključ trenutnog bloka (atomic block)
        const currentBlockKey = selection.getStartKey();

        // 3. Pronađi ključ sljedećeg bloka koristeći BlockMap iteratore/metode
        const blockKeys = blockMap.keySeq().toList(); // Pretvorba ključeva u Immutable Listu
        const currentBlockIndex = blockKeys.indexOf(currentBlockKey);
        const nextBlockKey = blockKeys.get(currentBlockIndex + 1); // Dobivanje ključa sljedećeg bloka

        // 4. Umetni novi blok u BlockMap na ispravno mjesto (PRIJE Koraka 5!)
        let newBlockMap; // Deklaracija newBlockMap OVDJE

        if (nextBlockKey) {
          // Postoji sljedeći blok, umetni novi blok prije njega
          const blockEntries = blockMap.entrySeq().toList();
          const beforeNextBlock = blockEntries.slice(0, currentBlockIndex + 1);
          const afterNextBlock = blockEntries.slice(currentBlockIndex + 1);
          const newBlockEntry = [newBlock.getKey(), newBlock];
          const newBlockEntries = beforeNextBlock.concat([newBlockEntry]).concat(afterNextBlock);
          newBlockMap = Immutable.OrderedMap(newBlockEntries);
          // console.log('[TestEditor handleReturn] Inserting new block before next block (via manipulation).');
        } else {
          // Nema sljedećeg bloka (atomic blok je zadnji), dodaj novi blok na kraj
          newBlockMap = blockMap.set(newBlock.getKey(), newBlock);
          // console.log('[TestEditor handleReturn] Appending new block as the last block.');
        }
        // KRAJ Koraka 4

        // 5. Kreiraj novi ContentState iz modificiranog BlockMap-a (KORISTI newBlockMap OD GORE)
        const newContentState = contentState.merge({
          blockMap: newBlockMap, // newBlockMap je deklariran i izračunat gore
          selectionBefore: contentState.getSelectionBefore(),
          selectionAfter: contentState.getSelectionAfter(),
        }) as Draft.ContentState;
        // KRAJ Koraka 5

        // 6. Ažuriraj editorState i postavi selekciju na POČETAK novog bloka
        // Promjena je 'insert-fragment' - Draft.js Events (Mutation Types)
        let newEditorState = Draft.EditorState.push(editorState, newContentState, 'insert-fragment'); // KORISTI newContentState OD GORE

        // Postavi selekciju na novi blok koji je upravo umetnut
        const finalSelection = Draft.SelectionState.createEmpty(newBlock.getKey()).merge({
          anchorOffset: 0,
          focusOffset: 0,
          hasFocus: true,
        });
        newEditorState = Draft.EditorState.forceSelection(newEditorState, finalSelection);

        // console.log('[TestEditor handleReturn] New Editor State created with BlockMap manipulation. Calling handleEditorStateChange.');

        // 7. Pozovi handleEditorStateChange s novim stanjem
        this.handleEditorStateChange(newEditorState, 'handleReturn_insert_new_block_after_atomic_blockmap');

        // 8. Signaliziraj Draft.js-u da smo rukovali događajem
        return true;
      }
    }
    // console.log('[TestEditor handleReturn] Not handled by custom logic.');
    return false;
  };

  private blockStyleFn = (block: Draft.ContentBlock): string => {
    const textAlign = block.getData().get('text-align');
    if (textAlign) {
      return `align-${textAlign}`;
    }
    return '';
  };

  render() {
    const { editorState, isMounted, isAnyModalOpen } = this.state;

    if (!isMounted || typeof window === 'undefined' || !WysiwygEditor) {
      return (
        <div className="p-4 bg-muted text-muted-foreground" style={{ minHeight: '300px' }}>
          Loading Editor...
        </div>
      );
    }

    return (
      <div
        ref={this.editorWrapperRef}
        style={{
          border: '1px solid #ccc',
          padding: '10px',
          minHeight: '500px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* <h3 style={{ textAlign: 'center', marginBottom: '15px', flexShrink: 0 }}>react-draft-wysiwyg Test Editor</h3> */}
        <div style={{ flexGrow: 1, border: '1px solid #eee', overflow: 'hidden' }}>
          <WysiwygEditor
            
            editorState={editorState}
            readOnly={isAnyModalOpen} // Set readOnly based on modal state
            onEditorStateChange={(newState) => this.handleEditorStateChange(newState, 'editor_native_onChange')}
            toolbarClassName="toolbar-class rdw-editor-toolbar"
            wrapperClassName="wrapper-class rdw-editor-wrapper"
            editorClassName="editor-class border p-2 h-[700px] overflow-y-auto rdw-editor-main bg-background text-foreground"
            customBlockRenderFunc={this.customBlockRendererFn}
            blockStyleFn={this.blockStyleFn}
            handleReturn={this.handleReturn}
            toolbar={{
              options: ['inline', 'blockType', 'fontSize', 'fontFamily', 'list', 'textAlign', 'colorPicker', 'link', 'embedded', 'emoji', 'image', 'remove', 'history'],
              inline: {
                options: ['bold', 'italic', 'underline', 'strikethrough', 'monospace', 'superscript', 'subscript'],
              },
              image: {
                uploadCallback: this.uploadImageCallBack,
                alt: { present: true, mandatory: false },
                previewImage: true,
                inputAccept: 'image/gif,image/jpeg,image/jpg,image/png,image/svg',
                uploadEnabled: true,
              },
            }}
            placeholder="Enter text here..."
            // @ts-expect-error
            editorRef={(ref: EditorInstanceRef | null) => (this.editorRef.current = ref)}
            /*
            //  editorRef={(ref: any) => (this.editorRef.current = ref)}
*/
          />
        </div>
        <div
          style={{
            marginTop: '20px',
            maxHeight: '200px',
            overflowY: 'auto',
            flexShrink: 0,
            fontSize: '10px',
            background: '#f0f0f0',
            border: '1px solid #ddd',
            padding: '5px',
          }}
        >
          <h4>Raw Content (for debugging):</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(Draft.convertToRaw(editorState.getCurrentContent()), null, 2)}</pre>
        </div>
      </div>
    );
  }
}

export default TestEditor;
