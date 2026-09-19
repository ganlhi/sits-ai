import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InspectorApp } from './inspector/InspectorApp';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <InspectorApp />
  </StrictMode>,
);
