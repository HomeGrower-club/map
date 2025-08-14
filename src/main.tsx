import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setLocale, getLocale, isLocale } from './paraglide/runtime'

// Initialize language based on browser preference if no cookie is set
const initializeLanguage = () => {
  try {
    // Check if a locale is already set (from cookie)
    const currentLocale = getLocale();
    
    // If it's the default (baseLocale) and no cookie exists, check browser preference
    if (currentLocale === 'en' && !document.cookie.includes('PARAGLIDE_LOCALE')) {
      // Get browser language preference
      const browserLang = navigator.language || navigator.languages?.[0];
      
      if (browserLang) {
        // Extract the language code (e.g., 'de' from 'de-DE')
        const langCode = browserLang.split('-')[0].toLowerCase();
        
        // If browser is in German, set the locale to German
        if (langCode === 'de' && isLocale('de')) {
          setLocale('de', { reload: false });
        }
      }
    }
  } catch (error) {
    console.warn('Failed to initialize language preference:', error);
  }
};

// Initialize language before rendering
initializeLanguage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
