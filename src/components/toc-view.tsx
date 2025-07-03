'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, ChevronDown, FoldVertical, UnfoldVertical, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TocHeading {
  id: string;
  level: number;
  text: string;
  order: number;
}

interface TocTreeNode extends TocHeading {
  children: TocTreeNode[];
  parent?: TocTreeNode;
}

interface TocViewProps {
  headings: TocHeading[];
  onHeadingSelect: (blockKey: string) => void;
  activeTocHeadingId: string | null;
  isAutoScrollEnabled: boolean;
  onToggleAutoScroll: () => void;
}

const buildTocTree = (headings: TocHeading[]): TocTreeNode[] => {
  const sortedHeadings = [...headings].sort((a, b) => a.order - b.order);
  const tree: TocTreeNode[] = [];
  const map: { [level: number]: TocTreeNode } = {};

  sortedHeadings.forEach((heading) => {
    const node: TocTreeNode = { ...heading, children: [] };
    let parentLevel = heading.level - 1;

    while (parentLevel >= 2 && !map[parentLevel]) {
      parentLevel--;
    }

    if (parentLevel >= 2 && map[parentLevel]) {
      map[parentLevel].children.push(node);
      node.parent = map[parentLevel];
    } else {
      tree.push(node);
    }
    map[heading.level] = node;

    for (let l = heading.level + 1; l <= 5; l++) {
      delete map[l];
    }
  });
  return tree;
};

interface TocItemProps {
  node: TocTreeNode;
  depth: number;
  onSelect: (blockKey: string) => void;
  expandedIds: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  isLastChildInSiblingList: boolean;
  activeTocId: string | null;
  highlightedId: string | null;
  ancestorIsLastStatus: boolean[];
}

const LINE_INDENT_REM = 1.25;
const LINE_OFFSET_REM = 0.625;

