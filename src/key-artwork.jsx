import React from 'react';
import { Icon } from './icons.jsx';
import { keyFontSize, keyTextLayout, scrollingKeyText, DEFAULT_FONT_SIZE } from '../shared/key-text.js';

let context;
export function KeyArtwork({ keyData, active = false, defaultFontSize = DEFAULT_FONT_SIZE }) {
  context ||= document.createElement('canvas').getContext('2d');
  const fontSize = keyFontSize(keyData, defaultFontSize);
  context.font = `500 ${fontSize}px sans-serif`;
  const scroll = scrollingKeyText(keyData.label, keyData.scrollFrame, (text) => context.measureText(text).width, keyData.scrollSpeed);
  const layout = keyTextLayout(scroll ? 'X' : keyData.label, fontSize, (text) => context.measureText(text).width);
  const percent = (value) => `${(value / 144) * 100}%`;
  const units = (value) => `${(value / 144) * 100}cqw`;
  return (
    <div
      className="key-artwork"
      style={{
        position: 'absolute',
        inset: 0,
        containerType: 'inline-size',
        borderRadius: 'inherit',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {keyData.image ? (
        <img
          src={keyData.image}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 'inherit',
          }}
        />
      ) : (
        <Icon
          name={keyData.icon}
          color={active ? '#86efac' : keyData.color}
          style={{
            position: 'absolute',
            left: percent((144 - layout.iconSize) / 2),
            top: percent(layout.iconY),
            width: percent(layout.iconSize),
            height: percent(layout.iconSize),
          }}
        />
      )}
      {keyData.image && layout.lines.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: percent(layout.textTop - 4),
            left: 0,
            right: 0,
            bottom: 0,
            background: '#0009',
          }}
        />
      )}
      <span
        className="key-face-label"
        style={{
          position: 'absolute',
          left: scroll ? percent(8) : 0,
          top: percent(layout.textTop),
          width: scroll ? percent(128) : '100%',
          maxWidth: 'none',
          padding: 0,
          margin: 0,
          color: '#f8f8ff',
          fontFamily: 'sans-serif',
          fontSize: units(fontSize),
          fontWeight: 500,
          lineHeight: units(layout.lineHeight),
          textAlign: 'center',
          whiteSpace: 'pre',
          overflow: 'hidden',
        }}
      >
        {scroll ? <span style={{ display: 'block', position: 'relative', textAlign: 'left', transform: `translateX(${units(-scroll.offset)})` }}>{scroll.text}<span style={{ position: 'absolute', left: units(scroll.width + scroll.gap) }}>{scroll.text}</span></span> : layout.lines.join('\n')}
      </span>
    </div>
  );
}
