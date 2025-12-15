import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import type { ComponentType } from 'react';

const AppComponent = (App as unknown) as ComponentType<any>;

createRoot(document.getElementById('root')!).render(<AppComponent />);