const TocItem: React.FC<TocItemProps> = ({ node, depth, onSelect, expandedIds, onToggleExpand, isLastChildInSiblingList, activeTocId, highlightedId, ancestorIsLastStatus }) => {
  const isExpandable = node.children && node.children.length > 0;
  const isExpanded = isExpandable && expandedIds.has(node.id);
  const isHighlighted = node.id === highlightedId;
  const isActive = node.id === activeTocId;

  return (
    <div className="toc-item-wrapper" id={`toc-item-${node.id}`}>
      {ancestorIsLastStatus.map((isAncestorLast, idx) =>
        !isAncestorLast ? (
          <span
            key={`ancestor-line-${node.id}-${idx}`}
            className="toc-vertical-line toc-ancestor-line"
            style={{
              left: `${idx * LINE_INDENT_REM + LINE_OFFSET_REM}rem`,
              top: 0,
              bottom: 0,
            }}
          />
        ) : null
      )}

      {depth > 0 && (
        <span
          className={cn('toc-vertical-line', {
            'toc-branch-line-half': isLastChildInSiblingList,
            'toc-branch-line-full': !isLastChildInSiblingList,
          })}
          style={{
            left: `${(depth - 1) * LINE_INDENT_REM + LINE_OFFSET_REM}rem`,
          }}
        />
      )}

      <div
        className={cn('toc-content-container bg-card group flex items-center rounded-md hover:bg-accent/10 transition-colors duration-200 ease-in-out', {
          'bg-accent/20': isActive,
          'bg-accent/30': isHighlighted && !isActive,
        })}
        style={{ paddingLeft: `${depth * LINE_INDENT_REM}rem` }}
      >
        {isExpandable ? (
          <Button
            variant="ghost"
            size="icon"
            className="toc-chevron mr-1 h-7 w-7 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            aria-label={isExpanded ? `Collapse ${node.text}` : `Expand ${node.text}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ) : (
          <span className="toc-spacer mr-1 h-7 w-7 flex-shrink-0" style={{ marginLeft: '0rem' }}></span>
        )}
        <a
          href={`#${node.id}`}
          className="toc-link flex-1 cursor-pointer break-words py-1.5 text-sm font-body"
          onClick={(e) => {
            e.preventDefault();
            onSelect(node.id);
          }}
          title={`Scroll to: ${node.text}`}
        >
          {node.text}
        </a>
      </div>

      {isExpanded && node.children && node.children.length > 0 && (
        <div className="toc-children-container">
          {node.children.map((child, index) => (
            <TocItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              isLastChildInSiblingList={index === node.children.length - 1}
              activeTocId={activeTocId}
              highlightedId={highlightedId}
              ancestorIsLastStatus={[...ancestorIsLastStatus, isLastChildInSiblingList]}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function TocView({ headings, onHeadingSelect, activeTocHeadingId, isAutoScrollEnabled, onToggleAutoScroll }: TocViewProps) {
  const [tree, setTree] = useState<TocTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [areAllNodesExpanded, setAreAllNodesExpanded] = useState(false);
  const [canAnyNodeBeExpandedState, setCanAnyNodeBeExpandedState] = useState(false);
  const [highlightedHeadingId, setHighlightedHeadingId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const newTreeBuilt = buildTocTree(headings);
    setTree(newTreeBuilt);

    let newTreeHasExpandableNodes = false;
    const findExpandable = (nodes: TocTreeNode[]) => {
      if (!nodes) return;
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          newTreeHasExpandableNodes = true;
          return;
        }
        if (node.children) {
          findExpandable(node.children);
          if (newTreeHasExpandableNodes) return;
        }
      }
    };
    if (newTreeBuilt.length > 0) {
      findExpandable(newTreeBuilt);
    }
    setCanAnyNodeBeExpandedState(newTreeHasExpandableNodes);

    if (newTreeHasExpandableNodes) {
      const idsToInitiallyExpand = new Set<string>();
      const collectAllExpandableIds = (nodes: TocTreeNode[]) => {
        nodes.forEach((node) => {
          if (node.children && node.children.length > 0) {
            idsToInitiallyExpand.add(node.id);
            collectAllExpandableIds(node.children);
          }
        });
      };
      collectAllExpandableIds(newTreeBuilt);
      setExpandedIds(idsToInitiallyExpand);
      setAreAllNodesExpanded(true);
    } else {
      setExpandedIds(new Set());
      setAreAllNodesExpanded(false);
    }
  }, [headings]);

  useEffect(() => {
    if (isAutoScrollEnabled && activeTocHeadingId) {
      const attemptScroll = () => {
        const activeElement = document.getElementById(`toc-item-${activeTocHeadingId}`);
        if (activeElement) {
          activeElement.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
          });
        }
      };
      const timerId = setTimeout(attemptScroll, 0);
      return () => clearTimeout(timerId);
    }
  }, [activeTocHeadingId, isAutoScrollEnabled]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const handleToggleExpand = useCallback(
    (nodeId: string) => {
      setExpandedIds((prevExpandedIds) => {
        const newExpandedSet = new Set(prevExpandedIds);
        if (newExpandedSet.has(nodeId)) {
          newExpandedSet.delete(nodeId);
        } else {
          newExpandedSet.add(nodeId);
        }

        if (canAnyNodeBeExpandedState) {
          let allCurrentlyExpanded = true;
          const checkAll = (nodes: TocTreeNode[]) => {
            if (!nodes) return;
            for (const n of nodes) {
              if (n.children && n.children.length > 0) {
                if (!newExpandedSet.has(n.id)) {
                  allCurrentlyExpanded = false;
                  return;
                }
                if (allCurrentlyExpanded) {
                  checkAll(n.children);
                  if (!allCurrentlyExpanded) return;
                }
              }
            }
          };
          checkAll(tree);
          setAreAllNodesExpanded(allCurrentlyExpanded);
        } else {
          setAreAllNodesExpanded(false);
        }
        return newExpandedSet;
      });
    },
    [tree, canAnyNodeBeExpandedState]
  );

  const handleToggleAllExpansion = () => {
    if (!canAnyNodeBeExpandedState) return; // Do nothing if no nodes can be expanded/collapsed

    setAreAllNodesExpanded((prevAreAllExpanded) => {
      const newExpansionState = !prevAreAllExpanded;
      if (newExpansionState) {
        const allIdsToExpand = new Set<string>();
        const expandRecursive = (nodes: TocTreeNode[]) => {
          if (!nodes) return;
          nodes.forEach((node) => {
            if (node.children && node.children.length > 0) {
              allIdsToExpand.add(node.id);
              expandRecursive(node.children);
            }
          });
        };
        expandRecursive(tree);
        setExpandedIds(allIdsToExpand);
      } else {
        setExpandedIds(new Set<string>());
      }
      return newExpansionState;
    });
  };

  const handleTocItemClick = useCallback(
    (blockKey: string) => {
      onHeadingSelect(blockKey);

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      setHighlightedHeadingId(blockKey);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedHeadingId(null);
        highlightTimerRef.current = null;
      }, 1500);
    },
    [onHeadingSelect]
  );

  const noHeadings = headings.length === 0;

  return (
    <Card className="h-full flex flex-col border-0 rounded-none shadow-none">
      <CardHeader className="p-1.5 border-b flex flex-row items-center justify-center gap-1 sticky top-0 z-10 bg-card">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleAllExpansion}
            title={areAllNodesExpanded ? 'Collapse All' : 'Expand All'}
            className="h-8 w-8"
            disabled={noHeadings || !canAnyNodeBeExpandedState}
          >
            {areAllNodesExpanded ? <FoldVertical className="h-5 w-5" /> : <UnfoldVertical className="h-5 w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleAutoScroll}
            title={isAutoScrollEnabled ? 'Disable auto-scroll to current position' : 'Enable auto-scroll to current position'}
            className={cn('h-8 w-8', isAutoScrollEnabled && 'bg-accent/20 text-accent-foreground')}
            disabled={noHeadings}
          >
            <LocateFixed className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-y-hidden">
        <ScrollArea className="h-full w-full p-2">
          {tree && tree.length > 0 ? (
            tree.map((node, index) => (
              <TocItem
                key={node.id}
                node={node}
                depth={0}
                onSelect={handleTocItemClick}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                isLastChildInSiblingList={index === tree.length - 1}
                activeTocId={activeTocHeadingId}
                highlightedId={highlightedHeadingId}
                ancestorIsLastStatus={[]}
              />
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground font-body">No H2-H5 headings in the current item to display in TOC.</p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
