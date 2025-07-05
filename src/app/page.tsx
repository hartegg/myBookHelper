'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/main-header';
import BookStructureView from '@/components/book-structure-view';
import TocView from '@/components/toc-view';
import type { BookNode } from '@/types';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { saveBookData, loadBookData, deleteDatabase } from '@/lib/db';
import type { RawDraftContentState } from 'draft-js';
// import ContentEditorView from '@/components/content-editor-view'; // Original static import
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
// import { PanelLeftOpen, PanelLeftClose, PanelRightOpen, PanelRightClose, X } from 'lucide-react';
import dynamic from 'next/dynamic';

import InternalBrowserView from '@/components/InternalBrowserView';
import { ImagePasteComponent } from '@/components/image-paste-component';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Globe } from 'lucide-react'; // Dodaj Globe ikonu
// ... ostali importi

// Dynamically import TestEditor to avoid SSR issues if react-draft-wysiwyg has them
const TestEditor = dynamic(() => import('@/components/image-resize-editor/test-editor'), {
  ssr: false,
});

const ContentEditorView = dynamic(() => import('@/components/content-editor-view'), {
  ssr: false,
  loading: () => <p className="flex-1 p-6 flex items-center justify-center text-muted-foreground font-body">Loading Editor View...</p>,
});

const createTextBlock = (key: string, text: string, type: 'header-one' | 'header-two' | 'header-three' | 'header-four' | 'header-five' | 'header-six' | 'unstyled' = 'unstyled') => ({
  key,
  text,
  type,
  depth: 0,
  inlineStyleRanges: [],
  entityRanges: [],
  data: {},
});

const initialBookData: BookNode = {
  id: 'root',
  title: 'myBookHelper',
  content: {
    blocks: [createTextBlock('rootp1', 'Welcome to your myBookHelper project. Add your first item to begin!')],
    entityMap: {},
  },
  children: [],
};

