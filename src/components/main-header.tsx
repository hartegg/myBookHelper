import { cn } from '@/lib/utils';

interface MainHeaderProps {
  isMinimized: boolean;
  // Props related to File menu are removed
}

export default function MainHeader({ isMinimized }: MainHeaderProps) {
  // Handler functions related to File menu are removed

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-card px-3 transition-all duration-300 ease-in-out',
        isMinimized ? 'h-0 overflow-hidden border-b-0 shadow-none' : 'h-12 border-b shadow-sm'
      )}
    >
      <div className="flex items-center gap-2">
        {/* Toggle buttons for sidebars are removed from here */}
        <h1 className="text-lg font-headline font-semibold text-primary">MyBookHelper</h1>
      </div>

      <div className="flex-1 flex justify-center items-center">{/* File Menubar is removed from here */}</div>

      <div className="flex items-center gap-2">{/* Toggle buttons for sidebars are removed from here */}</div>
    </header>
  );
}
