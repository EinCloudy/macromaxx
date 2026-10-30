import React from 'react';
import { Icon } from './icons.jsx';
import { keyFontSize, keyTextLayout, scrollingKeyText, stackedKeyText, DEFAULT_FONT_SIZE } from '../shared/key-text.js';

let context;
export function KeyArtwork({ keyData, active = false, defaultFontSize = DEFAULT_FONT_SIZE }) {
  context ||= document.createElement('canvas').getContext('2d');
  const fontSize = keyFontSize(keyData, defaultFontSize);
  context.font = `500 ${fontSize}px sans-serif`;
  const measure = (text) => context.measureText(text).width;
  const stacked = stackedKeyText(keyData, fontSize, measure);
  const scroll = stacked ? null : scrollingKeyText(keyData.label, keyData.scrollFrame, measure, keyData.scrollSpeed);
  const layout = stacked || keyTextLayout(scroll ? 'X' : keyData.label, fontSize, measure);
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
        {stacked ? stacked.lines.map((line, i) => <span key={i} style={{ display: 'block', margin: `0 ${percent(8)}`, overflow: 'hidden' }}>{line.scroll ? <span style={{ display: 'block', position: 'relative', textAlign: 'left', transform: `translateX(${units(-line.scroll.offset)})` }}>{line.text}<span style={{ position: 'absolute', left: units(line.scroll.width + line.scroll.gap) }}>{line.text}</span></span> : line.text}</span>) : scroll ? <span style={{ display: 'block', position: 'relative', textAlign: 'left', transform: `translateX(${units(-scroll.offset)})` }}>{scroll.text}<span style={{ position: 'absolute', left: units(scroll.width + scroll.gap) }}>{scroll.text}</span></span> : layout.lines.join('\n')}
      </span>
    </div>
  );
}