const generateNodeId = () => `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 288; // 18rem

let currentBookDataGlobalRef: BookNode | null = null;

function findNodeById(nodes: BookNode[], id: string): BookNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const childrenToSearch = node.children || [];
    const foundInChildren = findNodeById(childrenToSearch, id);
    if (foundInChildren) return foundInChildren;
  }
  return null;
}

function updateNodeTitleInTree(nodes: BookNode[], nodeId: string, newTitle: string): BookNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return { ...node, title: newTitle };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: updateNodeTitleInTree(node.children, nodeId, newTitle) };
    }
    return { ...node, children: node.children || [] };
  });
}

const updateNodeContentInTree = (nodes: BookNode[], targetNodeId: string, newContent: RawDraftContentState): BookNode[] => {
  return nodes.map((node) => {
    if (node.id === targetNodeId) {
      return { ...node, content: newContent };
    }
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateNodeContentInTree(node.children, targetNodeId, newContent),
      };
    }
    return { ...node, children: node.children || [] };
  });
};

function findNodeAndParent(
  nodes: BookNode[],
  nodeId: string,
  parentIdForRecursion: string | null = null,
  path: BookNode[] = [],
  parentRoot: BookNode | null
): {
  node: BookNode | null;
  parent: BookNode | null;
  parentId: string | null;
  index: number;
  path: BookNode[];
  parentList: BookNode[];
} {
  for (let i = 0; i < nodes.length; i++) {
    const currentNode = nodes[i];
    const currentPath = [...path, currentNode];
    if (currentNode.id === nodeId) {
      const directParentNode = path.length > 0 ? path[path.length - 1] : parentRoot;
      let siblingsList: BookNode[];

      if (directParentNode) {
        if (parentRoot && directParentNode.id === parentRoot.id && parentRoot.id === 'root') {
          siblingsList = parentRoot.children || [];
        } else {
          siblingsList = directParentNode.children || [];
        }
      } else {
        siblingsList = currentBookDataGlobalRef?.children || [];
      }
      return {
        node: currentNode,
        parent: directParentNode,
        parentId: directParentNode?.id || null,
        index: i,
        path: path,
        parentList: siblingsList,
      };
    }
    const childrenOfCurrentNode = currentNode.children || [];
    if (childrenOfCurrentNode.length > 0) {
      const found = findNodeAndParent(childrenOfCurrentNode, nodeId, currentNode.id, currentPath, parentRoot);
      if (found.node) {
        return found;
      }
    }
  }
  return { node: null, parent: null, parentId: null, index: -1, path: [], parentList: [] };
}

function removeNodeFromTreeRecursive(nodes: BookNode[], nodeIdToRemove: string): { newTree: BookNode[]; removedNode: BookNode | null } {
  let capturedRemovedNode: BookNode | null = null;

  function R(currentNodes: BookNode[]): BookNode[] {
    return currentNodes
      .map((node) => {
        if (node.id === nodeIdToRemove) {
          if (!capturedRemovedNode) {
            capturedRemovedNode = JSON.parse(JSON.stringify(node));
          }
          return null;
        }
        const processedChildren = node.children && node.children.length > 0 ? R(node.children) : node.children || [];

        return { ...node, children: processedChildren };
      })
      .filter((node) => node !== null) as BookNode[];
  }

  const finalTree = R(nodes);
  return { newTree: finalTree, removedNode: capturedRemovedNode };
}

const handleKeepChildrenAndDeleteNode = (currentNodes: BookNode[], targetNodeId: string): BookNode[] => {
  return currentNodes.flatMap((node) => {
    if (node.id === targetNodeId) {
      return node.children || [];
    }
    const processedChildren = node.children ? handleKeepChildrenAndDeleteNode(node.children, targetNodeId) : [];
    return [{ ...node, children: processedChildren }];
  });
};

function addNodeToTreeRecursive(nodes: BookNode[], nodeToAdd: BookNode, targetId: string, position: 'before' | 'after' | 'inside', isTargetRootLevelOrRootItself: boolean): BookNode[] {
  const currentNodes = nodes || [];

  if (targetId === 'root' && position === 'inside') {
    return [...currentNodes, nodeToAdd];
  }

  if (isTargetRootLevelOrRootItself && position !== 'inside') {
    const targetIndexAtRoot = currentNodes.findIndex((node) => node.id === targetId);
    if (targetIndexAtRoot !== -1) {
      const newNodes = [...currentNodes];
      if (position === 'before') {
        newNodes.splice(targetIndexAtRoot, 0, nodeToAdd);
      } else {
        newNodes.splice(targetIndexAtRoot + 1, 0, nodeToAdd);
      }
      return newNodes;
    }
  }

  return currentNodes.map((node) => {
    if (node.id === targetId && position === 'inside') {
      return {
        ...node,
        children: [...(node.children || []), nodeToAdd],
      };
    }

    const childrenOfNode = node.children || [];
    if (position !== 'inside') {
      const targetIndexInChildren = childrenOfNode.findIndex((child) => child.id === targetId);
      if (targetIndexInChildren !== -1) {
        const newChildrenOfNode = [...childrenOfNode];
        if (position === 'before') {
          newChildrenOfNode.splice(targetIndexInChildren, 0, nodeToAdd);
        } else {
          newChildrenOfNode.splice(targetIndexInChildren + 1, 0, nodeToAdd);
        }
        return { ...node, children: newChildrenOfNode };
      }
    }

    if (node.children && node.children.length > 0) {
      const updatedChildren = addNodeToTreeRecursive(node.children, nodeToAdd, targetId, position, false);
      if (updatedChildren !== node.children) {
        return { ...node, children: updatedChildren };
      }
    }
    return { ...node, children: node.children ? [...node.children] : [] };
  });
}

interface LastDeletedNodeContext {
  deletedNodeId: string;
  deletedNodeTitle: string;
  originalParentId: string | null;
  originalIndexInSiblings: number;
  deleteType: 'deleteAll' | 'keepChildren';
}

interface NodeToDeleteInfoDialog {
  hasChildren: boolean;
  title: string;
}

export interface TocHeading {
  id: string;
  text: string;
  level: number;
  order: number;
}

function isDescendant(potentialParentNode: BookNode, targetNodeId: string): boolean {
  const childrenOfPotentialParent = potentialParentNode.children || [];
  if (childrenOfPotentialParent.length === 0) {
    return false;
  }
  for (const child of childrenOfPotentialParent) {
    if (child.id === targetNodeId) {
      return true;
    }
    if (isDescendant(child, targetNodeId)) {
      return true;
    }
  }
  return false;
}

const ensureValidContentStructureRecursive = (node: BookNode): BookNode => {
  let newContent = node.content;
  if (typeof node.content !== 'object' || node.content === null || !Array.isArray(node.content.blocks) || typeof node.content.entityMap !== 'object' || node.content.entityMap === null) {
    newContent = {
      blocks: [createTextBlock(`default-${node.id}-${Date.now()}`, '')],
      entityMap: {},
    };
  } else if (node.content.blocks.length === 0) {
    newContent = {
      ...node.content,
      blocks: [createTextBlock(`default-${node.id}-${Date.now()}`, '')],
    };
  }

  const newChildren = node.children ? node.children.map((child) => ensureValidContentStructureRecursive(child)) : [];

  return {
    ...node,
    content: newContent,
    children: newChildren,
  };
};

function isValidBookNode(data: any, path: string = 'root'): data is BookNode {
  const currentPath = path || 'root object';
  if (typeof data !== 'object' || data === null) {
    console.error(`Validation Error at ${currentPath}: Data is not an object or is null. Received:`, data);
    return false;
  }
  if (typeof data.id !== 'string') {
    console.error(`Validation Error at ${currentPath}: 'id' is not a string. Received id:`, data.id);
    return false;
  }
  if (typeof data.title !== 'string') {
    console.error(`Validation Error at ${currentPath} (id: ${data.id}): 'title' is not a string. Received title:`, data.title);
    return false;
  }

  if (
    typeof data.content !== 'object' ||
    data.content === null ||
    !Array.isArray(data.content.blocks) ||
    !data.content.blocks.every((block: any) => typeof block === 'object' && block !== null && typeof block.key === 'string') || // Allow empty blocks array for now, ensureValid will fix
    typeof data.content.entityMap !== 'object' ||
    data.content.entityMap === null
  ) {
    console.error(`Validation Error at ${currentPath} (id: ${data.id}): 'content' structure is invalid. Received content:`, data.content);
    return false;
  }
  if (data.content.blocks.length === 0 && Object.keys(data.content.entityMap).length === 0) {
    // Allow this specific case if ensureValidContentStructureRecursive handles it, or consider it an error here.
    // For now, let's assume ensureValid... will fix it. If problems persist, this could be an error.
  }

  if (data.children) {
    if (!Array.isArray(data.children)) {
      console.error(`Validation Error at ${currentPath} (id: ${data.id}): 'children' is present but not an array. Received children:`, data.children);
      return false;
    }
    for (let i = 0; i < data.children.length; i++) {
      const child = data.children[i];
      if (!isValidBookNode(child, `${currentPath}.children[${i}] (id: ${child?.id || 'unknown'})`)) {
        return false;
      }
    }
  }
  return true;
}

export default function ComposeWritePage() {
  const [bookDataState, setBookDataState] = useState<BookNode | null>(null);
  currentBookDataGlobalRef = bookDataState;
  const router = useRouter();

  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isHeaderMinimized, setIsHeaderMinimized] = useState(true); // Default changed based on recent request
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(['root']));
  const [isEditorToolbarVisible, setIsEditorToolbarVisible] = useState(true);
  const [isWidePaddingActive, setIsWidePaddingActive] = useState(false);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetInfo, setDropTargetInfoInternal] = useState<{
    nodeId: string;
    position: 'before' | 'after' | 'inside';
  } | null>(null);

  const [nodeToDeleteId, setNodeToDeleteId] = useState<string | null>(null);
  const [nodeToDeleteInfoForDialog, setNodeToDeleteInfoForDialog] = useState<NodeToDeleteInfoDialog | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const [lastDeletedNodeContext, setLastDeletedNodeContext] = useState<LastDeletedNodeContext | null>(null);

  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const leftResizeDataRef = useRef({ initialMouseX: 0, initialWidth: 0 });
  const rightResizeDataRef = useRef({ initialMouseX: 0, initialWidth: 0 });

  const [activeScrollToBlockKey, setActiveScrollToBlockKey] = useState<string | null>(null);
  const [activeTocHeadingId, setActiveTocHeadingId] = useState<string | null>(null);
  const [highlightBlockInEditorKey, setHighlightBlockInEditorKey] = useState<string | null>(null);
  const [bookStructureViewKey, setBookStructureViewKey] = useState(0);
  const [isAutoScrollToCurrentPositionEnabled, setIsAutoScrollToCurrentPositionEnabled] = useState(false);
  const [areAllBookNodesExpanded, setAreAllBookNodesExpanded] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [projectFileToImport, setProjectFileToImport] = useState<File | null>(null);

  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isResetConfirmDialogOpen, setIsResetConfirmDialogOpen] = useState(false);
  const [theme, setTheme] = useState<string>('system');

  const [isFirstNodeModalOpen, setIsFirstNodeModalOpen] = useState(false);
  const [firstNodeTitleInput, setFirstNodeTitleInput] = useState('');

  // const [showTestEditorOverlay, setShowTestEditorOverlay] = useState(false);

  const [showInternalBrowser, setShowInternalBrowser] = useState(false);
  const [showImagePaste, setShowImagePaste] = useState(false);

  const [editorBrowserSplitWidth, setEditorBrowserSplitWidth] = useState(0.5); // Širina urednika kao postotak (0.0 do 1.0), početno 50%
  const [isResizingEditorBrowser, setIsResizingEditorBrowser] = useState(false); // Stanje za praćenje da li se trenutno vrši resize

  const editorBrowserContainerRef = useRef<HTMLDivElement>(null); // Ref za KONTENER div
  const editorElementRef = useRef<HTMLElement>(null); // Ref za MAIN element (urednik)
  const contentEditorRef = useRef<{ handleInsertImage: (id: string) => void }>(null);

  const handleImageInsert = (id: string) => {
    contentEditorRef.current?.handleInsertImage(id);
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') || 'system';
    setTheme(storedTheme);
    const storedHeaderMinimized = localStorage.getItem('composeWrite-headerDefaultMinimized');
    if (storedHeaderMinimized !== null) {
      setIsHeaderMinimized(JSON.parse(storedHeaderMinimized));
    } else {
      setIsHeaderMinimized(true); // Explicitly set default if not found
    }
  }, []);

  useEffect(() => {
    const applyActualTheme = (effectiveTheme: 'light' | 'dark') => {
      if (effectiveTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyActualTheme(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    if (theme === 'light') {
      applyActualTheme('light');
    } else if (theme === 'dark') {
      applyActualTheme('dark');
    } else {
      applyActualTheme(mediaQuery.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    }

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [theme]);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleHeaderMinimizedSettingChange = useCallback(
    (checked: boolean) => {
      setIsHeaderMinimized(checked);
      localStorage.setItem('composeWrite-headerDefaultMinimized', JSON.stringify(checked));
    },
    [setIsHeaderMinimized]
  );

  const handleTocItemSelect = useCallback((blockKey: string) => {
    setActiveScrollToBlockKey(blockKey);
    setActiveTocHeadingId(blockKey);
    setHighlightBlockInEditorKey(blockKey);
  }, []);

  const handleEditorHighlightComplete = useCallback(() => {
    setHighlightBlockInEditorKey(null);
  }, []);

  const handleScrollComplete = useCallback(() => {
    setActiveScrollToBlockKey(null);
  }, []);

  const toggleAutoScrollToCurrentPosition = useCallback(() => {
    setIsAutoScrollToCurrentPositionEnabled((prev) => !prev);
  }, []);

  const handleActiveBlockInEditorViewport = useCallback(
    (blockKey: string | null) => {
      if (isAutoScrollToCurrentPositionEnabled) {
        if (blockKey && blockKey !== activeTocHeadingId) {
          setActiveTocHeadingId(blockKey);
        } else if (!blockKey && activeTocHeadingId !== null && blockKey === null) {
          // setActiveTocHeadingId(null);
        }
      }
    },
    [isAutoScrollToCurrentPositionEnabled, activeTocHeadingId, setActiveTocHeadingId]
  );

  const toggleAllBookNodesExpansion = useCallback(() => {
    setAreAllBookNodesExpanded((prev) => {
      const newExpansionState = !prev;
      if (newExpansionState) {
        const allIds = new Set<string>(['root']);
        const collectIds = (nodes: BookNode[]) => {
          if (!nodes) return;
          for (const node of nodes) {
            if (node.children && node.children.length > 0) {
              allIds.add(node.id);
              collectIds(node.children);
            } else if (node.children && node.children.length === 0) {
              allIds.add(node.id);
            }
          }
        };
        if (bookDataState?.children) {
          collectIds(bookDataState.children);
        }
        setExpandedNodeIds(allIds);
      } else {
        setExpandedNodeIds(new Set(['root']));
      }
      return newExpansionState;
    });
  }, [bookDataState, setExpandedNodeIds]);

  // ******************************
  const editorBrowserResizeStartXRef = useRef(0);
  const editorBrowserStartWidthRef = useRef(0);
  const editorBrowserContainerWidthRef = useRef(0); // Ref za širinu kontejnera urednika/preglednika

  // Funkcija koja se poziva kada korisnik pritisne tipku miša na resizeru između Editora i InternalBrowserView
  const handleEditorBrowserResizeMouseDown = (e: React.MouseEvent) => {
    // console.log('Mouse Down');
    setIsResizingEditorBrowser(true);
    editorBrowserResizeStartXRef.current = e.clientX;

    const containerElement = editorBrowserContainerRef.current;

    if (containerElement) {
      editorBrowserContainerWidthRef.current = containerElement.clientWidth;
      editorBrowserStartWidthRef.current = editorBrowserSplitWidth;
    } else {
      editorBrowserContainerWidthRef.current = 0;
      editorBrowserStartWidthRef.current = 0.5; // Fallback na zadanu vrijednost
    }
    // Globalni event listeneri se dodaju/uklanjaju u useEffect hooku
  };

  const handleEditorBrowserResizeMouseMove = (e: MouseEvent) => {
    // Funkcija koja se poziva dok korisnik pomiče miša s pritisnutom tipkom
    // console.log('Mouse Move:', e.clientX);

    if (!isResizingEditorBrowser) return;

    const currentX = e.clientX;
    const deltaX = currentX - editorBrowserResizeStartXRef.current;

    // Dodaj provjeru kako bi se spriječilo dijeljenje s nulom ako je širina kontejnera 0
    if (editorBrowserContainerWidthRef.current === 0) {
      return;
    }

    const newWidthPercentage = editorBrowserStartWidthRef.current + deltaX / editorBrowserContainerWidthRef.current;

    // Ograniči širinu na minimalne i maksimalne vrijednosti (npr. 20% do 80%)
    const clampedWidthPercentage = Math.max(0.2, Math.min(0.8, newWidthPercentage)); // Prilagodi min/max po potrebi

    // Ažuriraj stanje širine
    setEditorBrowserSplitWidth(clampedWidthPercentage);
  };

  // Funkcija koja se poziva kada korisnik otpusti tipku miša
  const handleEditorBrowserResizeMouseUp = () => {
    // console.log('Mouse Up');

    setIsResizingEditorBrowser(false);

    // Ukloni globalne event listenere
    document.removeEventListener('mousemove', handleEditorBrowserResizeMouseMove);
    document.removeEventListener('mouseup', handleEditorBrowserResizeMouseUp);
  };

  // Upravljanje globalnim event listenerima za resize
  useEffect(() => {
    if (isResizingEditorBrowser) {
      document.addEventListener('mousemove', handleEditorBrowserResizeMouseMove);
      document.addEventListener('mouseup', handleEditorBrowserResizeMouseUp);
      document.body.style.userSelect = 'none'; // Spriječi selekciju teksta tijekom resize-a
      document.body.style.cursor = 'col-resize'; // Promijeni kursor
    } else {
      document.removeEventListener('mousemove', handleEditorBrowserResizeMouseMove);
      document.removeEventListener('mouseup', handleEditorBrowserResizeMouseUp);
      document.body.style.userSelect = ''; // Vrati default
      document.body.style.cursor = ''; // Vrati default
    }

    return () => {
      // Cleanup funkcija: osiguraj da su listeneri uklonjeni pri unmountu komponente
      document.removeEventListener('mousemove', handleEditorBrowserResizeMouseMove);
      document.removeEventListener('mouseup', handleEditorBrowserResizeMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingEditorBrowser, handleEditorBrowserResizeMouseMove, handleEditorBrowserResizeMouseUp]); // Ovisnosti

  useEffect(() => {
    const initDb = async () => {
      setIsLoadingDB(true);
      try {
        const loaded = await loadBookData();
        // console.log("Loaded data from DB in initDb:", loaded ? JSON.parse(JSON.stringify(loaded)) : null);

        if (loaded) {
          const validatedLoadedData = ensureValidContentStructureRecursive(loaded);
          setBookDataState(validatedLoadedData);
        } else {
          const freshInitialData = JSON.parse(JSON.stringify(initialBookData));
          // console.log("No data in DB, using FRESH initialBookData structure in initDb:", JSON.parse(JSON.stringify(freshInitialData)));
          const validatedInitialData = ensureValidContentStructureRecursive(freshInitialData);
          setBookDataState(validatedInitialData);
          await saveBookData(validatedInitialData);
        }
      } catch (error) {
        // console.error('Error initializing data from DB:', error);
        const freshInitialDataOnError = JSON.parse(JSON.stringify(initialBookData));
        const validatedInitialDataOnError = ensureValidContentStructureRecursive(freshInitialDataOnError);
        setBookDataState(validatedInitialDataOnError);
        await saveBookData(validatedInitialDataOnError).catch((e) => console.error('Error saving initial data after DB error:', e));
      } finally {
        setIsLoadingDB(false);
      }
    };
    initDb();
  }, []);

  useEffect(() => {
    if (!isLoadingDB && bookDataState) {
      const validatedBookDataForSave = ensureValidContentStructureRecursive(bookDataState);

      if (JSON.stringify(bookDataState) !== JSON.stringify(validatedBookDataForSave)) {
        setBookDataState(validatedBookDataForSave);
        return;
      }

      const debounceSave = setTimeout(() => {
        saveBookData(validatedBookDataForSave).catch((error) => {
          // console.error('Failed to save to DB in useEffect:', error);
          toast({
            title: 'Error',
            description: 'Failed to save changes to database.',
            variant: 'destructive',
          });
        });
      }, 1000);
      return () => clearTimeout(debounceSave);
    }
  }, [bookDataState, isLoadingDB, toast]);

  useEffect(() => {
    if (!isLoadingDB && bookDataState) {
      let hasAnyExpandableNodes = false;
      const findExpandableRecursive = (nodes: BookNode[]): void => {
        if (hasAnyExpandableNodes || !nodes) return;
        for (const node of nodes) {
          if (node.children && node.children.length > 0) {
            hasAnyExpandableNodes = true;
            return;
          }
          if (node.children) {
            findExpandableRecursive(node.children);
          }
        }
      };

      if (bookDataState.children) {
        findExpandableRecursive(bookDataState.children);
      }

      if (hasAnyExpandableNodes) {
        const allIdsToExpand = new Set<string>(['root']);
        const collectExpandableIdsRecursive = (nodes: BookNode[]): void => {
          if (!nodes) return;
          for (const node of nodes) {
            if (node.children && node.children.length > 0) {
              allIdsToExpand.add(node.id);
              collectExpandableIdsRecursive(node.children);
            } else if (node.children && node.children.length === 0) {
              allIdsToExpand.add(node.id);
            }
          }
        };
        if (bookDataState.children) {
          collectExpandableIdsRecursive(bookDataState.children);
        }
        setExpandedNodeIds(allIdsToExpand);
        setAreAllBookNodesExpanded(true);
      } else {
        setExpandedNodeIds(new Set(['root']));
        setAreAllBookNodesExpanded(false);
      }

      if (!selectedNodeId) {
        if (bookDataState.children && bookDataState.children.length > 0) {
          setSelectedNodeId(bookDataState.children[0].id);
        } else {
          setSelectedNodeId(bookDataState.id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookDataState, isLoadingDB]);

  const toggleLeftSidebar = useCallback(() => setIsLeftSidebarOpen((prev) => !prev), []);
  const toggleRightSidebar = useCallback(() => setIsRightSidebarOpen((prev) => !prev), []);

  const toggleHeaderMinimize = useCallback(() => {
    setIsHeaderMinimized((prev) => !prev);
  }, [setIsHeaderMinimized]);

  const toggleEditorToolbar = useCallback(() => {
    setIsEditorToolbarVisible((prev) => !prev);
  }, []);

  const toggleWidePadding = useCallback(() => {
    setIsWidePaddingActive((prev) => !prev);
  }, []);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setEditingNodeId(null);
      setActiveTocHeadingId(null);
    },
    [setSelectedNodeId, setEditingNodeId, setActiveTocHeadingId]
  );

  const handleUpdateNodeTitle = useCallback(
    (nodeId: string, newTitle: string) => {
      if (!newTitle.trim()) return;
      setBookDataState((currentBookData) => {
        if (!currentBookData) return null;
        if (currentBookData.id === nodeId) {
          return { ...currentBookData, title: newTitle };
        }
        const updatedChildren = updateNodeTitleInTree(currentBookData.children || [], nodeId, newTitle);
        return { ...currentBookData, children: updatedChildren };
      });
      setEditingNodeId(null);
    },
    [setBookDataState, setEditingNodeId]
  );

  const handleUpdateNodeContent = useCallback(
    (nodeId: string, newContent: RawDraftContentState) => {
      setBookDataState((currentBookData) => {
        if (!currentBookData) return null;
        if (currentBookData.id === nodeId) {
          return { ...currentBookData, content: newContent };
        }
        const updatedChildren = updateNodeContentInTree(currentBookData.children || [], nodeId, newContent);
        return { ...currentBookData, children: updatedChildren };
      });
    },
    [setBookDataState]
  );

  const handleToggleNodeExpansion = useCallback(
    (nodeId: string) => {
      setExpandedNodeIds((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }

        if (bookDataState?.children) {
          let allCurrentlyExpanded = true;
          const checkAll = (nodes: BookNode[]) => {
            for (const n of nodes) {
              const childrenOfN = n.children || [];
              if (childrenOfN.length > 0) {
                if (!newSet.has(n.id)) {
                  allCurrentlyExpanded = false;
                  return;
                }
                checkAll(childrenOfN);
                if (!allCurrentlyExpanded) return;
              }
            }
          };
          checkAll(bookDataState.children);

          const expandableNodesExist = (function checkExistence(nodes: BookNode[]): boolean {
            return nodes.some((n) => (n.children && n.children.length > 0) || (n.children && checkExistence(n.children)));
          })(bookDataState.children || []);

          if (!expandableNodesExist) {
            setAreAllBookNodesExpanded(false);
          } else {
            setAreAllBookNodesExpanded(allCurrentlyExpanded);
          }
        }
        return newSet;
      });
    },
    [bookDataState, setExpandedNodeIds, setAreAllBookNodesExpanded]
  );

  const handleReorderNodes = useCallback(
    (currentDraggedNodeId: string, currentTargetNodeId: string, position: 'before' | 'after' | 'inside') => {
      setBookDataState((currentBookData) => {
        if (!currentBookData) return null;

        if (currentBookData.id === currentDraggedNodeId && position === 'inside' && currentTargetNodeId === 'root') {
          console.warn('Attempt to drag root node into itself.');
          return currentBookData;
        }

        const { newTree: treeWithoutDraggedNode, removedNode } = removeNodeFromTreeRecursive(currentBookData.children || [], currentDraggedNodeId);

        if (!removedNode) {
          if (currentBookData.id === currentDraggedNodeId) {
            console.warn("Attempted to drag the root node, which is not allowed from BookStructureView's list.");
            return currentBookData;
          }
          console.warn('Dragged node not found in tree during reorder:', currentDraggedNodeId);
          toast({
            title: 'Reorder Error',
            description: 'The item being moved was not found.',
            variant: 'destructive',
          });
          return currentBookData;
        }

        if (position === 'inside') {
          if (currentTargetNodeId === removedNode.id || isDescendant(removedNode, currentTargetNodeId)) {
            toast({
              title: 'Invalid Action',
              description: 'You cannot move an item into itself or its sub-items.',
              variant: 'destructive',
            });
            return currentBookData;
          }
        }

        const isTargetRootItself = currentTargetNodeId === 'root' && position === 'inside';
        const isTargetRootLevelNode = !isTargetRootItself && (currentBookData.children || []).some((node) => node.id === currentTargetNodeId);
        const isOperatingAtRootLevel = isTargetRootItself || (isTargetRootLevelNode && position !== 'inside');

        const finalTree = addNodeToTreeRecursive(treeWithoutDraggedNode, removedNode, currentTargetNodeId, position, isOperatingAtRootLevel);

        if (position === 'inside' && currentTargetNodeId !== 'root') {
          setExpandedNodeIds((prev) => {
            const newSet = new Set(prev);
            newSet.add(currentTargetNodeId);
            return newSet;
          });
        }

        return { ...currentBookData, children: finalTree };
      });
      setDraggedNodeId(null);
      setDropTargetInfoInternal(null);
    },
    [toast, setExpandedNodeIds, setDraggedNodeId, setDropTargetInfoInternal]
  );

  const confirmAddFirstNode = useCallback(() => {
    if (!firstNodeTitleInput.trim() || !bookDataState) return;

    const newNodeId = generateNodeId();
    const newNode: BookNode = {
      id: newNodeId,
      title: firstNodeTitleInput.trim(),
      content: {
        blocks: [createTextBlock(`new-${newNodeId}`, `Content for ${firstNodeTitleInput.trim()}`)],
        entityMap: {},
      },
      children: [],
    };

    setBookDataState((currentBookData) => {
      if (!currentBookData) return null;
      const newChildrenList = [...(currentBookData.children || []), newNode];
      return { ...currentBookData, children: newChildrenList };
    });

    setSelectedNodeId(newNodeId);
    setEditingNodeId(newNodeId);
    setIsFirstNodeModalOpen(false);
    setFirstNodeTitleInput('');
    toast({
      title: 'Book Created',
      description: `"${newNode.title}" has been added as your first chapter.`,
    });
  }, [firstNodeTitleInput, bookDataState, toast, setBookDataState, setSelectedNodeId, setEditingNodeId, setIsFirstNodeModalOpen, setFirstNodeTitleInput]);

  const handleAddNode = useCallback(
    (parentId: string | null) => {
      if (parentId === null && bookDataState && (!bookDataState.children || bookDataState.children.length === 0)) {
        setFirstNodeTitleInput('');
        setIsFirstNodeModalOpen(true);
        return;
      }

      const newNodeId = generateNodeId();
      setBookDataState((currentBookData) => {
        if (!currentBookData) return null;
        const newNode: BookNode = {
          id: newNodeId,
          title: 'New Item',
          content: {
            blocks: [createTextBlock(`new-${newNodeId}`, 'Edit this new item.')],
            entityMap: {},
          },
          children: [],
        };

        if (parentId === null || parentId === 'root') {
          const newChildrenList = [...(currentBookData.children || []), newNode];
          return { ...currentBookData, children: newChildrenList };
        } else {
          const addAsChildRecursive = (nodes: BookNode[], targetParentId: string): BookNode[] => {
            return nodes.map((node) => {
              if (node.id === targetParentId) {
                return {
                  ...node,
                  children: [...(node.children || []), newNode],
                };
              }
              if (node.children && node.children.length > 0) {
                const updatedChildren = addAsChildRecursive(node.children, targetParentId);
                if (updatedChildren !== node.children) {
                  return { ...node, children: updatedChildren };
                }
              }
              return { ...node, children: node.children ? [...node.children] : [] };
            });
          };
          const newRootChildren = addAsChildRecursive(currentBookData.children || [], parentId);
          return { ...currentBookData, children: newRootChildren };
        }
      });

      if (parentId && parentId !== 'root') {
        setExpandedNodeIds((prev) => new Set(prev).add(parentId));
      }
      setSelectedNodeId(newNodeId);
      setEditingNodeId(newNodeId);
    },
    [bookDataState, setBookDataState, setExpandedNodeIds, setSelectedNodeId, setEditingNodeId, setIsFirstNodeModalOpen, setFirstNodeTitleInput]
  );

  const openDeleteDialog = useCallback(
    (nodeId: string) => {
      if (!bookDataState) return;
      const nodeInfo = findNodeById(bookDataState.children || [], nodeId);
      if (nodeInfo) {
        setNodeToDeleteInfoForDialog({
          hasChildren: !!(nodeInfo.children && nodeInfo.children.length > 0),
          title: nodeInfo.title,
        });
        setNodeToDeleteId(nodeId);
        setIsDeleteDialogOpen(true);
      }
    },
    [bookDataState, setNodeToDeleteInfoForDialog, setNodeToDeleteId, setIsDeleteDialogOpen]
  );

  const closeDeleteDialog = useCallback(() => {
    setNodeToDeleteId(null);
    setNodeToDeleteInfoForDialog(null);
    setIsDeleteDialogOpen(false);
  }, [setNodeToDeleteId, setNodeToDeleteInfoForDialog, setIsDeleteDialogOpen]);

  const confirmDeleteNode = useCallback(
    (deleteType: 'deleteAll' | 'keepChildren') => {
      if (!nodeToDeleteId || !bookDataState) return;

      const nodeDetailsForToast = findNodeById(bookDataState.children || [], nodeToDeleteId);
      const title = nodeDetailsForToast?.title || 'Item';

      const { parent: originalParent, index: originalIndexInParentList } = findNodeAndParent(bookDataState.children || [], nodeToDeleteId, null, [], bookDataState);
      const originalParentId = originalParent?.id === bookDataState.id ? 'root' : originalParent?.id || 'root';

      setBookDataState((currentBookData) => {
        if (!currentBookData) return null;

        let newChildrenTree = [...(currentBookData.children || [])];

        const nodeToDeleteData = findNodeById(newChildrenTree, nodeToDeleteId);
        if (!nodeToDeleteData) {
          return currentBookData;
        }

        if (deleteType === 'keepChildren' && nodeToDeleteData.children && nodeToDeleteData.children.length > 0) {
          newChildrenTree = handleKeepChildrenAndDeleteNode(newChildrenTree, nodeToDeleteId);
        } else {
          const removalResult = removeNodeFromTreeRecursive(newChildrenTree, nodeToDeleteId);
          newChildrenTree = removalResult.newTree;
        }
        const newState = { ...currentBookData, children: newChildrenTree };
        return newState;
      });

      setLastDeletedNodeContext({
        deletedNodeId: nodeToDeleteId,
        deletedNodeTitle: title,
        originalParentId: originalParentId,
        originalIndexInSiblings: originalIndexInParentList,
        deleteType: deleteType,
      });
      setBookStructureViewKey((prevKey) => prevKey + 1);
      closeDeleteDialog();
    },
    [nodeToDeleteId, bookDataState, closeDeleteDialog, toast, setBookDataState, setLastDeletedNodeContext, setBookStructureViewKey]
  );

  useEffect(() => {
    if (lastDeletedNodeContext && bookDataState) {
      const { deletedNodeId, deletedNodeTitle, originalParentId, originalIndexInSiblings, deleteType } = lastDeletedNodeContext;

      let toastMessage = `"${deletedNodeTitle}" deleted.`;

      if (deleteType === 'keepChildren') {
        if (nodeToDeleteInfoForDialog?.hasChildren) {
          toastMessage += ' Sub-items were preserved.';
        }
      }
      toast({ title: toastMessage });

      if (selectedNodeId === deletedNodeId) {
        let nextSelectedId: string | null = null;

        const parentNodeInNewTree = originalParentId === 'root' ? { ...bookDataState } : originalParentId ? findNodeById(bookDataState.children || [], originalParentId) : null;
        const newSiblingsList = parentNodeInNewTree?.id === 'root' ? bookDataState.children || [] : parentNodeInNewTree?.children || [];

        if (newSiblingsList && newSiblingsList.length > 0) {
          if (originalIndexInSiblings < newSiblingsList.length) {
            nextSelectedId = newSiblingsList[originalIndexInSiblings].id;
          } else {
            nextSelectedId = newSiblingsList[newSiblingsList.length - 1].id;
          }
        } else if (parentNodeInNewTree && parentNodeInNewTree.id !== 'root') {
          nextSelectedId = parentNodeInNewTree.id;
        } else if (bookDataState.children && bookDataState.children.length > 0) {
          nextSelectedId = bookDataState.children[0].id;
        } else {
          nextSelectedId = bookDataState.id;
        }
        setSelectedNodeId(nextSelectedId);
      }
      setLastDeletedNodeContext(null);
    }
  }, [lastDeletedNodeContext, bookDataState, selectedNodeId, toast, setSelectedNodeId, nodeToDeleteInfoForDialog]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !bookDataState) return null;
    if (selectedNodeId === 'root') return bookDataState;
    return findNodeById(bookDataState.children || [], selectedNodeId);
  }, [bookDataState, selectedNodeId]);

  const hasAnyChapters = useMemo(() => {
    return !!(bookDataState?.children && bookDataState.children.length > 0);
  }, [bookDataState]);

  const currentTocHeadings = useMemo(() => {
    if (!selectedNode || !selectedNode.content || !selectedNode.content.blocks) {
      return [];
    }
    const headings: TocHeading[] = [];
    let order = 0;
    selectedNode.content.blocks.forEach((block) => {
      let level = 0;
      switch (block.type) {
        case 'header-two':
          level = 2;
          break;
        case 'header-three':
          level = 3;
          break;
        case 'header-four':
          level = 4;
          break;
        case 'header-five':
          level = 5;
          break;
        default:
          break;
      }
      if (level >= 2 && level <= 5) {
        headings.push({
          id: block.key,
          text: block.text,
          level: level,
          order: order++,
        });
      }
    });
    return headings;
  }, [selectedNode]);

  const handleLeftResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      leftResizeDataRef.current = { initialMouseX: event.clientX, initialWidth: leftSidebarWidth };
      setIsResizingLeft(true);
    },
    [leftSidebarWidth]
  );

  const handleRightResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      rightResizeDataRef.current = {
        initialMouseX: event.clientX,
        initialWidth: rightSidebarWidth,
      };
      setIsResizingRight(true);
    },
    [rightSidebarWidth]
  );

  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (isResizingLeft) {
        const deltaX = event.clientX - leftResizeDataRef.current.initialMouseX;
        let newWidth = leftResizeDataRef.current.initialWidth + deltaX;
        newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(newWidth, MAX_SIDEBAR_WIDTH));
        setLeftSidebarWidth(newWidth);
      } else if (isResizingRight) {
        const deltaX = event.clientX - rightResizeDataRef.current.initialMouseX;
        let newWidth = rightResizeDataRef.current.initialWidth - deltaX;
        newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(newWidth, MAX_SIDEBAR_WIDTH));
        setRightSidebarWidth(newWidth);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingLeft, isResizingRight, setLeftSidebarWidth, setRightSidebarWidth]);

  const handleTriggerImportProject = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelectedForImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProjectFileToImport(file);
      setIsImportConfirmOpen(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const confirmImportProject = useCallback(async () => {
    if (!projectFileToImport) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        let importedData = JSON.parse(text);
        // console.log("Attempting to validate imported data:", JSON.parse(JSON.stringify(importedData)) );

        importedData = ensureValidContentStructureRecursive(importedData);

        if (isValidBookNode(importedData)) {
          // console.log("Imported data is valid.");
          setBookDataState(importedData);
          setSelectedNodeId(importedData.id === 'root' && importedData.children && importedData.children.length > 0 ? importedData.children[0].id : importedData.id);
          setExpandedNodeIds(new Set(['root']));
          setActiveTocHeadingId(null);
          setEditingNodeId(null);
          setBookStructureViewKey((prev) => prev + 1);

          toast({
            title: 'Project Imported',
            description: `"${importedData.title}" has been loaded.`,
          });
        } else {
          // console.error('Imported data failed validation.');
          toast({
            title: 'Import Error',
            description: 'The selected file is not a valid ComposeWrite project file or is corrupted. Check console for details.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        // console.error('Error importing project:', error);
        toast({
          title: 'Import Error',
          description: 'Could not read or parse the project file. Check console for details.',
          variant: 'destructive',
        });
      } finally {
        setIsImportConfirmOpen(false);
        setProjectFileToImport(null);
      }
    };
    reader.onerror = () => {
      toast({
        title: 'Import Error',
        description: 'Failed to read the project file.',
        variant: 'destructive',
      });
      setIsImportConfirmOpen(false);
      setProjectFileToImport(null);
    };
    reader.readAsText(projectFileToImport);
  }, [projectFileToImport, toast, setBookDataState, setSelectedNodeId, setExpandedNodeIds, setActiveTocHeadingId, setEditingNodeId, setBookStructureViewKey]);

  const handleOpenSettingsDialog = useCallback(() => {
    setIsSettingsDialogOpen(true);
  }, []);

  const handleCloseSettingsDialog = useCallback(() => {
    setIsSettingsDialogOpen(false);
  }, []);

  const handleOpenResetConfirmDialog = useCallback(() => {
    setIsResetConfirmDialogOpen(true);
  }, []);

  const handleCloseResetConfirmDialog = useCallback(() => {
    setIsResetConfirmDialogOpen(false);
  }, []);

  const handleConfirmResetApplicationData = useCallback(async () => {
    try {
      await deleteDatabase();
      localStorage.clear();

      setBookDataState(null);
      currentBookDataGlobalRef = null;

      toast({
        title: 'Application Reset',
        description: 'All local data has been deleted. The application will now reload.',
      });

      handleCloseResetConfirmDialog();
      setIsSettingsDialogOpen(false);

      setTimeout(() => {
        window.location.href = window.location.pathname;
      }, 1500);
    } catch (error) {
      console.error('Error resetting application data:', error);
      toast({
        title: 'Reset Error',
        description: 'Could not reset application data. Check console for details.',
        variant: 'destructive',
      });
      handleCloseResetConfirmDialog();
    }
  }, [toast, handleCloseResetConfirmDialog, router, setIsSettingsDialogOpen]);

  const handleToggleInternalBrowser = () => {
    setShowInternalBrowser(!showInternalBrowser);
  };

  const handleToggleImagePaste = () => {
    setShowImagePaste(!showImagePaste);
  };

  const canAnyBookNodeBeExpandedOrCollapsed = useMemo(() => {
    if (!bookDataState || !bookDataState.children || bookDataState.children.length === 0) return false;
    let hasExpandable = false;
    const traverse = (nodes: BookNode[]) => {
      for (const node of nodes) {
        if (hasExpandable) return;
        if (node.children && node.children.length > 0) {
          hasExpandable = true;
          return;
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    if (bookDataState.children) {
      traverse(bookDataState.children);
    }
    return hasExpandable;
  }, [bookDataState]);

  if (isLoadingDB || !bookDataState) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <p className="text-lg font-headline">Loading myBookHelper...</p>
      </div>
    );
  }

  const sidebarStyle: React.CSSProperties = {
    position: 'sticky',
    top: '0px', // This will be used if not overridden by inline style
    height: '100%', // This will be overridden
    zIndex: 30,
  };

  const stickyTopOffset = isHeaderMinimized ? '0px' : '48px';

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <MainHeader isMinimized={isHeaderMinimized} />

      <input type="file" ref={fileInputRef} className="hidden" accept=".json,.mybookhelper.json,.composewrite.json" onChange={handleFileSelectedForImport} />

      <div className={`flex flex-1 transition-all duration-300 ease-in-out ${isHeaderMinimized ? 'pt-0' : 'pt-12'} overflow-y-hidden`}>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleLeftSidebar}
          className="fixed left-4 h-8 w-8 flex-shrink-0 shadow-md border-border bg-card hover:bg-accent"
          style={{
            top: `calc(${stickyTopOffset} + 0.4rem)`,
            zIndex: 50,
          }}
          aria-label={isLeftSidebarOpen ? 'Close Item Structure' : 'Open Item Structure'}
        >
          {isLeftSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </Button>
        <aside
          style={{
            width: isLeftSidebarOpen ? `${leftSidebarWidth}px` : '0px',
            ...sidebarStyle, // Includes top: '0px'
            // top: stickyTopOffset, // Removed to use sidebarStyle.top or parent padding
            height: `calc(100vh - ${stickyTopOffset})`,
          }}
          className={`
            bg-card flex-shrink-0 transition-all duration-300 ease-in-out overflow-y-auto
            ${isLeftSidebarOpen ? 'border-r' : 'border-transparent'}
          `}
        >
          {isLeftSidebarOpen && (
            <BookStructureView
              key={`book-structure-${bookStructureViewKey}`}
              book={bookDataState}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              editingNodeId={editingNodeId}
              onSetEditingNodeId={setEditingNodeId}
              onUpdateNodeTitle={handleUpdateNodeTitle}
              expandedNodeIds={expandedNodeIds}
              onToggleNodeExpansion={handleToggleNodeExpansion}
              draggedNodeId={draggedNodeId}
              onSetDraggedNodeId={setDraggedNodeId}
              dropTargetInfo={dropTargetInfo}
              onSetDropTargetInfo={setDropTargetInfoInternal}
              onReorderNodes={handleReorderNodes}
              onAddNode={handleAddNode}
              onDeleteNode={openDeleteDialog}
              areAllNodesExpanded={areAllBookNodesExpanded}
              onToggleAllNodesExpansion={toggleAllBookNodesExpansion}
              canAnyNodeBeExpandedOrCollapsed={canAnyBookNodeBeExpandedOrCollapsed}
            />
          )}
        </aside>
        {isLeftSidebarOpen && (
          <div
            onMouseDown={handleLeftResizeMouseDown}
            className="w-1.5 cursor-col-resize flex-shrink-0 bg-border/30 hover:bg-accent/70 active:bg-accent transition-colors duration-150 ease-in-out"
            title="Resize Item Structure"
            style={{
              ...sidebarStyle, // Includes top: '0px'
              // top: stickyTopOffset, // Removed
              height: `calc(100vh - ${stickyTopOffset})`,
            }}
          />
        )}
        {/* Glavni sadržaj: Editor I (opcionalno) Interni preglednik */}
        {!showInternalBrowser ? (
          // Prikaz samo urednika kada interni preglednik nije aktivan
          <main className="flex-1 min-w-0 p-0" style={{ height: `calc(100vh - ${stickyTopOffset})` }}>
            {ContentEditorView && bookDataState && selectedNodeId && (
              <ContentEditorView
                ref={contentEditorRef}
                key={selectedNodeId || 'empty-editor'}
                selectedNode={selectedNode}
                onContentChange={handleUpdateNodeContent}
                scrollToBlockKey={activeScrollToBlockKey}
                onScrollComplete={handleScrollComplete}
                highlightBlockKey={highlightBlockInEditorKey}
                onHighlightComplete={handleEditorHighlightComplete}
                isToolbarVisible={isEditorToolbarVisible}
                toggleEditorToolbar={toggleEditorToolbar}
                isHeaderMinimized={isHeaderMinimized}
                onToggleHeaderMinimize={toggleHeaderMinimize}
                isWidePaddingActive={isWidePaddingActive}
                toggleWidePadding={toggleWidePadding}
                onActiveBlockInViewportChange={handleActiveBlockInEditorViewport}
                hasAnyChapters={hasAnyChapters}
                bookData={bookDataState}
                onTriggerImportProject={handleTriggerImportProject}
                onOpenSettings={handleOpenSettingsDialog}
                isLeftSidebarOpen={isLeftSidebarOpen} // <-- Proslijedi stanje lijeve bočne trake
                toggleLeftSidebar={toggleLeftSidebar} // <-- Proslijedi funkciju za toggle lijeve bočne trake (možda nije potrebno ako se gumb samo oslanja na stanje)
                // sRightSidebarOpen={isRightSidebarOpen} // <-- Proslijedi stanje desne bočne trake
                toggleRightSidebar={toggleRightSidebar} // <-- Proslijedi funkciju za toggle desne bočne trake (možda nije potrebno)
                showInternalBrowser={showInternalBrowser} // <-- Proslijedi stanje prikaza preglednika
                onToggleInternalBrowser={handleToggleInternalBrowser} // <-- Proslijedi funkciju za toggle preglednika
                onToggleImagePaste={handleToggleImagePaste}
              />
            )}
          </main>
        ) : (
          // Prikaz urednika i internog preglednika kada je preglednik aktivan
          // Koristimo novi flex kontejner unutar glavnog diva
          <div
            className="flex flex-1 min-w-0 p-0 editor-browser-container"
            style={{ height: `calc(100vh - ${stickyTopOffset})` }}
            ref={editorBrowserContainerRef} // Attach the ref to the main container div
          >
            {ContentEditorView && bookDataState && selectedNodeId && (
              <main
                className="p-0"
                style={{ width: `${editorBrowserSplitWidth * 100}%`, height: '100%' }}
                ref={editorElementRef} // Attach the ref to the main element wrapping ContentEditorView
              >
                {' '}
                {/* Postavi širinu za urednik */}
                {ContentEditorView && bookDataState && selectedNodeId && (
                  <ContentEditorView
                    key={selectedNodeId || 'empty-editor'}
                    selectedNode={selectedNode}
                    onContentChange={handleUpdateNodeContent}
                    scrollToBlockKey={activeScrollToBlockKey}
                    onScrollComplete={handleScrollComplete}
                    highlightBlockKey={highlightBlockInEditorKey}
                    onHighlightComplete={handleEditorHighlightComplete}
                    isToolbarVisible={isEditorToolbarVisible}
                    toggleEditorToolbar={toggleEditorToolbar}
                    isHeaderMinimized={isHeaderMinimized}
                    onToggleHeaderMinimize={toggleHeaderMinimize}
                    isWidePaddingActive={isWidePaddingActive}
                    toggleWidePadding={toggleWidePadding}
                    onActiveBlockInViewportChange={handleActiveBlockInEditorViewport}
                    hasAnyChapters={hasAnyChapters}
                    bookData={bookDataState}
                    onTriggerImportProject={handleTriggerImportProject}
                    onOpenSettings={handleOpenSettingsDialog}
                    isLeftSidebarOpen={isLeftSidebarOpen} // <-- Proslijedi stanje lijeve bočne trake
                    toggleLeftSidebar={toggleLeftSidebar} // <-- Proslijedi funkciju za toggle lijeve bočne trake (možda nije potrebno ako se gumb samo oslanja na stanje)
                    // isRightSidebarOpen={isRightSidebarOpen} // <-- Proslijedi stanje desne bočne trake
                    toggleRightSidebar={toggleRightSidebar} // <-- Proslijedi funkciju za toggle desne bočne trake (možda nije potrebno)
                    showInternalBrowser={showInternalBrowser} // <-- Proslijedi stanje prikaza preglednika
                    onToggleInternalBrowser={handleToggleInternalBrowser} // <-- Proslijedi funkciju za toggle preglednika
                    onToggleImagePaste={handleToggleImagePaste}
                  />
                )}
              </main>
            )}

            {/* Ovdje dodaj div za hvatač resize-a */}
            <div
              onMouseDown={handleEditorBrowserResizeMouseDown}
              className="w-1.5 cursor-col-resize flex-shrink-0 bg-border/30 hover:bg-accent/70 active:bg-accent transition-colors duration-150 ease-in-out"
              title="Resize Editor and Browser"
              style={{ height: '100%', zIndex: 10 }} // Osiguraj da resizer zauzme cijelu visinu
            />

            {/* Ovdje dodaj div za interni preglednik */}
            <div
              className="border-l bg-background" // Uklonjena klasa flex-1 i w-1/2
              style={{
                width: `${(1 - editorBrowserSplitWidth) * 100}%`,
                height: '100%',
                flexShrink: 0,
              }} // Dodan flexShrink: 0
            >
              {' '}
              {/* Postavi širinu i stilove za preglednik */}
              {/*<TestEditor />*/}
               <InternalBrowserView />  {/* Renderiraj komponentu preglednika */}
            </div>
          </div>
        )}{' '}
        {/* <--- Closing zagrada je SADA na ispravnom mjestu, nakon drugog diva */}
        {isRightSidebarOpen && (
          <div
            onMouseDown={handleRightResizeMouseDown}
            className="w-1.5 cursor-col-resize flex-shrink-0 bg-border/30 hover:bg-accent/70 active:bg-accent transition-colors duration-150 ease-in-out"
            title="Resize Table of Contents"
            style={{
              ...sidebarStyle, // Includes top: '0px'
              // top: stickyTopOffset, // Removed
              height: `calc(100vh - ${stickyTopOffset})`,
            }}
          />
        )}
        <aside
          style={{
            width: isRightSidebarOpen ? `${rightSidebarWidth}px` : '0px',
            ...sidebarStyle, // Includes top: '0px'
            // top: stickyTopOffset, // Removed
            height: `calc(100vh - ${stickyTopOffset})`,
          }}
          className={`
            bg-card flex-shrink-0 transition-all duration-300 ease-in-out overflow-y-auto
            ${isRightSidebarOpen ? 'border-l' : 'border-transparent p-0'}
          `}
        >
          {isRightSidebarOpen && (
            <TocView
              headings={currentTocHeadings}
              onHeadingSelect={handleTocItemSelect}
              activeTocHeadingId={activeTocHeadingId}
              isAutoScrollEnabled={isAutoScrollToCurrentPositionEnabled}
              onToggleAutoScroll={toggleAutoScrollToCurrentPosition}
            />
          )}
        </aside>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleRightSidebar}
          className="fixed right-4 h-8 w-8 flex-shrink-0 shadow-md border-border bg-card hover:bg-accent"
          style={{
            top: `calc(${stickyTopOffset} + 0.3rem)`,
            zIndex: 50,
          }}
          aria-label={isRightSidebarOpen ? 'Close Table of Contents' : 'Open Table of Contents'}
        >
          {isRightSidebarOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </Button>
      </div>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {nodeToDeleteInfoForDialog?.hasChildren
                ? `Item "${nodeToDeleteInfoForDialog.title}" has sub-items. What would you like to do?`
                : `This action will permanently delete the item "${nodeToDeleteInfoForDialog?.title || 'this item'}". This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>Cancel</AlertDialogCancel>
            {nodeToDeleteInfoForDialog?.hasChildren ? (
              <div className="flex flex-col space-y-2 mt-2 sm:mt-0 sm:flex-row sm:space-y-0 sm:space-x-2 sm:justify-end">
                <Button variant="outline" onClick={() => confirmDeleteNode('keepChildren')} className="sm:w-auto w-full justify-center">
                  Delete Item Only
                </Button>
                <Button variant="destructive" onClick={() => confirmDeleteNode('deleteAll')} className="sm:w-auto w-full justify-center">
                  Delete Item and Sub-items
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => confirmDeleteNode('deleteAll')} className="mt-2 sm:mt-0">
                Delete
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isImportConfirmOpen} onOpenChange={setIsImportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to import "{projectFileToImport?.name || 'this project'}"? This will replace your current project data. Unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsImportConfirmOpen(false);
                setProjectFileToImport(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmImportProject}>Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isFirstNodeModalOpen} onOpenChange={setIsFirstNodeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Book Title</DialogTitle>
            <DialogDescription>Please enter the title for your book. This will be the first chapter and will also be used for the project export filename.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={firstNodeTitleInput}
              onChange={(e) => setFirstNodeTitleInput(e.target.value)}
              placeholder="My Awesome Book Title"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && firstNodeTitleInput.trim()) confirmAddFirstNode();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsFirstNodeModalOpen(false);
                setFirstNodeTitleInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmAddFirstNode} disabled={!firstNodeTitleInput.trim()}>
              Confirm & Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showImagePaste && (
        <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg z-50">
          <ImagePasteComponent onImageInsert={handleImageInsert} />
        </div>
      )}

      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Application Settings</DialogTitle>
            <DialogDescription>Manage your application settings and preferences.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="appearance" className="w-full pt-2">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
              <TabsTrigger value="language">Language</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
            <TabsContent value="appearance" className="py-4">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Theme</h3>
                  <RadioGroup value={theme} onValueChange={handleThemeChange} className="mt-2 space-y-1">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="light" id="theme-light" />
                      <Label htmlFor="theme-light">Light</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dark" id="theme-dark" />
                      <Label htmlFor="theme-dark">Dark</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="system" id="theme-system" />
                      <Label htmlFor="theme-system">System</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <h3 className="text-lg font-medium">UI Density</h3>
                  <p className="text-sm text-muted-foreground">Adjust spacing and element sizes. (Coming soon)</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Sidebars</h3>
                  <p className="text-sm text-muted-foreground">Configure default widths and initial states. (Coming soon)</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Header</h3>
                  <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                    <Label htmlFor="header-minimized-switch" className="font-normal">
                      Minimize header on startup
                    </Label>
                    <Switch id="header-minimized-switch" checked={isHeaderMinimized} onCheckedChange={handleHeaderMinimizedSettingChange} />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Content Editor</h3>
                  <p className="text-sm text-muted-foreground">Customize toolbar, padding, default fonts. (Coming soon)</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="export" className="py-4">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Default Export Format</h3>
                  <p className="text-sm text-muted-foreground">Choose your preferred format for quick export. (Coming soon)</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">HTML Export Options</h3>
                  <p className="text-sm text-muted-foreground">Toggle TOC inclusion. (Coming soon)</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Markdown Export Options</h3>
                  <p className="text-sm text-muted-foreground">Toggle TOC inclusion. (Coming soon)</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">DOCX Export Options</h3>
                  <p className="text-sm text-muted-foreground">Toggle TOC inclusion. (Coming soon)</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="language" className="py-4">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Interface Language</h3>
                  <p className="text-sm text-muted-foreground">Select the application language. (Coming soon)</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Date & Time Format</h3>
                  <p className="text-sm text-muted-foreground">Choose your preferred date and time display format. (Coming soon)</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="data" className="py-4">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Data Management</h3>
                  <p className="text-sm text-muted-foreground">Manage your application data.</p>
                </div>
                <div>
                  <Button variant="destructive" onClick={handleOpenResetConfirmDialog} className="w-full sm:w-auto">
                    Reset Application Data...
                  </Button>
                  <p className="text-xs text-muted-foreground pt-1">This will permanently delete all project data from this browser. This action cannot be undone.</p>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Storage Information</h3>
                  <p className="text-sm text-muted-foreground">View details about local data usage. (Coming soon)</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="about" className="py-4">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">About myBookHelper</h3>
                <p className="text-sm text-muted-foreground">myBookHelper - Your personal book writing assistant.</p>
                <p className="text-xs text-muted-foreground">Version: 0.1.0 (Alpha)</p>
                <p className="text-sm text-muted-foreground"><a href="https://github.com/hartegg/myBookHelper" target="_blank">GitHub Repository</a></p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="sm:justify-end pt-4">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isResetConfirmDialogOpen} onOpenChange={setIsResetConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Reset Application Data</AlertDialogTitle>
            <AlertDialogDescription>
              Are you absolutely sure you want to delete all project data from this browser? This action cannot be undone. All your chapters, content, and structure will be permanently erased.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseResetConfirmDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleConfirmResetApplicationData}>
              Delete All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </div>
  );
}
