import type { RawDraftContentState } from 'draft-js';

export interface BookNode {
  id: string;
  title: string;
  content: RawDraftContentState; // Changed to Draft.js RawDraftContentState
  children?: BookNode[];
}
