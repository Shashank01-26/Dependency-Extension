import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Reset browser defaults so the flex column layout fills the webview correctly
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
`;
document.head.appendChild(style);

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
