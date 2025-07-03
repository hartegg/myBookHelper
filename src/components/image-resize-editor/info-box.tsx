import React from 'react';

interface InfoBoxProps {
  currentWidth: number;
  currentHeight: number;
  displayedFileSize: string | null;
  isSelected: boolean;
  dimensionsInitialized: boolean;
}

const InfoBox: React.FC<InfoBoxProps> = ({ currentWidth, currentHeight, displayedFileSize, isSelected, dimensionsInitialized }) => {
  if (!isSelected || !dimensionsInitialized || currentWidth <= 0 || currentHeight <= 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '5px',
        right: '5px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '5px 6px',
        borderRadius: '3px',
        fontSize: '10px',
        lineHeight: '1.4',
        zIndex: 11,
      }}
    >
      Width: {Math.round(currentWidth)}px, Height: {Math.round(currentHeight)}px
      {displayedFileSize && (
        <>
          <br />
          Size: {displayedFileSize}
        </>
      )}{' '}
    </div>
  );
};

export default InfoBox;
