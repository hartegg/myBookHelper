import type { BookNode } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Plus, ChevronRight, ChevronDown, FolderPlus, Pencil, Trash2, FoldVertical, UnfoldVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface BookStructureViewProps {
  book: BookNode;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  editingNodeId: string | null;
  onSetEditingNodeId: (nodeId: string | null) => void;
  onUpdateNodeTitle: (nodeId: string, newTitle: string) => void;
  expandedNodeIds: Set<string>;
  onToggleNodeExpansion: (nodeId: string) => void;
  draggedNodeId: string | null;
  onSetDraggedNodeId: (nodeId: string | null) => void;
  dropTargetInfo: { nodeId: string; position: 'before' | 'after' | 'inside' } | null;
  onSetDropTargetInfo: (info: { nodeId: string; position: 'before' | 'after' | 'inside' } | null) => void;
  onReorderNodes: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onAddNode: (parentId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onToggleAllNodesExpansion?: () => void;
  areAllNodesExpanded?: boolean;
  canAnyNodeBeExpandedOrCollapsed?: boolean;
}

interface NodeItemProps {
  node: BookNode;
  depth: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  editingNodeId: string | null;
  onSetEditingNodeId: (nodeId: string | null) => void;
  onUpdateNodeTitle: (nodeId: string, newTitle: string) => void;
  expandedNodeIds: Set<string>;
  onToggleNodeExpansion: (nodeId: string) => void;
  draggedNodeId: string | null;
  onSetDraggedNodeId: (nodeId: string | null) => void;
  dropTargetInfo: { nodeId: string; position: 'before' | 'after' | 'inside' } | null;
  onSetDropTargetInfo: (info: { nodeId: string; position: 'before' | 'after' | 'inside' } | null) => void;
  onReorderNodes: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onOpenContextMenu: (event: React.MouseEvent, nodeId: string) => void;
}

const NodeItem: React.FC<NodeItemProps> = ({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
  editingNodeId,
  onSetEditingNodeId,
  onUpdateNodeTitle,
  expandedNodeIds,
  onToggleNodeExpansion,
  draggedNodeId,
  onSetDraggedNodeId,
  dropTargetInfo,
  onSetDropTargetInfo,
  onReorderNodes,
  onOpenContextMenu,
}) => {
  const isSelected = selectedNodeId === node.id;
  const isCurrentlyEditing = editingNodeId === node.id;
  // isExpandable should solely depend on whether the node has children
  const nodeHasChildren = node.children && node.children.length > 0;
  const isExpanded = nodeHasChildren && expandedNodeIds.has(node.id);
  const isBeingDragged = draggedNodeId === node.id;

  const [editableTitle, setEditableTitle] = useState(node.title);
  const interactiveDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditableTitle(node.title);
  }, [node.title]);

  useEffect(() => {
    if (isCurrentlyEditing && interactiveDivRef.current) {
      const inputElement = interactiveDivRef.current.querySelector('input');
      inputElement?.focus();
      inputElement?.select();
    }
  }, [isCurrentlyEditing]);

  const handleSave = () => {
    if (editableTitle.trim() && editableTitle.trim() !== node.title) {
      onUpdateNodeTitle(node.id, editableTitle.trim());
    }
    onSetEditingNodeId(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditableTitle(node.title);
      onSetEditingNodeId(null);
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onSetDraggedNodeId(node.id);
    event.dataTransfer.setData('text/plain', node.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedNodeId && draggedNodeId !== node.id) {
      const rect = event.currentTarget.getBoundingClientRect();
      const hoverClientY = event.clientY - rect.top;
      const hoverHeight = rect.height;

      let newPosition: 'before' | 'after' | 'inside' = 'inside';
      const threshold = hoverHeight * 0.25;

      if (hoverClientY < threshold) {
        newPosition = 'before';
      } else if (hoverClientY > hoverHeight - threshold) {
        newPosition = 'after';
      } else {
        newPosition = 'inside';
      }

      onSetDropTargetInfo({ nodeId: node.id, position: newPosition });
      event.dataTransfer.dropEffect = 'move';
    } else {
      onSetDropTargetInfo(null);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    if (dropTargetInfo && dropTargetInfo.nodeId === node.id) {
      onSetDropTargetInfo(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedIdFromData = event.dataTransfer.getData('text/plain');

    if (draggedIdFromData && dropTargetInfo && dropTargetInfo.nodeId === node.id && draggedIdFromData !== node.id) {
      onReorderNodes(draggedIdFromData, node.id, dropTargetInfo.position);
    }
    onSetDraggedNodeId(null);
    onSetDropTargetInfo(null);
  };

  const handleDragEnd = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSetDraggedNodeId(null);
    onSetDropTargetInfo(null);
  };

  const showDropBefore = dropTargetInfo?.nodeId === node.id && dropTargetInfo.position === 'before';
  const showDropAfter = dropTargetInfo?.nodeId === node.id && dropTargetInfo.position === 'after';
  const showDropInside = dropTargetInfo?.nodeId === node.id && dropTargetInfo.position === 'inside';

  return (
    <div style={{ paddingLeft: `${depth * 0.5}rem` }} className="relative">
      <div
        ref={interactiveDivRef}
        draggable={!isCurrentlyEditing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu(e, node.id);
        }}
        className={cn(
          'flex items-center justify-between p-1 rounded-md group relative',
          isSelected && !isCurrentlyEditing ? 'bg-accent/20' : '',
          !isCurrentlyEditing ? 'hover:bg-accent/10' : '',
          isBeingDragged ? 'opacity-50 cursor-grabbing' : 'cursor-grab',
          showDropBefore ? 'drop-target-before' : '',
          showDropAfter ? 'drop-target-after' : '',
          showDropInside ? 'drop-target-inside' : ''
        )}
      >
        {isCurrentlyEditing ? (
          <div className="flex items-center w-full py-1">
            <span className="w-7 h-7 mr-1 flex-shrink-0 flex items-center justify-center">
              {nodeHasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )
              ) : (
                <span className="w-4 h-4"></span>
              )}
            </span>
            <Input
              type="text"
              value={editableTitle}
              onChange={(e) => setEditableTitle(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
              className="h-8 p-1 text-left flex-1 text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center flex-grow min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 mr-0.5 flex-shrink-0"
                onClick={(e) => {
                  const clickedElement = e.target as HTMLElement;
                  const isDirectClickOnButtonOrIcon =
                    e.currentTarget === clickedElement || ((clickedElement.tagName === 'svg' || clickedElement.tagName === 'path') && e.currentTarget.contains(clickedElement));

                  if (e.button === 0 && isDirectClickOnButtonOrIcon) {
                    e.stopPropagation();
                    if (nodeHasChildren) {
                      // Only toggle if it actually has children
                      onToggleNodeExpansion(node.id);
                    }
                  }
                }}
                aria-label={isExpanded ? `Collapse ${node.title}` : `Expand ${node.title}`}
                disabled={!nodeHasChildren} // Disable if no children
              >
                {
                  nodeHasChildren ? ( // Check if node has children
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    ) // If yes, show appropriate chevron
                  ) : (
                    <span className="w-4 h-4"></span>
                  ) // If no, show spacer
                }
              </Button>

              <Button variant="ghost" className="flex-1 justify-start h-auto p-1 text-left min-w-0" onClick={() => onSelectNode(node.id)}>
                <span className="truncate font-body">{node.title}</span>
              </Button>
            </div>
          </>
        )}
      </div>
      {isExpanded &&
        node.children &&
        node.children.map(
          (
            child // Note: isExpanded implies nodeHasChildren is true
          ) => (
            <NodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              editingNodeId={editingNodeId}
              onSetEditingNodeId={onSetEditingNodeId}
              onUpdateNodeTitle={onUpdateNodeTitle}
              expandedNodeIds={expandedNodeIds}
              onToggleNodeExpansion={onToggleNodeExpansion}
              draggedNodeId={draggedNodeId}
              onSetDraggedNodeId={onSetDraggedNodeId}
              dropTargetInfo={dropTargetInfo}
              onSetDropTargetInfo={onSetDropTargetInfo}
              onReorderNodes={onReorderNodes}
              onOpenContextMenu={onOpenContextMenu}
            />
          )
        )}
    </div>
  );
};

