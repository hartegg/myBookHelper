'use client';

import React from 'react';
import TestEditor from '@/components/image-resize-editor/test-editor';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import 'draft-js/dist/Draft.css'; // Ensure Draft.css is imported for basic styling
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';

export default function TestImageEditorPage() {
  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        height: 'calc(100vh - 40px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ marginBottom: '15px', flexShrink: 0 }}>
        <Link href="/" passHref>
          <Button variant="outline">Back to Main App</Button>
        </Link>
      </div>

      <div style={{ marginTop: '0px', marginBottom: '20px', flexGrow: 1, border: '1px solid #ccc' }}>
        <TestEditor />
      </div>
    </div>
  );
}
