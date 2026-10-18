import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { screenshot } from './bridge';
import { App } from './App';
window.screenshot=screenshot;
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