export default function BookStructureView({
  book,
  selectedNodeId,
  onSelectNode,
  editingNodeId,
  onSetEditingNodeId,
  onUpdateNodeTitle,
  expandedNodeIds,
  onToggleNodeExpansion,
  draggedNodeId,
  onSetDraggedNodeId,
  dropTargetInfo,
  onSetDropTargetInfo,
  onReorderNodes,
  onAddNode,
  onDeleteNode,
  onToggleAllNodesExpansion,
  areAllNodesExpanded,
  canAnyNodeBeExpandedOrCollapsed,
}: BookStructureViewProps) {
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    nodeId: string | null;
  }>({ visible: false, x: 0, y: 0, nodeId: null });

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const invisibleTriggerRef = useRef<HTMLDivElement>(null);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false, nodeId: null }));
  }, []);

  const handleOpenContextMenu = useCallback(
    (event: React.MouseEvent, nodeId: string) => {
      if (invisibleTriggerRef.current) {
        invisibleTriggerRef.current.style.position = 'fixed';
        invisibleTriggerRef.current.style.top = `${event.clientY}px`;
        invisibleTriggerRef.current.style.left = `${event.clientX}px`;
        invisibleTriggerRef.current.style.width = '0px';
        invisibleTriggerRef.current.style.height = '0px';
      }

      const openNewMenu = () => {
        setContextMenu({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          nodeId,
        });
      };

      if (contextMenu.visible) {
        handleCloseContextMenu();
        requestAnimationFrame(openNewMenu);
      } else {
        openNewMenu();
      }
    },
    [contextMenu.visible, handleCloseContextMenu]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (event.button === 2) {
        // Ignore right-clicks for closing context menu
        return;
      }
      if (contextMenu.visible && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        if (invisibleTriggerRef.current && invisibleTriggerRef.current.contains(event.target as Node)) {
          // Click was on the invisible trigger itself, which means context menu was just opened.
          // Allow it to stay open for the DropdownMenu component to handle its own trigger.
          return;
        }
        handleCloseContextMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible, handleCloseContextMenu, contextMenuRef]); // contextMenuRef dependency added

  const handleContextMenuAction = (action: () => void) => {
    action();
    handleCloseContextMenu();
  };

  return (
    <Card className="h-full flex flex-col border-0 rounded-none shadow-none">
      <CardHeader className="p-1.5 border-b flex flex-row items-center gap-1 sticky top-0 z-10 bg-card">
        <div className="flex-grow flex justify-center items-center gap-1">
          {onToggleAllNodesExpansion && typeof areAllNodesExpanded === 'boolean' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleAllNodesExpansion}
              title={areAllNodesExpanded ? 'Collapse All Items' : 'Expand All Items'}
              className="h-8 w-8"
              disabled={!canAnyNodeBeExpandedOrCollapsed}
            >
              {areAllNodesExpanded ? <FoldVertical className="h-5 w-5" /> : <UnfoldVertical className="h-5 w-5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onAddNode(null)} title="Add New Item To Project Root" className="h-8 w-8" aria-label="Add new item to project root">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1">
        <ScrollArea className="h-full p-2">
          {(book.children || []).map((child) => (
            <NodeItem
              key={child.id}
              node={child}
              depth={0}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              editingNodeId={editingNodeId}
              onSetEditingNodeId={onSetEditingNodeId}
              onUpdateNodeTitle={onUpdateNodeTitle}
              expandedNodeIds={expandedNodeIds}
              onToggleNodeExpansion={onToggleNodeExpansion}
              draggedNodeId={draggedNodeId}
              onSetDraggedNodeId={onSetDraggedNodeId}
              dropTargetInfo={dropTargetInfo}
              onSetDropTargetInfo={onSetDropTargetInfo}
              onReorderNodes={onReorderNodes}
              onOpenContextMenu={handleOpenContextMenu}
            />
          ))}
          {(!book.children || book.children.length === 0) && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No items yet. Click the <Plus size={16} className="inline align-middle mx-1" /> button above to add your first item.
            </p>
          )}
        </ScrollArea>
      </CardContent>

      <DropdownMenu
        open={contextMenu.visible}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCloseContextMenu();
        }}
      >
        <DropdownMenuTrigger asChild>
          {/* This div is positioned by handleOpenContextMenu to make the DropdownMenu appear at mouse position */}
          <div ref={invisibleTriggerRef} />
        </DropdownMenuTrigger>
        {contextMenu.visible && contextMenu.nodeId && (
          <DropdownMenuContent
            ref={contextMenuRef}
            className="w-56"
            // align="start" // Default is start, controlled by invisibleTriggerRef positioning
            // side="bottom" // Default is bottom, controlled by invisibleTriggerRef positioning
            sideOffset={5} // Small offset from the trigger point
            onCloseAutoFocus={(e) => e.preventDefault()} // Prevent focus shift on close
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenuAction(() => onAddNode(contextMenu.nodeId));
              }}
            >
              <FolderPlus className="mr-2 h-4 w-4" />
              <span>Add Sub-item</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenuAction(() => {
                  if (contextMenu.nodeId) {
                    onSelectNode(contextMenu.nodeId); // Select the node first
                    onSetEditingNodeId(contextMenu.nodeId); // Then set it to editing
                  }
                });
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              <span>Rename Item</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                if (contextMenu.nodeId) {
                  e.stopPropagation(); // Prevent any parent handlers
                  handleContextMenuAction(() => onDeleteNode(contextMenu.nodeId!)); // Ensure nodeId is not null
                }
              }}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete Item</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </Card>
  );
}
