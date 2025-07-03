import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowRight, Home, FileText, Upload, Link as LinkIcon } from 'lucide-react';
import LinkManagerView from './LinkManagerView';

interface InternalBrowserViewProps {
  initialUrl?: string;
}

const InternalBrowserView: React.FC<InternalBrowserViewProps> = ({ initialUrl = 'about:blank' }) => {
  const [urlInput, setUrlInput] = useState('');
  const [currentIframeUrl, setCurrentIframeUrl] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isPdfUrl = (url: string): boolean => {
    return (
      url.toLowerCase().endsWith('.pdf') ||
      url.toLowerCase().includes('.pdf?') ||
      url.toLowerCase().includes('content-type=application/pdf') ||
      url.toLowerCase().includes('/pdf/') ||
      url.toLowerCase().includes('.pdf#')
    );
  };

  const formatPdfUrl = (url: string): string => {
    return url.startsWith('http') ? url : URL.createObjectURL(new Blob([url], { type: 'application/pdf' }));
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(event.target.value);
  };

  const handleNavigate = () => {
    if (urlInput.trim() === '') {
      setCurrentIframeUrl(null);
      setCurrentFileName('');
      return;
    }

    let urlToLoad = urlInput;
    if (!urlToLoad.startsWith('http://') && !urlToLoad.startsWith('https://')) {
      urlToLoad = 'https://' + urlToLoad;
    }

    setCurrentIframeUrl(urlToLoad);

    if (isPdfUrl(urlToLoad)) {
      const fileName = urlToLoad.split('/').pop()?.split('?')[0] || 'PDF document';
      setCurrentFileName(`📄 ${fileName}`);
    } else {
      setCurrentFileName('');
    }
  };

  const handleGoHome = () => {
    setCurrentIframeUrl(null);
    setUrlInput('');
    setCurrentFileName('');
  };

  const handleLinkClickFromManager = (linkUrl: string, openInNewTab?: boolean) => {
    if (openInNewTab === true) {
      const windowFeatures = 'noopener,noreferrer';
      window.open(linkUrl, '_blank', windowFeatures);
    } else {
      const formattedUrl = formatPdfUrl(linkUrl);
      setCurrentIframeUrl(formattedUrl);
      setUrlInput(linkUrl);

      if (isPdfUrl(linkUrl)) {
        const fileName = linkUrl.split('/').pop()?.split('?')[0] || 'PDF dokument';
        setCurrentFileName(`📄 ${fileName}`);
      } else {
        setCurrentFileName('');
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      const fileUrl = URL.createObjectURL(file);
      setCurrentIframeUrl(fileUrl);
      setUrlInput('');
      setCurrentFileName(`📄 ${file.name} (local file)`);
    } else if (file) {
      alert('Please choose PDF file.');
    }
  };

  useEffect(() => {
    if (iframeRef.current && currentIframeUrl !== null) {
      iframeRef.current.src = currentIframeUrl;
    } else if (iframeRef.current && iframeRef.current.src !== 'about:blank' && currentIframeUrl === null) {
      iframeRef.current.src = 'about:blank';
    }
  }, [currentIframeUrl]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '0.4rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Button variant="outline" size="sm" title="Load PDF file from file system" onClick={() => document.getElementById('pdf-upload')?.click()}>
          <Upload className="h-4 w-4 " />
          PDF
        </Button>

        <input id="pdf-upload" type="file" accept=".pdf,application/pdf" onChange={handleFileUpload} style={{ display: 'none' }} />

        <Input
          type="text"
          value={urlInput}
          onChange={handleInputChange}
          placeholder="Enter URL (support PDF)"
          style={{ flexGrow: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNavigate();
          }}
        />
        <Button onClick={handleNavigate} title="Idi na URL">
          <ArrowRight className="h-4 w-4 " />
        </Button>
        <Button variant="outline" onClick={handleGoHome} title="Početna Stranica">
          <Home className="h-4 w-4" />
        </Button>
      </div>

      {currentFileName && (
        <div
          style={{
            padding: '0.5rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '0.25rem',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: '#6c757d',
          }}
        >
          File: {currentFileName}
        </div>
      )}

      {currentIframeUrl !== null ? (
        <iframe ref={iframeRef} title="Internal Browser Content" style={{ flexGrow: 1, width: '100%', border: 'none', borderRadius: '0.25rem' }} />
      ) : (
        <LinkManagerView onLinkClick={handleLinkClickFromManager} />
      )}
    </div>
  );
};

export default InternalBrowserView;
